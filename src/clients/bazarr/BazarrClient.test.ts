import { BazarrClient } from "./BazarrClient";
import type { MissingSubtitle, WantedEpisode, WantedMovie } from "./bazarr.types";

const MOVIE: WantedMovie = {
  kind: "movie",
  title: "Pressure",
  radarrId: 262,
  sceneName: "Pressure.2026.1080p.WEBRip",
  missingSubtitles: [],
};

const EPISODE: WantedEpisode = {
  kind: "episode",
  seriesTitle: "Rick and Morty",
  episodeTitle: "Ricks Days",
  episodeNumber: "9x2",
  sonarrSeriesId: 175,
  sonarrEpisodeId: 2409,
  sceneName: null,
  seriesType: "standard",
  missingSubtitles: [],
};

const LANG_HE: MissingSubtitle = {
  name: "Hebrew",
  code2: "he",
  code3: "heb",
  forced: false,
  hi: false,
};

const RAW_RESULT = {
  language: "he",
  provider: "opensubtitlescom",
  subtitle: "base64blob==",
  forced: "False" as const,
  hearing_impaired: "False" as const,
  original_format: "False",
  score: 360,
  release_info: ["Pressure.2026.1080p.WEBRip"],
  matches: ["title", "year"],
  dont_matches: [],
};

function mockOkResponse(body: unknown): Response {
  return {
    ok: true,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe("BazarrClient.manualSearch", () => {
  let client: BazarrClient;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    client = new BazarrClient("http://bazarr:6767", "test-key");
    fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(mockOkResponse({ data: [RAW_RESULT] }));
  });

  afterEach(() => fetchSpy.mockRestore());

  it("calls the movies endpoint for a movie", async () => {
    await client.manualSearch(MOVIE, LANG_HE);
    const url: string = (fetchSpy.mock.calls[0] as [string])[0];
    expect(url).toContain("/api/providers/movies");
    expect(url).toContain("radarrid=262");
  });

  it("calls the episodes endpoint for an episode", async () => {
    await client.manualSearch(EPISODE, LANG_HE);
    const url: string = (fetchSpy.mock.calls[0] as [string])[0];
    expect(url).toContain("/api/providers/episodes");
    expect(url).toContain("episodeid=2409");
  });

  it("sends the X-API-KEY header", async () => {
    await client.manualSearch(MOVIE, LANG_HE);
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-API-KEY"]).toBe("test-key");
  });

  it("maps forced and hearing_impaired strings to booleans", async () => {
    fetchSpy.mockResolvedValue(
      mockOkResponse({
        data: [{ ...RAW_RESULT, forced: "True", hearing_impaired: "True" }],
      }),
    );
    const [result] = await client.manualSearch(MOVIE, LANG_HE);
    expect(result.forced).toBe(true);
    expect(result.hearingImpaired).toBe(true);
  });

  it("maps release_info to releaseInfo and dont_matches to dontMatches", async () => {
    const [result] = await client.manualSearch(MOVIE, LANG_HE);
    expect(result.releaseInfo).toEqual(["Pressure.2026.1080p.WEBRip"]);
    expect(result.dontMatches).toEqual([]);
  });

  it("returns an empty array when data is empty", async () => {
    fetchSpy.mockResolvedValue(mockOkResponse({ data: [] }));
    const results = await client.manualSearch(MOVIE, LANG_HE);
    expect(results).toHaveLength(0);
  });
});
