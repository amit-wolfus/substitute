// Raw API shapes — snake_case as received over the wire.

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

// Type guards.

export function isMovie(entry: WantedEntry): entry is WantedMovie {
  return entry.kind === "movie";
}

export function isShow(entry: WantedEntry): entry is WantedEpisode {
  return entry.kind === "episode";
}

// Mappers — convert raw API responses to public camelCase types.

export function mapSubtitle(r: RawMissingSubtitle): MissingSubtitle {
  return { name: r.name, code2: r.code2, code3: r.code3, forced: r.forced, hi: r.hi };
}

export function mapMovie(r: RawMovie): WantedMovie {
  return {
    kind: "movie",
    title: r.title,
    radarrId: r.radarrId,
    sceneName: r.sceneName,
    missingSubtitles: r.missing_subtitles.map(mapSubtitle),
  };
}

export function mapEpisode(r: RawEpisode): WantedEpisode {
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
