import type { ArrRelease } from "./clients/arr.types";
import { selectBestRelease } from "./selectBestRelease";

function makeRelease(overrides: Partial<ArrRelease> = {}): ArrRelease {
  return {
    guid: "magnet:test",
    indexerId: 1,
    title: "Show.S01E01.1080p.WEB-DL.KyoGo",
    protocol: "torrent",
    approved: true,
    customFormatScore: 0,
    qualityWeight: 1000,
    seeders: 100,
    age: 5,
    quality: { quality: { id: 3, name: "WEBDL-1080p", source: "webdl", resolution: 1080 } },
    ...overrides,
  };
}

const CANDIDATE = ["Show.S01E01.1080p.WEB-DL.KyoGo"];

describe("selectBestRelease", () => {
  it("returns undefined for an empty release list", () => {
    expect(selectBestRelease([], CANDIDATE)).toBeUndefined();
  });

  it("returns a single approved + title-matching release", () => {
    const r = makeRelease();
    expect(selectBestRelease([r], CANDIDATE)).toBe(r);
  });

  it("returns undefined when the only release is not approved", () => {
    expect(selectBestRelease([makeRelease({ approved: false })], CANDIDATE)).toBeUndefined();
  });

  it("returns undefined when the title does not match any candidate", () => {
    expect(selectBestRelease([makeRelease()], ["Show.S01E01.1080p.WEB-DL.OTHER"])).toBeUndefined();
  });

  it("picks the release with higher customFormatScore", () => {
    const low = makeRelease({ customFormatScore: 5, guid: "low" });
    const high = makeRelease({ customFormatScore: 10, guid: "high" });
    expect(selectBestRelease([low, high], CANDIDATE)?.guid).toBe("high");
  });

  it("uses qualityWeight as tiebreaker when customFormatScore is equal", () => {
    const a = makeRelease({ qualityWeight: 1500, guid: "a" });
    const b = makeRelease({ qualityWeight: 1701, guid: "b" });
    expect(selectBestRelease([a, b], CANDIDATE)?.guid).toBe("b");
  });

  it("uses seeders as tiebreaker for torrents when score and quality are equal", () => {
    const few = makeRelease({ seeders: 50, guid: "few" });
    const many = makeRelease({ seeders: 500, guid: "many" });
    expect(selectBestRelease([few, many], CANDIDATE)?.guid).toBe("many");
  });

  it("prefers usenet over any torrent when score and quality are equal", () => {
    const torrent = makeRelease({ protocol: "torrent", seeders: 9999, guid: "torrent" });
    const usenet = makeRelease({ protocol: "usenet", seeders: undefined, guid: "usenet" });
    expect(selectBestRelease([torrent, usenet], CANDIDATE)?.guid).toBe("usenet");
  });

  it("picks the newer release when all other fields are equal", () => {
    const old = makeRelease({ age: 10, guid: "old" });
    const fresh = makeRelease({ age: 2, guid: "fresh" });
    expect(selectBestRelease([old, fresh], CANDIDATE)?.guid).toBe("fresh");
  });

  it("returns undefined when no release passes both approved and title filters", () => {
    const notApproved = makeRelease({ approved: false });
    const wrongTitle = makeRelease({ title: "Show.S01E01.1080p.WEB-DL.OtherGroup" });
    expect(selectBestRelease([notApproved, wrongTitle], CANDIDATE)).toBeUndefined();
  });

  it("returns undefined when candidateNames is empty", () => {
    expect(selectBestRelease([makeRelease()], [])).toBeUndefined();
  });

  it("matches candidate names case-insensitively via titlesMatch", () => {
    const r = makeRelease({ title: "SHOW.S01E01.1080P.WEB-DL.KYOGO" });
    expect(selectBestRelease([r], CANDIDATE)).toBe(r);
  });
});
