import { rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { Config } from "./config";
import { loadState, saveState } from "./state";
import { SubstituteService } from "./substitute-service";
import type { BazarrClient, BazarrWanted, WantedEpisode, WantedMovie } from "./clients/bazarr";
import type { ManualSearchResult } from "./clients/bazarr/bazarr.types";
import type { SonarrClient } from "./clients/sonarr-client";
import type { RadarrClient } from "./clients/radarr-client";
import type { ArrRelease } from "./clients/arr.types";

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

function makeArrRelease(overrides: Partial<ArrRelease> = {}): ArrRelease {
  return {
    guid: "magnet:test",
    indexerId: 1,
    // Matches makeResult()'s default releaseInfo entry so title-matching works out of the box.
    title: "Pressure.2026.1080p.MA.WEB-DL",
    protocol: "torrent",
    approved: true,
    customFormatScore: 0,
    qualityWeight: 1000,
    seeders: 100,
    age: 3,
    quality: { quality: { id: 3, name: "WEBDL-1080p", source: "webdl", resolution: 1080 } },
    ...overrides,
  };
}

function makeArrMocks(arrReleases: ArrRelease[]): {
  mockSonarr: SonarrClient;
  mockRadarr: RadarrClient;
  mockInteractiveSearch: jest.Mock;
  mockGrab: jest.Mock;
} {
  const mockInteractiveSearch = jest.fn().mockResolvedValue(arrReleases);
  const mockGrab = jest.fn().mockResolvedValue(undefined);
  const mockSonarr = { interactiveSearch: mockInteractiveSearch, grabRelease: mockGrab } as unknown as SonarrClient;
  const mockRadarr = { interactiveSearch: mockInteractiveSearch, grabRelease: mockGrab } as unknown as RadarrClient;
  return { mockSonarr, mockRadarr, mockInteractiveSearch, mockGrab };
}

function makeServiceWithBazarrMock(
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

  const { mockSonarr, mockRadarr } = makeArrMocks([]);

  const svc = new SubstituteService(
    makeConfig(statePath, configOverrides),
    mockBazarr,
    mockSonarr,
    mockRadarr,
  );
  return { svc, mockSearch };
}

function makeServiceWithFullMocks(
  statePath: string,
  wanted: BazarrWanted,
  manualSearchResults: ManualSearchResult[],
  arrReleases: ArrRelease[],
  configOverrides: Partial<Config> = {},
): { svc: SubstituteService; mockInteractiveSearch: jest.Mock; mockGrab: jest.Mock } {
  const mockSearch = jest.fn().mockResolvedValue(manualSearchResults);
  const mockBazarr = {
    getWanted:    jest.fn().mockResolvedValue(wanted),
    manualSearch: mockSearch,
  } as unknown as BazarrClient;

  const { mockSonarr, mockRadarr, mockInteractiveSearch, mockGrab } = makeArrMocks(arrReleases);

  const svc = new SubstituteService(
    makeConfig(statePath, configOverrides),
    mockBazarr,
    mockSonarr,
    mockRadarr,
  );
  return { svc, mockInteractiveSearch, mockGrab };
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
    const { svc } = makeServiceWithBazarrMock(
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
    const { svc } = makeServiceWithBazarrMock(
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
    const { svc } = makeServiceWithBazarrMock(statePath, { movies: [MOVIE], episodes: [] }, [], { graceMs: 0 });

    await svc.runOnce();

    expect(loggedTags(logSpy)).toContain("no-subs-found");
    const state = await loadState(statePath);
    expect(state.items["radarr:262:he"]?.lastActedMs).toBe(Date.now());
  });

  it("logs subs-other-releases and does not set lastActedMs when matches are found", async () => {
    await seedPastGrace(statePath);
    const { svc } = makeServiceWithBazarrMock(
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
    const { svc } = makeServiceWithBazarrMock(
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
    const { svc, mockSearch } = makeServiceWithBazarrMock(
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
    const { svc, mockSearch } = makeServiceWithBazarrMock(
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
    const { svc } = makeServiceWithBazarrMock(
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
    const { svc } = makeServiceWithBazarrMock(
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
    const { svc } = makeServiceWithBazarrMock(
      statePath,
      { movies: [MOVIE], episodes: [] },
      [makeResult({ hearingImpaired: true })],
      { graceMs: 0 },
    );

    await svc.runOnce();

    expect(loggedTags(logSpy)).toContain("no-subs-found");
  });
});

describe("SubstituteService.processCandidate — step 6", () => {
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

  it("logs no-arr-match when interactiveSearch returns empty list (movie)", async () => {
    await seedPastGrace(statePath);
    const { svc } = makeServiceWithFullMocks(statePath, { movies: [MOVIE], episodes: [] }, [makeResult()], []);

    await svc.runOnce();

    expect(loggedTags(logSpy)).toContain("no-arr-match");
  });

  it("logs no-arr-match when interactiveSearch returns empty list (episode)", async () => {
    await seedPastGrace(statePath);
    const { svc } = makeServiceWithFullMocks(statePath, { movies: [], episodes: [EPISODE] }, [makeResult()], []);

    await svc.runOnce();

    expect(loggedTags(logSpy)).toContain("no-arr-match");
  });

  it("logs no-arr-match when the only Arr release title does not match any Bazarr candidate", async () => {
    await seedPastGrace(statePath);
    const { svc } = makeServiceWithFullMocks(
      statePath,
      { movies: [MOVIE], episodes: [] },
      [makeResult()],
      [makeArrRelease({ title: "Pressure.2026.1080p.WEBRip.OTHER-GROUP" })],
    );

    await svc.runOnce();

    expect(loggedTags(logSpy)).toContain("no-arr-match");
  });

  it("logs no-arr-match when the only Arr release is not approved", async () => {
    await seedPastGrace(statePath);
    const { svc } = makeServiceWithFullMocks(
      statePath,
      { movies: [MOVIE], episodes: [] },
      [makeResult()],
      [makeArrRelease({ approved: false })],
    );

    await svc.runOnce();

    expect(loggedTags(logSpy)).toContain("no-arr-match");
  });

  it("logs arr-grab with DRY-RUN and sets lastActedMs when a match is found in dry-run mode", async () => {
    await seedPastGrace(statePath);
    const { svc } = makeServiceWithFullMocks(
      statePath,
      { movies: [MOVIE], episodes: [] },
      [makeResult()],
      [makeArrRelease()],
      { dryRun: true },
    );

    await svc.runOnce();

    expect(loggedTags(logSpy)).toContain("arr-grab");
    const grabLine = logSpy.mock.calls.find(([l]: [string]) => l?.includes("arr-grab"))?.[0] as string;
    expect(grabLine).toContain("DRY-RUN");
    const state = await loadState(statePath);
    expect(state.items["radarr:262:he"]?.lastActedMs).toBe(Date.now());
  });

  it("calls grabRelease and logs arr-grab without DRY-RUN when dryRun is false", async () => {
    await seedPastGrace(statePath);
    const { svc, mockGrab } = makeServiceWithFullMocks(
      statePath,
      { movies: [MOVIE], episodes: [] },
      [makeResult()],
      [makeArrRelease()],
      { dryRun: false },
    );

    await svc.runOnce();

    expect(mockGrab).toHaveBeenCalledTimes(1);
    expect(loggedTags(logSpy)).toContain("arr-grab");
    const grabLine = logSpy.mock.calls.find(([l]: [string]) => l?.includes("arr-grab"))?.[0] as string;
    expect(grabLine).not.toContain("DRY-RUN");
    const state = await loadState(statePath);
    expect(state.items["radarr:262:he"]?.lastActedMs).toBe(Date.now());
  });

  it("calls grabRelease for an episode and uses sonarr client", async () => {
    await seedPastGrace(statePath);
    const mockSearch = jest.fn().mockResolvedValue([makeResult()]);
    const mockBazarr = { getWanted: jest.fn().mockResolvedValue({ movies: [], episodes: [EPISODE] }), manualSearch: mockSearch } as unknown as BazarrClient;
    const sonarrSearch = jest.fn().mockResolvedValue([makeArrRelease()]);
    const radarrSearch = jest.fn().mockResolvedValue([]);
    const mockGrab = jest.fn().mockResolvedValue(undefined);
    const mockSonarr = { interactiveSearch: sonarrSearch, grabRelease: mockGrab } as unknown as SonarrClient;
    const mockRadarr = { interactiveSearch: radarrSearch, grabRelease: jest.fn() } as unknown as RadarrClient;

    const svc = new SubstituteService(makeConfig(statePath, { dryRun: false }), mockBazarr, mockSonarr, mockRadarr);
    await svc.runOnce();

    expect(sonarrSearch).toHaveBeenCalledWith(EPISODE.sonarrSeriesId, EPISODE.sonarrEpisodeId);
    expect(radarrSearch).not.toHaveBeenCalled();
    expect(mockGrab).toHaveBeenCalledTimes(1);
  });

  it("includes current sceneName and matched title in the arr-grab log", async () => {
    await seedPastGrace(statePath);
    const { svc } = makeServiceWithFullMocks(
      statePath,
      { movies: [MOVIE], episodes: [] },
      [makeResult()],
      [makeArrRelease()],
      { dryRun: false },
    );

    await svc.runOnce();

    const grabLine = logSpy.mock.calls.find(([l]: [string]) => l?.includes("arr-grab"))?.[0] as string;
    expect(grabLine).toContain(MOVIE.sceneName!);
    expect(grabLine).toContain(makeArrRelease().title);
  });

  it("no-arr-match does NOT set lastActedMs", async () => {
    await seedPastGrace(statePath);
    const { svc } = makeServiceWithFullMocks(statePath, { movies: [MOVIE], episodes: [] }, [makeResult()], []);

    await svc.runOnce();

    const state = await loadState(statePath);
    expect(state.items["radarr:262:he"]?.lastActedMs).toBeNull();
  });

  it("grabs the highest-scoring release when multiple matches exist", async () => {
    await seedPastGrace(statePath);
    const low = makeArrRelease({ customFormatScore: 5, guid: "low" });
    const high = makeArrRelease({ customFormatScore: 10, guid: "high" });
    const { svc, mockGrab } = makeServiceWithFullMocks(
      statePath,
      { movies: [MOVIE], episodes: [] },
      [makeResult()],
      [low, high],
      { dryRun: false },
    );

    await svc.runOnce();

    expect(mockGrab).toHaveBeenCalledWith(expect.objectContaining({ guid: "high" }));
  });
});
