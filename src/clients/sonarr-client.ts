import type { ArrRelease } from "./arr.types";

export class SonarrClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async interactiveSearch(seriesId: number, episodeId: number): Promise<ArrRelease[]> {
    const res = await fetch(
      `${this.baseUrl}/api/v3/release?seriesId=${seriesId}&episodeId=${episodeId}`,
      { headers: { "X-Api-Key": this.apiKey } },
    );
    if (!res.ok) {
      throw new Error(`Sonarr interactiveSearch failed: ${res.status}`);
    }
    return res.json() as Promise<ArrRelease[]>;
  }

  async grabRelease(release: ArrRelease): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/v3/release`, {
      method: "POST",
      headers: { "X-Api-Key": this.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(release),
    });
    if (!res.ok) {
      throw new Error(`Sonarr grabRelease failed: ${res.status}`);
    }
  }
}
