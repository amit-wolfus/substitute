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

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { "X-API-KEY": this.apiKey },
    });
    if (!res.ok) {
      throw new Error(`Bazarr GET ${path} → ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }
}
