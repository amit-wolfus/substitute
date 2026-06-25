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
import type { SonarrClient } from "./clients/sonarr-client";
import type { RadarrClient } from "./clients/radarr-client";
import { selectBestRelease } from "./select-best-release";

type SubtitleTarget = {
  item: WantedEntry;
  lang: MissingSubtitle;
};

type PollCounters = {
  passed: number;
  allowlistSkip: number;
  graceSkip: number;
  cooldownSkip: number;
};

function buildTargets(movies: WantedMovie[], episodes: WantedEpisode[]): SubtitleTarget[] {
  return [
    ...movies.flatMap((item) => item.missingSubtitles.map((lang) => ({ item, lang }))),
    ...episodes.flatMap((item) => item.missingSubtitles.map((lang) => ({ item, lang }))),
  ];
}

function targetKey(target: SubtitleTarget): string {
  return isMovie(target.item)
    ? `radarr:${target.item.radarrId}:${target.lang.code2}`
    : `sonarr:${target.item.sonarrEpisodeId}:${target.lang.code2}`;
}

function targetLabel(target: SubtitleTarget): string {
  if (isMovie(target.item)) {
    return `movie="${target.item.title}"`;
  }
  return `show="${target.item.seriesTitle}" ep=${target.item.episodeNumber}`;
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
    const targets = buildTargets(movies, episodes);

    log("info", "poll-start", `movies=${movies.length} episodes=${episodes.length} targets=${targets.length}`);

    const counters: PollCounters = { passed: 0, allowlistSkip: 0, graceSkip: 0, cooldownSkip: 0 };
    for (const target of targets) {
      await this.handleTarget(target, state, nowMs, counters);
    }

    await saveState(this.config.statePath, state);
    log(
      "info",
      "poll-done",
      `total=${targets.length} passed=${counters.passed} graceSkip=${counters.graceSkip} cooldownSkip=${counters.cooldownSkip} allowlistSkip=${counters.allowlistSkip}`,
    );
  }

  private async handleTarget(
    target: SubtitleTarget,
    state: State,
    nowMs: number,
    counters: PollCounters,
  ): Promise<void> {
    const key = targetKey(target);
    const label = targetLabel(target);
    const entry = state.items[key];

    if (this.isExcludedByAllowlist(target)) {
      log("debug", "allowlist-skip", `${label} lang=${target.lang.code2}`);
      counters.allowlistSkip++;
    } else if (!entry) {
      state.items[key] = { firstSeenMs: nowMs, lastActedMs: null };
      log("info", "first-seen", `${label} lang=${target.lang.code2}`);
      counters.graceSkip++;
    } else if (nowMs - entry.firstSeenMs < this.config.graceMs) {
      const elapsedMs = nowMs - entry.firstSeenMs;
      const pendingMin = Math.ceil((this.config.graceMs - elapsedMs) / 60_000);
      log("debug", "grace-skip", `${label} lang=${target.lang.code2} firstSeenAgoMin=${Math.floor(elapsedMs / 60_000)} gracePendingMin=${pendingMin}`);
      counters.graceSkip++;
    } else if (entry.lastActedMs !== null && nowMs - entry.lastActedMs < this.config.recheckCooldownMs) {
      const elapsedMs = nowMs - entry.lastActedMs;
      const pendingHr = Math.ceil((this.config.recheckCooldownMs - elapsedMs) / 3_600_000);
      log("debug", "cooldown-skip", `${label} lang=${target.lang.code2} lastActedAgoHr=${Math.floor(elapsedMs / 3_600_000)} cooldownPendingHr=${pendingHr}`);
      counters.cooldownSkip++;
    } else {
      counters.passed++;
      await this.processTarget(target, state, nowMs);
    }
  }

  private isExcludedByAllowlist(target: SubtitleTarget): boolean {
    return (
      this.config.languageAllowlist.length > 0 &&
      !this.config.languageAllowlist.includes(target.lang.code2)
    );
  }

  private async processTarget(target: SubtitleTarget, state: State, nowMs: number): Promise<void> {
    const key   = targetKey(target);
    const label = targetLabel(target);
    const lang  = target.lang.code2;

    const results = await this.bazarr.manualSearch(target.item, target.lang);
    const matches = results.filter(
      (r) => r.language === lang && r.forced === target.lang.forced && r.hearingImpaired === target.lang.hi,
    );

    if (matches.length === 0) {
      log("info", "no-subs-found", `${label} lang=${lang} — no subtitles found by any provider`);
      this.recordActed(key, state, nowMs);
      return;
    }

    log("info", "subs-other-releases", `${label} lang=${lang} — found ${matches.length} sub(s) for other releases`);

    const candidateNames = [...new Set(matches.flatMap((m) => m.releaseInfo))];

    const arrReleases = isMovie(target.item)
      ? await this.radarr.interactiveSearch(target.item.radarrId)
      : await this.sonarr.interactiveSearch(
          target.item.sonarrSeriesId,
          target.item.sonarrEpisodeId,
        );

    const best = selectBestRelease(arrReleases, candidateNames);

    if (!best) {
      const approved = arrReleases.filter((r) => r.approved).length;
      log(
        "info",
        "no-arr-match",
        `${label} lang=${lang} — ${arrReleases.length} indexer result(s), ${approved} approved, none title-match ${candidateNames.length} Bazarr candidate(s)`,
      );
      return;
    }

    const currentTitle = target.item.sceneName ?? "(unknown)";
    const grabDesc = `score=${best.customFormatScore} seeders=${best.seeders ?? "n/a"} title="${best.title}"`;

    if (this.config.dryRun) {
      log("info", "arr-grab", `${label} lang=${lang} [DRY-RUN] current="${currentTitle}" → wouldGrab ${grabDesc}`);
    } else {
      log("info", "arr-grab", `${label} lang=${lang} current="${currentTitle}" → grabbing ${grabDesc}`);
      await (isMovie(target.item) ? this.radarr : this.sonarr).grabRelease(best);
    }

    this.recordActed(key, state, nowMs);
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
