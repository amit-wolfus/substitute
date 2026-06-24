import {
  isShow,
  mapEpisode,
  mapManualSearchResult,
  mapMovie,
  type ManualSearchResult,
  type MissingSubtitle,
  type RawEpisode,
  type RawManualSearchResult,
  type RawMovie,
  type RawWantedResponse,
  type WantedEntry,
  type WantedEpisode,
  type WantedMovie,
} from "./bazarr.types";

export interface BazarrWanted {
  movies: WantedMovie[];
  episodes: WantedEpisode[];
}

export class BazarrClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async getWanted(): Promise<BazarrWanted> {
    const [moviesRes, episodesRes] = await Promise.all([
      this.get<RawWantedResponse<RawMovie>>("/api/movies/wanted?start=0&length=1000"),
      this.get<RawWantedResponse<RawEpisode>>("/api/episodes/wanted?start=0&length=1000"),
    ]);
    return {
      movies: moviesRes.data.map(mapMovie),
      episodes: episodesRes.data.map(mapEpisode),
    };
  }

  async manualSearch(item: WantedEntry, _lang: MissingSubtitle): Promise<ManualSearchResult[]> {
    const path = isShow(item)
      ? `/api/providers/episodes?episodeid=${item.sonarrEpisodeId}`
      : `/api/providers/movies?radarrid=${item.radarrId}`;
    const res = await this.get<{ data: RawManualSearchResult[] }>(path);
    return res.data.map(mapManualSearchResult);
  }

  async downloadSubtitle(
    item: WantedEntry,
    lang: MissingSubtitle,
    result: ManualSearchResult,
  ): Promise<void> {
    const hi = lang.hi ? "True" : "False";
    const forced = lang.forced ? "True" : "False";
    const params =
      `hi=${hi}&forced=${forced}&original_format=False` +
      `&provider=${encodeURIComponent(result.provider)}` +
      `&subtitle=${encodeURIComponent(result.subtitle)}`;
    const path = isShow(item)
      ? `/api/providers/episodes?seriesid=${item.sonarrSeriesId}&episodeid=${item.sonarrEpisodeId}&${params}`
      : `/api/providers/movies?radarrid=${item.radarrId}&${params}`;
    await this.post(path);
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { "X-API-KEY": this.apiKey },
    });
    if (!res.ok) {
      throw new Error(`Bazarr GET ${path} → ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  private async post(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "X-API-KEY": this.apiKey },
    });
    if (!res.ok) {
      throw new Error(`Bazarr POST ${path} → ${res.status} ${res.statusText}`);
    }
  }
}
