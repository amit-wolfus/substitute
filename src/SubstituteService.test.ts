import { rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { Config } from "./config";
import { loadState, saveState } from "./state";
import { SubstituteService } from "./SubstituteService";
import type { BazarrClient, BazarrWanted, WantedEpisode, WantedMovie } from "./clients/bazarr";
import type { ManualSearchResult } from "./clients/bazarr/bazarr.types";
import type { SonarrClient } from "./clients/SonarrClient";
import type { RadarrClient } from "./clients/RadarrClient";

// Fixtures

const MOVIE: WantedMovie = {
  kind: "movie",
  title: "Pressure",
  radarrId: 262,
  sceneName: "Pressure (2026) [1080p] [WEBRip] [5.1]",
  missingSubtitles: [{ name: "Hebrew", code2: "he", code3: "heb", forced: false, hi: false }],
};

const EPISODE: WantedEpisode = {
  kind: "episode",
  seriesTitle: "Rick and Morty",
  episodeTitle: "Ricks Days, Seven Nights",
  episodeNumber: "9x2",
  sonarrSeriesId: 175,
  sonarrEpisodeId: 2409,
  sceneName: null,
  seriesType: "standard",
  missingSubtitles: [{ name: "Hebrew", code2: "he", code3: "heb", forced: false, hi: false }],
};

// Helpers

function makeConfig(statePath: string, overrides: Partial<Config> = {}): Config {
  return {
    bazarrUrl: "http://bazarr",
    bazarrApiKey: "key",
    radarrUrl: "http://radarr",
    radarrApiKey: "key",
    sonarrUrl: "http://sonarr",
    sonarrApiKey: "key",
    pollIntervalMs: 15 * 60_000,
    graceMs: 10 * 60_000,
    recheckCooldownMs: 24 * 3_600_000,
    dryRun: true,
    languageAllowlist: [],
    matchRequires: ["resolution", "source"],
    statePath,
    ...overrides,
  };
}

function makeService(
  statePath: string,
  wanted: BazarrWanted,
  configOverrides: Partial<Config> = {},
): SubstituteService {
  const mockBazarr = {
    getWanted: jest.fn().mockResolvedValue(wanted),
  } as unknown as BazarrClient;

  return new SubstituteService(
    makeConfig(statePath, configOverrides),
    mockBazarr,
    {} as unknown as SonarrClient,
    {} as unknown as RadarrClient,
  );
}

function makeServiceWithSearch(
  statePath: string,
  wanted: BazarrWanted,
  manualSearchResults: ManualSearchResult[],
  configOverrides: Partial<Config> = {},
): { svc: SubstituteService; mockSearch: jest.Mock } {
  const mockSearch = jest.fn().mockResolvedValue(manualSearchResults);
  const mockBazarr = {
    getWanted:    jest.fn().mockResolvedValue(wanted),
    manualSearch: mockSearch,
  } as unknown as BazarrClient;

  const svc = new SubstituteService(
    makeConfig(statePath, configOverrides),
    mockBazarr,
    {} as unknown as SonarrClient,
    {} as unknown as RadarrClient,
  );
  return { svc, mockSearch };
}

// Extract log tags from console.log calls to avoid coupling to exact message text.
function loggedTags(logSpy: jest.SpyInstance): string[] {
  return logSpy.mock.calls
    .map(([line]: [string]) => line?.match(/\[substitute\] \S+\s+(\S+)/)?.[1])
    .filter((t): t is string => typeof t === "string");
}

// Tests

describe("SubstituteService.runOnce", () => {
  let statePath: string;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    statePath = join(tmpdir(), `sub-test-${Date.now()}-${Math.random()}.json`);
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-06-24T10:00:00Z"));
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    jest.useRealTimers();
    logSpy.mockRestore();
    await rm(statePath, { force: true });
  });

  it("records first-seen on the initial encounter and skips processing", async () => {
    const svc = makeService(statePath, { movies: [MOVIE], episodes: [] });
    await svc.runOnce();

    expect(loggedTags(logSpy)).toContain("first-seen");
    expect(loggedTags(logSpy)).not.toContain("candidate-noop");

    const state = await loadState(statePath);
    expect(state.items["radarr:262:he"]?.firstSeenMs).toBe(Date.now());
    expect(state.items["radarr:262:he"]?.lastActedMs).toBeNull();
  });

  it("grace-skips while within the grace period", async () => {
    const svc = makeService(statePath, { movies: [MOVIE], episodes: [] }, { graceMs: 10 * 60_000 });
    await svc.runOnce(); // first-seen
    logSpy.mockClear();

    jest.advanceTimersByTime(5 * 60_000); // 5 min — still inside grace
    await svc.runOnce();

    expect(loggedTags(logSpy)).toContain("grace-skip");
    expect(loggedTags(logSpy)).not.toContain("candidate-noop");
  });

  it("passes to processCandidate once the grace period has elapsed", async () => {
    const { svc } = makeServiceWithSearch(
      statePath,
      { movies: [MOVIE], episodes: [] },
      [],
      { graceMs: 10 * 60_000 },
    );
    await svc.runOnce(); // first-seen
    logSpy.mockClear();

    jest.advanceTimersByTime(11 * 60_000); // past grace
    await svc.runOnce();

    expect(loggedTags(logSpy)).toContain("no-subs-found");
    expect(loggedTags(logSpy)).not.toContain("grace-skip");
  });

  it("allowlist-skips items in a filtered language (no state entry created)", async () => {
    const svc = makeService(
      statePath,
      { movies: [MOVIE], episodes: [] },
      { languageAllowlist: ["fr"] },
    );
    await svc.runOnce();

    expect(loggedTags(logSpy)).toContain("allowlist-skip");
    expect(loggedTags(logSpy)).not.toContain("first-seen");
    expect(loggedTags(logSpy)).not.toContain("candidate-noop");

    const state = await loadState(statePath);
    expect(state.items["radarr:262:he"]).toBeUndefined();
  });

  it("passes items in allowlisted language", async () => {
    const { svc } = makeServiceWithSearch(
      statePath,
      { movies: [MOVIE], episodes: [] },
      [],
      { languageAllowlist: ["he"], graceMs: 0 },
    );
    await svc.runOnce(); // first-seen (always skips first encounter regardless of graceMs)
    logSpy.mockClear();

    await svc.runOnce(); // graceMs=0 → elapsed (0ms) >= grace (0ms) → passes
    expect(loggedTags(logSpy)).toContain("no-subs-found");
    expect(loggedTags(logSpy)).not.toContain("allowlist-skip");
  });

  it("cooldown-skips items whose lastActedMs is within the cooldown window", async () => {
    const nowMs = Date.now();
    await saveState(statePath, {
      items: {
        "radarr:262:he": {
          firstSeenMs: nowMs - 2 * 3_600_000, // 2h ago (past grace)
          lastActedMs: nowMs - 1 * 3_600_000, // 1h ago (within 24h cooldown)
        },
      },
    });

    const svc = makeService(
      statePath,
      { movies: [MOVIE], episodes: [] },
      { graceMs: 0, recheckCooldownMs: 24 * 3_600_000 },
    );
    await svc.runOnce();

    expect(loggedTags(logSpy)).toContain("cooldown-skip");
    expect(loggedTags(logSpy)).not.toContain("candidate-noop");
  });

  it("processes both movies and episodes as separate candidates", async () => {
    const svc = makeService(
      statePath,
      { movies: [MOVIE], episodes: [EPISODE] },
      { graceMs: 0 },
    );
    await svc.runOnce(); // first-seen for both

    const state = await loadState(statePath);
    expect(state.items["radarr:262:he"]).toBeDefined();
    expect(state.items["sonarr:2409:he"]).toBeDefined();
  });

  it("reports accurate poll-done counters", async () => {
    const svc = makeService(statePath, { movies: [MOVIE], episodes: [EPISODE] });
    await svc.runOnce();

    const pollDoneLine = logSpy.mock.calls.find(([l]: [string]) => l?.includes("poll-done"))?.[0] as string;
    expect(pollDoneLine).toMatch("total=2");
    expect(pollDoneLine).toMatch("graceSkip=2"); // both are first-seen
    expect(pollDoneLine).toMatch("passed=0");
    expect(pollDoneLine).toMatch("allowlistSkip=0");
  });
});

