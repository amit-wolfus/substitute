import type { Config } from "./config";
import { loadState, saveState, type State } from "./state";
import type { BazarrClient } from "./clients/bazarr";
import { isMovie, type MissingSubtitle, type WantedEntry } from "./clients/bazarr";
import type { SonarrClient } from "./clients/SonarrClient";
import type { RadarrClient } from "./clients/RadarrClient";
import type { OpenSubtitlesClient } from "./clients/OpenSubtitlesClient";

type Candidate = {
  item: WantedEntry;
  lang: MissingSubtitle;
};

function candidateKey(c: Candidate, dryRun = false): string {
  const base = isMovie(c.item)
    ? `radarr:${c.item.radarrId}:${c.lang.code2}`
    : `sonarr:${c.item.sonarrEpisodeId}:${c.lang.code2}`;
  return dryRun ? `dryRun:${base}` : base;
}

function candidateLabel(c: Candidate): string {
  if (isMovie(c.item)) return `movie="${c.item.title}"`;
  return `show="${c.item.seriesTitle}" ep=${c.item.episodeNumber}`;
}

function log(level: "info" | "debug", tag: string, msg: string): void {
  console.log(`[substitute] ${level.padEnd(5)} ${tag.padEnd(15)} ${msg}`);
}

export class SubstituteService {
  constructor(
    private readonly config: Config,
    private readonly bazarr: BazarrClient,
    private readonly sonarr: SonarrClient,
    private readonly radarr: RadarrClient,
    private readonly openSubtitles: OpenSubtitlesClient,
  ) {}

  async runOnce(): Promise<void> {
    const state = await loadState(this.config.statePath);
    const nowMs = Date.now();

    const { movies, episodes } = await this.bazarr.getWanted();
    const candidates: Candidate[] = [
      ...movies.flatMap((item) => item.missingSubtitles.map((lang) => ({ item, lang }))),
      ...episodes.flatMap((item) => item.missingSubtitles.map((lang) => ({ item, lang }))),
    ];

    log(
      "info",
      "poll-start",
      `movies=${movies.length} episodes=${episodes.length} candidates=${candidates.length}`,
    );

    let passed = 0, allowlistSkip = 0, graceSkip = 0, cooldownSkip = 0;

    for (const c of candidates) {
      const key = candidateKey(c);
      const label = candidateLabel(c);

      if (
        this.config.languageAllowlist.length > 0 &&
        !this.config.languageAllowlist.includes(c.lang.code2)
      ) {
        log("debug", "allowlist-skip", `${label} lang=${c.lang.code2}`);
        allowlistSkip++;
        continue;
      }

      const entry = state.items[key];

      if (!entry) {
        state.items[key] = { firstSeenMs: nowMs, lastActedMs: null };
        log("info", "first-seen", `${label} lang=${c.lang.code2}`);
        graceSkip++;
        continue;
      }

      const elapsedSinceFirstSeenMs = nowMs - entry.firstSeenMs;
      if (elapsedSinceFirstSeenMs < this.config.graceMs) {
        const pendingMin = Math.ceil((this.config.graceMs - elapsedSinceFirstSeenMs) / 60_000);
        log(
          "debug",
          "grace-skip",
          `${label} lang=${c.lang.code2} firstSeenAgoMin=${Math.floor(elapsedSinceFirstSeenMs / 60_000)} gracePendingMin=${pendingMin}`,
        );
        graceSkip++;
        continue;
      }

      if (entry.lastActedMs !== null) {
        const elapsedSinceActedMs = nowMs - entry.lastActedMs;
        if (elapsedSinceActedMs < this.config.recheckCooldownMs) {
          const pendingHr = Math.ceil(
            (this.config.recheckCooldownMs - elapsedSinceActedMs) / 3_600_000,
          );
          log(
            "debug",
            "cooldown-skip",
            `${label} lang=${c.lang.code2} lastActedAgoHr=${Math.floor(elapsedSinceActedMs / 3_600_000)} cooldownPendingHr=${pendingHr}`,
          );
          cooldownSkip++;
          continue;
        }
      }

      passed++;
      await this.processCandidate(c, state);
    }

    await saveState(this.config.statePath, state);
    log(
      "info",
      "poll-done",
      `total=${candidates.length} passed=${passed} graceSkip=${graceSkip} cooldownSkip=${cooldownSkip} allowlistSkip=${allowlistSkip}`,
    );
  }

  private async processCandidate(c: Candidate, state: State): Promise<void> {
    const label = candidateLabel(c);
    const nowMs = Date.now();

    const results = await this.bazarr.manualSearch(c.item, c.lang);
    const match = results
      .filter(
        (r) =>
          r.language === c.lang.code2 &&
          r.forced === c.lang.forced &&
          r.hearingImpaired === c.lang.hi,
      )
      .sort((a, b) => b.score - a.score)[0];

    if (!match) {
      log("info", "no-bazarr-match", `${label} lang=${c.lang.code2} — no match found → step 5+ not yet implemented`);
      return;
    }

    const releaseTag = match.releaseInfo[0] ?? "unknown";
    const actKey = candidateKey(c, this.config.dryRun);

    if (this.config.dryRun) {
      log("info", "would-download", `${label} lang=${c.lang.code2} provider=${match.provider} release="${releaseTag}"`);
    } else {
      await this.bazarr.downloadSubtitle(c.item, c.lang, match);
      log("info", "bazarr-match", `${label} lang=${c.lang.code2} provider=${match.provider} release="${releaseTag}"`);
    }

    const entry = state.items[actKey];
    if (entry) {
      entry.lastActedMs = nowMs;
    } else {
      state.items[actKey] = { firstSeenMs: nowMs, lastActedMs: nowMs };
    }
  }
}
