import type { Config } from "./config";
import { loadState, saveState, type State } from "./state";
import type { BazarrClient } from "./clients/bazarr";
import {
  isMovie,
  type MissingSubtitle,
  type WantedEntry,
  type WantedEpisode,
  type WantedMovie,
} from "./clients/bazarr";
import type { SonarrClient } from "./clients/SonarrClient";
import type { RadarrClient } from "./clients/RadarrClient";

type Candidate = {
  item: WantedEntry;
  lang: MissingSubtitle;
};

type PollCounters = {
  passed: number;
  allowlistSkip: number;
  graceSkip: number;
  cooldownSkip: number;
};

function buildCandidates(movies: WantedMovie[], episodes: WantedEpisode[]): Candidate[] {
  return [
    ...movies.flatMap((item) => item.missingSubtitles.map((lang) => ({ item, lang }))),
    ...episodes.flatMap((item) => item.missingSubtitles.map((lang) => ({ item, lang }))),
  ];
}

function candidateKey(c: Candidate): string {
  return isMovie(c.item)
    ? `radarr:${c.item.radarrId}:${c.lang.code2}`
    : `sonarr:${c.item.sonarrEpisodeId}:${c.lang.code2}`;
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
  ) {}

  async runOnce(): Promise<void> {
    const state = await loadState(this.config.statePath);
    const nowMs = Date.now();

    const { movies, episodes } = await this.bazarr.getWanted();
    const candidates = buildCandidates(movies, episodes);

    log("info", "poll-start", `movies=${movies.length} episodes=${episodes.length} candidates=${candidates.length}`);

    const counters: PollCounters = { passed: 0, allowlistSkip: 0, graceSkip: 0, cooldownSkip: 0 };
    for (const c of candidates) {
      await this.handleCandidate(c, state, nowMs, counters);
    }

    await saveState(this.config.statePath, state);
    log(
      "info",
      "poll-done",
      `total=${candidates.length} passed=${counters.passed} graceSkip=${counters.graceSkip} cooldownSkip=${counters.cooldownSkip} allowlistSkip=${counters.allowlistSkip}`,
    );
  }

  private async handleCandidate(
    c: Candidate,
    state: State,
    nowMs: number,
    counters: PollCounters,
  ): Promise<void> {
    const key = candidateKey(c);
    const label = candidateLabel(c);
    const entry = state.items[key];

    if (this.isExcludedByAllowlist(c)) {
      log("debug", "allowlist-skip", `${label} lang=${c.lang.code2}`);
      counters.allowlistSkip++;
    } else if (!entry) {
      state.items[key] = { firstSeenMs: nowMs, lastActedMs: null };
      log("info", "first-seen", `${label} lang=${c.lang.code2}`);
      counters.graceSkip++;
    } else if (nowMs - entry.firstSeenMs < this.config.graceMs) {
      const elapsedMs = nowMs - entry.firstSeenMs;
      const pendingMin = Math.ceil((this.config.graceMs - elapsedMs) / 60_000);
      log("debug", "grace-skip", `${label} lang=${c.lang.code2} firstSeenAgoMin=${Math.floor(elapsedMs / 60_000)} gracePendingMin=${pendingMin}`);
      counters.graceSkip++;
    } else if (entry.lastActedMs !== null && nowMs - entry.lastActedMs < this.config.recheckCooldownMs) {
      const elapsedMs = nowMs - entry.lastActedMs;
      const pendingHr = Math.ceil((this.config.recheckCooldownMs - elapsedMs) / 3_600_000);
      log("debug", "cooldown-skip", `${label} lang=${c.lang.code2} lastActedAgoHr=${Math.floor(elapsedMs / 3_600_000)} cooldownPendingHr=${pendingHr}`);
      counters.cooldownSkip++;
    } else {
      counters.passed++;
      await this.processCandidate(c, state, nowMs);
    }
  }

  private isExcludedByAllowlist(c: Candidate): boolean {
    return (
      this.config.languageAllowlist.length > 0 &&
      !this.config.languageAllowlist.includes(c.lang.code2)
    );
  }

  private async processCandidate(c: Candidate, state: State, nowMs: number): Promise<void> {
    const key   = candidateKey(c);
    const label = candidateLabel(c);
    const lang  = c.lang.code2;

    const results = await this.bazarr.manualSearch(c.item, c.lang);
    const matches = results.filter(
      (r) => r.language === lang && r.forced === c.lang.forced && r.hearingImpaired === c.lang.hi,
    );

    if (matches.length === 0) {
      log("info", "no-subs-found", `${label} lang=${lang} — no subtitles found by any provider`);
      this.recordActed(key, state, nowMs);
      return;
    }

    log(
      "info",
      "subs-other-releases",
      `${label} lang=${lang} — found ${matches.length} sub(s) for other releases → step 6 not yet implemented`,
    );
  }

  private recordActed(key: string, state: State, nowMs: number): void {
    const entry = state.items[key];
    if (entry) {
      entry.lastActedMs = nowMs;
    } else {
      state.items[key] = { firstSeenMs: nowMs, lastActedMs: nowMs };
    }
  }
}
