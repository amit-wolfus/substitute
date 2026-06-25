import type { ArrRelease } from "./clients/arr.types";
import { titlesMatch } from "./titles-match";

export function selectBestRelease(
  releases: ArrRelease[],
  candidateNames: string[],
): ArrRelease | undefined {
  return releases
    .filter((r) => r.approved && candidateNames.some((name) => titlesMatch(r.title, name)))
    .sort((a, b) => {
      if (b.customFormatScore !== a.customFormatScore) {
        return b.customFormatScore - a.customFormatScore;
      }
      if (b.qualityWeight !== a.qualityWeight) {
        return b.qualityWeight - a.qualityWeight;
      }
      const aSeeders = a.protocol === "torrent" ? (a.seeders ?? 0) : Infinity;
      const bSeeders = b.protocol === "torrent" ? (b.seeders ?? 0) : Infinity;
      if (bSeeders !== aSeeders) {
        return bSeeders - aSeeders;
      }
      return a.age - b.age;
    })[0];
}
