import {
  isMovie,
  isShow,
  mapEpisode,
  mapMovie,
  mapSubtitle,
  type RawEpisode,
  type RawMissingSubtitle,
  type RawMovie,
} from "./bazarr.types";

const RAW_SUBTITLE: RawMissingSubtitle = {
  name: "Hebrew",
  code2: "he",
  code3: "heb",
  forced: false,
  hi: false,
};

const RAW_MOVIE: RawMovie = {
  title: "Pressure",
  missing_subtitles: [RAW_SUBTITLE],
  radarrId: 262,
  sceneName: "Pressure (2026) [1080p] [WEBRip] [5.1]",
};

const RAW_EPISODE: RawEpisode = {
  seriesTitle: "Rick and Morty",
  episode_number: "9x2",
  episodeTitle: "Ricks Days, Seven Nights",
  missing_subtitles: [RAW_SUBTITLE],
  sonarrSeriesId: 175,
  sonarrEpisodeId: 2409,
  sceneName: "Rick.and.Morty.S09E02.1080p.WEB.mkv",
  seriesType: "standard",
};

describe("mapSubtitle", () => {
  it("passes all fields through unchanged", () => {
    expect(mapSubtitle(RAW_SUBTITLE)).toEqual(RAW_SUBTITLE);
  });

  it("maps forced=true correctly", () => {
    expect(mapSubtitle({ ...RAW_SUBTITLE, forced: true }).forced).toBe(true);
  });
});

describe("mapMovie", () => {
  it("sets kind to movie", () => {
    expect(mapMovie(RAW_MOVIE).kind).toBe("movie");
  });

  it("maps missing_subtitles to missingSubtitles", () => {
    expect(mapMovie(RAW_MOVIE).missingSubtitles).toEqual([RAW_SUBTITLE]);
  });

  it("preserves title, radarrId, and sceneName", () => {
    const m = mapMovie(RAW_MOVIE);
    expect(m.title).toBe("Pressure");
    expect(m.radarrId).toBe(262);
    expect(m.sceneName).toBe("Pressure (2026) [1080p] [WEBRip] [5.1]");
  });

  it("handles null sceneName", () => {
    expect(mapMovie({ ...RAW_MOVIE, sceneName: null }).sceneName).toBeNull();
  });
});

describe("mapEpisode", () => {
  it("sets kind to episode", () => {
    expect(mapEpisode(RAW_EPISODE).kind).toBe("episode");
  });

  it("maps episode_number to episodeNumber", () => {
    expect(mapEpisode(RAW_EPISODE).episodeNumber).toBe("9x2");
  });

  it("maps missing_subtitles to missingSubtitles", () => {
    expect(mapEpisode(RAW_EPISODE).missingSubtitles).toEqual([RAW_SUBTITLE]);
  });

  it("preserves sonarrSeriesId, sonarrEpisodeId, seriesTitle, episodeTitle", () => {
    const e = mapEpisode(RAW_EPISODE);
    expect(e.sonarrSeriesId).toBe(175);
    expect(e.sonarrEpisodeId).toBe(2409);
    expect(e.seriesTitle).toBe("Rick and Morty");
    expect(e.episodeTitle).toBe("Ricks Days, Seven Nights");
  });

  it("handles null sceneName", () => {
    expect(mapEpisode({ ...RAW_EPISODE, sceneName: null }).sceneName).toBeNull();
  });
});

describe("isMovie / isShow", () => {
  const movie = mapMovie(RAW_MOVIE);
  const episode = mapEpisode(RAW_EPISODE);

  it("isMovie returns true for a movie, false for an episode", () => {
    expect(isMovie(movie)).toBe(true);
    expect(isMovie(episode)).toBe(false);
  });

  it("isShow returns true for an episode, false for a movie", () => {
    expect(isShow(episode)).toBe(true);
    expect(isShow(movie)).toBe(false);
  });

  it("isMovie and isShow are mutually exclusive", () => {
    expect(isMovie(movie) && isShow(movie)).toBe(false);
    expect(isMovie(episode) && isShow(episode)).toBe(false);
  });
});
