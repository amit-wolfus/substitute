import { rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { Config } from "./config";
import { loadState, saveState } from "./state";
import { SubstituteService } from "./SubstituteService";
import type { BazarrClient, BazarrWanted, WantedEpisode, WantedMovie } from "./clients/bazarr";
import type { ManualSearchResult, MissingSubtitle } from "./clients/bazarr/bazarr.types";
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

function makeServiceWithBazarrMock(
  statePath: string,
  wanted: BazarrWanted,
  manualSearchResults: ManualSearchResult[],
  configOverrides: Partial<Config> = {},
): { svc: SubstituteService; mockDownload: jest.Mock } {
  const mockDownload = jest.fn().mockResolvedValue(undefined);
  const mockBazarr = {
    getWanted: jest.fn().mockResolvedValue(wanted),
    manualSearch: jest.fn().mockResolvedValue(manualSearchResults),
    downloadSubtitle: mockDownload,
  } as unknown as BazarrClient;

  const svc = new SubstituteService(
    makeConfig(statePath, configOverrides),
    mockBazarr,
    {} as unknown as SonarrClient,
    {} as unknown as RadarrClient,
  );
  return { svc, mockDownload };
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

    expect(loggedTags(logSpy)).toContain("no-bazarr-match");
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
    expect(loggedTags(logSpy)).toContain("no-bazarr-match");
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

// Helpers shared by step-4 tests

const LANG_HE: MissingSubtitle = {
  name: "Hebrew",
  code2: "he",
  code3: "heb",
  forced: false,
  hi: false,
};

function makeResult(overrides: Partial<ManualSearchResult> = {}): ManualSearchResult {
  return {
    language: "he",
    provider: "opensubtitlescom",
    subtitle: "blob==",
    forced: false,
    hearingImpaired: false,
    score: 360,
    releaseInfo: ["Pressure.2026.1080p.WEBRip"],
    matches: [],
    dontMatches: [],
    ...overrides,
  };
}

// A movie that has already passed the grace period so processCandidate is reached.
async function seedPastGrace(statePath: string): Promise<void> {
  const nowMs = Date.now();
  await saveState(statePath, {
    items: {
      "radarr:262:he":  { firstSeenMs: nowMs - 20 * 60_000, lastActedMs: null },
      "sonarr:2409:he": { firstSeenMs: nowMs - 20 * 60_000, lastActedMs: null },
    },
  });
}

describe("SubstituteService.processCandidate — step 4", () => {
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

  it("calls downloadSubtitle and logs bazarr-match when dryRun=false and match found", async () => {
    await seedPastGrace(statePath);
    const { svc, mockDownload } = makeServiceWithBazarrMock(
      statePath,
      { movies: [MOVIE], episodes: [] },
      [makeResult()],
      { graceMs: 0, dryRun: false },
    );

    await svc.runOnce();

    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(loggedTags(logSpy)).toContain("bazarr-match");
    expect(loggedTags(logSpy)).not.toContain("would-download");
  });

  it("skips downloadSubtitle and logs would-download when dryRun=true and match found", async () => {
    await seedPastGrace(statePath);
    const { svc, mockDownload } = makeServiceWithBazarrMock(
      statePath,
      { movies: [MOVIE], episodes: [] },
      [makeResult()],
      { graceMs: 0, dryRun: true },
    );

    await svc.runOnce();

    expect(mockDownload).not.toHaveBeenCalled();
    expect(loggedTags(logSpy)).toContain("would-download");
    expect(loggedTags(logSpy)).not.toContain("bazarr-match");
  });

  it("sets lastActedMs under dryRun: key when dryRun=true", async () => {
    await seedPastGrace(statePath);
    const { svc } = makeServiceWithBazarrMock(
      statePath,
      { movies: [MOVIE], episodes: [] },
      [makeResult()],
      { graceMs: 0, dryRun: true },
    );

    await svc.runOnce();

    const state = await loadState(statePath);
    expect(state.items["dryRun:radarr:262:he"]?.lastActedMs).toBe(Date.now());
    expect(state.items["radarr:262:he"]?.lastActedMs).toBeNull();
  });

  it("sets lastActedMs under the plain key when dryRun=false", async () => {
    await seedPastGrace(statePath);
    const { svc } = makeServiceWithBazarrMock(
      statePath,
      { movies: [MOVIE], episodes: [] },
      [makeResult()],
      { graceMs: 0, dryRun: false },
    );

    await svc.runOnce();

    const state = await loadState(statePath);
    expect(state.items["radarr:262:he"]?.lastActedMs).toBe(Date.now());
    expect(state.items["dryRun:radarr:262:he"]).toBeUndefined();
  });

  it("logs no-bazarr-match and does not call downloadSubtitle when no match found", async () => {
    await seedPastGrace(statePath);
    const { svc, mockDownload } = makeServiceWithBazarrMock(
      statePath,
      { movies: [MOVIE], episodes: [] },
      [],
      { graceMs: 0, dryRun: false },
    );

    await svc.runOnce();

    expect(mockDownload).not.toHaveBeenCalled();
    expect(loggedTags(logSpy)).toContain("no-bazarr-match");
  });

  it("does not set lastActedMs when no match found", async () => {
    await seedPastGrace(statePath);
    const { svc } = makeServiceWithBazarrMock(
      statePath,
      { movies: [MOVIE], episodes: [] },
      [],
      { graceMs: 0, dryRun: false },
    );

    await svc.runOnce();

    const state = await loadState(statePath);
    expect(state.items["radarr:262:he"]?.lastActedMs).toBeNull();
  });

  it("picks the highest-score result when multiple results match", async () => {
    await seedPastGrace(statePath);
    const low  = makeResult({ score: 100, provider: "subdl" });
    const high = makeResult({ score: 360, provider: "opensubtitlescom" });
    const { svc, mockDownload } = makeServiceWithBazarrMock(
      statePath,
      { movies: [MOVIE], episodes: [] },
      [low, high],
      { graceMs: 0, dryRun: false },
    );

    await svc.runOnce();

    const calledWith = mockDownload.mock.calls[0] as unknown[];
    const result = calledWith[2] as ManualSearchResult;
    expect(result.provider).toBe("opensubtitlescom");
  });

  it("excludes results where hearingImpaired does not match lang.hi", async () => {
    await seedPastGrace(statePath);
    const { svc, mockDownload } = makeServiceWithBazarrMock(
      statePath,
      { movies: [MOVIE], episodes: [] },
      [makeResult({ hearingImpaired: true })], // lang.hi is false
      { graceMs: 0, dryRun: false },
    );

    await svc.runOnce();

    expect(mockDownload).not.toHaveBeenCalled();
    expect(loggedTags(logSpy)).toContain("no-bazarr-match");
  });

  it("excludes results where forced does not match lang.forced", async () => {
    await seedPastGrace(statePath);
    const { svc, mockDownload } = makeServiceWithBazarrMock(
      statePath,
      { movies: [MOVIE], episodes: [] },
      [makeResult({ forced: true })], // lang.forced is false
      { graceMs: 0, dryRun: false },
    );

    await svc.runOnce();

    expect(mockDownload).not.toHaveBeenCalled();
    expect(loggedTags(logSpy)).toContain("no-bazarr-match");
  });

  it("excludes results where language does not match lang.code2", async () => {
    await seedPastGrace(statePath);
    const { svc, mockDownload } = makeServiceWithBazarrMock(
      statePath,
      { movies: [MOVIE], episodes: [] },
      [makeResult({ language: "en" })],
      { graceMs: 0, dryRun: false },
    );

    await svc.runOnce();

    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("calls downloadSubtitle for an episode candidate", async () => {
    await seedPastGrace(statePath);
    const { svc, mockDownload } = makeServiceWithBazarrMock(
      statePath,
      { movies: [], episodes: [EPISODE] },
      [makeResult()],
      { graceMs: 0, dryRun: false },
    );

    await svc.runOnce();

    expect(mockDownload).toHaveBeenCalledTimes(1);
    const calledWith = mockDownload.mock.calls[0] as unknown[];
    expect(calledWith[0]).toMatchObject({ kind: "episode", sonarrEpisodeId: 2409 });
  });
});
