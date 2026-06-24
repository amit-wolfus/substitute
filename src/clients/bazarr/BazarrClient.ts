import {
  mapEpisode,
  mapMovie,
  type RawEpisode,
  type RawMovie,
  type RawWantedResponse,
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

  // Task 3: manualSearch(), downloadSubtitle()

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
