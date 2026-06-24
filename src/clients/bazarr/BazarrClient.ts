import type {
  MissingSubtitle,
  RawEpisode,
  RawMissingSubtitle,
  RawMovie,
  RawWantedResponse,
  WantedEpisode,
  WantedMovie,
} from "./bazarr.types";

export interface BazarrWanted {
  movies: WantedMovie[];
  episodes: WantedEpisode[];
}

function mapSubtitle(r: RawMissingSubtitle): MissingSubtitle {
  return { name: r.name, code2: r.code2, code3: r.code3, forced: r.forced, hi: r.hi };
}

function mapMovie(r: RawMovie): WantedMovie {
  return {
    kind: "movie",
    title: r.title,
    radarrId: r.radarrId,
    sceneName: r.sceneName,
    missingSubtitles: r.missing_subtitles.map(mapSubtitle),
  };
}

function mapEpisode(r: RawEpisode): WantedEpisode {
  return {
    kind: "episode",
    seriesTitle: r.seriesTitle,
    episodeTitle: r.episodeTitle,
    episodeNumber: r.episode_number,
    sonarrSeriesId: r.sonarrSeriesId,
    sonarrEpisodeId: r.sonarrEpisodeId,
    sceneName: r.sceneName,
    seriesType: r.seriesType,
    missingSubtitles: r.missing_subtitles.map(mapSubtitle),
  };
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