// Fixtures shared by step-5 tests

function makeResult(overrides: Partial<ManualSearchResult> = {}): ManualSearchResult {
  return {
    language: "he",
    provider: "opensubtitlescom",
    subtitle: "blob==",
    forced: false,
    hearingImpaired: false,
    score: 86,
    releaseInfo: ["Pressure.2026.1080p.MA.WEB-DL"],
    matches: ["imdb_id", "title"],
    dontMatches: ["hash", "release_group"],
    ...overrides,
  };
}

// Seeds state so the candidate is past grace and processCandidate is reached.
async function seedPastGrace(statePath: string): Promise<void> {
  const nowMs = Date.now();
  await saveState(statePath, {
    items: {
      "radarr:262:he":  { firstSeenMs: nowMs - 20 * 60_000, lastActedMs: null },
      "sonarr:2409:he": { firstSeenMs: nowMs - 20 * 60_000, lastActedMs: null },
    },
  });
}

describe("SubstituteService.processCandidate — step 5", () => {
  let statePath: string;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    statePath = join(tmpdir(), `sub-test-${Date.now()}-${Math.random()}.json`);
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-06-24T10:00:00Z"));
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    jest.useRealTimers();
    logSpy.mockRestore();
    await rm(statePath, { force: true });
  });

  it("logs no-subs-found and sets lastActedMs when manualSearch returns no matching results", async () => {
    await seedPastGrace(statePath);
    const { svc } = makeServiceWithSearch(statePath, { movies: [MOVIE], episodes: [] }, [], { graceMs: 0 });

    await svc.runOnce();

    expect(loggedTags(logSpy)).toContain("no-subs-found");
    const state = await loadState(statePath);
    expect(state.items["radarr:262:he"]?.lastActedMs).toBe(Date.now());
  });

  it("logs subs-other-releases and does not set lastActedMs when matches are found", async () => {
    await seedPastGrace(statePath);
    const { svc } = makeServiceWithSearch(
      statePath,
      { movies: [MOVIE], episodes: [] },
      [makeResult()],
      { graceMs: 0 },
    );

    await svc.runOnce();

    expect(loggedTags(logSpy)).toContain("subs-other-releases");
    const state = await loadState(statePath);
    expect(state.items["radarr:262:he"]?.lastActedMs).toBeNull();
  });

  it("includes the match count in the subs-other-releases log message", async () => {
    await seedPastGrace(statePath);
    const { svc } = makeServiceWithSearch(
      statePath,
      { movies: [MOVIE], episodes: [] },
      [makeResult(), makeResult({ provider: "subdl" })],
      { graceMs: 0 },
    );

    await svc.runOnce();

    const line = logSpy.mock.calls.find(([l]: [string]) => l?.includes("subs-other-releases"))?.[0] as string;
    expect(line).toContain("2");
  });

  it("calls manualSearch with the movie item", async () => {
    await seedPastGrace(statePath);
    const { svc, mockSearch } = makeServiceWithSearch(
      statePath,
      { movies: [MOVIE], episodes: [] },
      [],
      { graceMs: 0 },
    );

    await svc.runOnce();

    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "movie", radarrId: 262 }),
      expect.anything(),
    );
  });

  it("calls manualSearch with the episode item and logs no-subs-found when empty", async () => {
    await seedPastGrace(statePath);
    const { svc, mockSearch } = makeServiceWithSearch(
      statePath,
      { movies: [], episodes: [EPISODE] },
      [],
      { graceMs: 0 },
    );

    await svc.runOnce();

    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "episode", sonarrEpisodeId: 2409 }),
      expect.anything(),
    );
    expect(loggedTags(logSpy)).toContain("no-subs-found");
  });

  it("treats a result with wrong language as no match", async () => {
    await seedPastGrace(statePath);
    const { svc } = makeServiceWithSearch(
      statePath,
      { movies: [MOVIE], episodes: [] },
      [makeResult({ language: "en" })],
      { graceMs: 0 },
    );

    await svc.runOnce();

    expect(loggedTags(logSpy)).toContain("no-subs-found");
  });

  it("treats a result with mismatched forced flag as no match", async () => {
    await seedPastGrace(statePath);
    const { svc } = makeServiceWithSearch(
      statePath,
      { movies: [MOVIE], episodes: [] },
      [makeResult({ forced: true })],
      { graceMs: 0 },
    );

    await svc.runOnce();

    expect(loggedTags(logSpy)).toContain("no-subs-found");
  });

  it("treats a result with mismatched hearingImpaired flag as no match", async () => {
    await seedPastGrace(statePath);
    const { svc } = makeServiceWithSearch(
      statePath,
      { movies: [MOVIE], episodes: [] },
      [makeResult({ hearingImpaired: true })],
      { graceMs: 0 },
    );

    await svc.runOnce();

    expect(loggedTags(logSpy)).toContain("no-subs-found");
  });
});
