import type { ArrRelease } from "./arr.types";

export class RadarrClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async interactiveSearch(movieId: number): Promise<ArrRelease[]> {
    const res = await fetch(`${this.baseUrl}/api/v3/release?movieId=${movieId}`, {
      headers: { "X-Api-Key": this.apiKey },
    });
    if (!res.ok) throw new Error(`Radarr interactiveSearch failed: ${res.status}`);
    return res.json() as Promise<ArrRelease[]>;
  }

  async grabRelease(release: ArrRelease): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/v3/release`, {
      method: "POST",
      headers: { "X-Api-Key": this.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(release),
    });
    if (!res.ok) throw new Error(`Radarr grabRelease failed: ${res.status}`);
  }
}
