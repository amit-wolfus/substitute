import { setTimeout as sleep } from "timers/promises";
import { loadConfig } from "./config";
import { BazarrClient } from "./clients/bazarr";
import { SonarrClient } from "./clients/SonarrClient";
import { RadarrClient } from "./clients/RadarrClient";
import { SubstituteService } from "./SubstituteService";

async function main(): Promise<void> {
  const config = loadConfig();

  const service = new SubstituteService(
    config,
    new BazarrClient(config.bazarrUrl, config.bazarrApiKey),
    new SonarrClient(config.sonarrUrl, config.sonarrApiKey),
    new RadarrClient(config.radarrUrl, config.radarrApiKey),
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
