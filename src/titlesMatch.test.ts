import { titlesMatch } from "./titlesMatch";

describe("titlesMatch", () => {
  it("matches identical strings", () => {
    expect(titlesMatch("Show.S01E01.1080p.WEB-DL.KyoGo", "Show.S01E01.1080p.WEB-DL.KyoGo")).toBe(true);
  });

  it("matches when one uses spaces and the other dots", () => {
    expect(titlesMatch("Show S01E01 1080p WEB-DL KyoGo", "Show.S01E01.1080p.WEB-DL.KyoGo")).toBe(true);
  });

  it("matches when one uses underscores and the other dots", () => {
    expect(titlesMatch("Show_S01E01_1080p_WEB-DL_KyoGo", "Show.S01E01.1080p.WEB-DL.KyoGo")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(titlesMatch("SHOW.S01E01.1080P.WEB-DL.KYOGO", "Show.S01E01.1080p.WEB-DL.KyoGo")).toBe(true);
  });

  it("does not match different release groups", () => {
    expect(titlesMatch("Show.S01E01.1080p.WEB-DL.KyoGo", "Show.S01E01.1080p.WEB-DL.OtherGroup")).toBe(false);
  });

  it("does not match different resolutions", () => {
    expect(titlesMatch("Show.S01E01.1080p.WEB-DL.KyoGo", "Show.S01E01.720p.WEB-DL.KyoGo")).toBe(false);
  });

  it("returns false when a is empty", () => {
    expect(titlesMatch("", "Show.S01E01.1080p.WEB-DL")).toBe(false);
  });

  it("returns false when b is empty", () => {
    expect(titlesMatch("Show.S01E01.1080p.WEB-DL", "")).toBe(false);
  });

  it("collapses consecutive separators", () => {
    expect(titlesMatch("Show..S01E01..1080p", "Show.S01E01.1080p")).toBe(true);
  });

  it("preserves hyphens — WEB.DL and WEB-DL are not equal", () => {
    expect(titlesMatch("Show.S01E01.1080p.WEB.DL.KyoGo", "Show.S01E01.1080p.WEB-DL.KyoGo")).toBe(false);
  });
});
