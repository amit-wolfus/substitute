import type { Config } from "./config.js";
import { loadState, saveState } from "./state.js";
import type { BazarrClient } from "./clients/BazarrClient.js";
import type { SonarrClient } from "./clients/SonarrClient.js";
import type { RadarrClient } from "./clients/RadarrClient.js";
import type { OpenSubtitlesClient } from "./clients/OpenSubtitlesClient.js";

export class SubstituteService {
  constructor(
    private readonly config: Config,
    private readonly bazarr: BazarrClient,
    private readonly sonarr: SonarrClient,
    private readonly radarr: RadarrClient,
    private readonly openSubtitles: OpenSubtitlesClient,
  ) {}

  async runOnce(): Promise<void> {
    console.log("[substitute] poll cycle — not yet implemented");
    const state = await loadState(this.config.statePath);
    await saveState(this.config.statePath, state);
  }
}
