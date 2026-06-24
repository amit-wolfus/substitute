import { setTimeout as sleep } from "timers/promises";
import { loadConfig } from "./config.js";
import { BazarrClient } from "./clients/bazarr/index.js";
import { SonarrClient } from "./clients/SonarrClient.js";
import { RadarrClient } from "./clients/RadarrClient.js";
import { OpenSubtitlesClient } from "./clients/OpenSubtitlesClient.js";
import { SubstituteService } from "./SubstituteService.js";

async function main(): Promise<void> {
  const config = loadConfig();

  const service = new SubstituteService(
    config,
    new BazarrClient(config.bazarrUrl, config.bazarrApiKey),
    new SonarrClient(config.sonarrUrl, config.sonarrApiKey),
    new RadarrClient(config.radarrUrl, config.radarrApiKey),
    new OpenSubtitlesClient(config.openSubtitlesApiKey),
  );

  console.log(
    `[substitute] starting — dryRun=${config.dryRun}` +
      ` poll=${config.pollIntervalMs / 60_000}m` +
      ` grace=${config.graceMs / 60_000}m`,
  );

  while (true) {
    await service.runOnce();
    await sleep(config.pollIntervalMs);
  }
}

main().catch((err: unknown) => {
  console.error("[substitute] fatal:", err);
  process.exit(1);
});
