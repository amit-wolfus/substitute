// Raw API shapes — snake_case as received over the wire; private to this module.

export interface RawMissingSubtitle {
  name: string;
  code2: string;
  code3: string;
  forced: boolean;
  hi: boolean;
}

export interface RawMovie {
  title: string;
  missing_subtitles: RawMissingSubtitle[];
  radarrId: number;
  sceneName: string | null;
}

export interface RawEpisode {
  seriesTitle: string;
  episode_number: string;
  episodeTitle: string;
  missing_subtitles: RawMissingSubtitle[];
  sonarrSeriesId: number;
  sonarrEpisodeId: number;
  sceneName: string | null;
  seriesType: string;
}

export interface RawWantedResponse<T> {
  data: T[];
  total: number;
}

// Public camelCase types — all callers use these exclusively.

export interface MissingSubtitle {
  name: string;
  code2: string;
  code3: string;
  forced: boolean;
  hi: boolean;
}

export interface WantedMovie {
  kind: "movie";
  title: string;
  radarrId: number;
  sceneName: string | null;
  missingSubtitles: MissingSubtitle[];
}

export interface WantedEpisode {
  kind: "episode";
  seriesTitle: string;
  episodeTitle: string;
  episodeNumber: string;
  sonarrSeriesId: number;
  sonarrEpisodeId: number;
  sceneName: string | null;
  seriesType: string;
  missingSubtitles: MissingSubtitle[];
}

export type WantedEntry = WantedMovie | WantedEpisode;

export function isMovie(entry: WantedEntry): entry is WantedMovie {
  return entry.kind === "movie";
}

export function isShow(entry: WantedEntry): entry is WantedEpisode {
  return entry.kind === "episode";
}
