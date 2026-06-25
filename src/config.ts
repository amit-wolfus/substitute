export interface Config {
  bazarrUrl: string;
  bazarrApiKey: string;
  radarrUrl: string;
  radarrApiKey: string;
  sonarrUrl: string;
  sonarrApiKey: string;
  pollIntervalMs: number;
  graceMs: number;
  recheckCooldownMs: number;
  dryRun: boolean;
  languageAllowlist: string[];
  statePath: string;
}

export function loadConfig(): Config {
  const e = process.env;
  return {
    bazarrUrl:           e["BAZARR_URL"]            ?? "http://bazarr:6767",
    bazarrApiKey:        e["BAZARR_API_KEY"]        ?? "",
    radarrUrl:           e["RADARR_URL"]             ?? "http://radarr:7878",
    radarrApiKey:        e["RADARR_API_KEY"]        ?? "",
    sonarrUrl:           e["SONARR_URL"]             ?? "http://sonarr:8989",
    sonarrApiKey:        e["SONARR_API_KEY"]        ?? "",
    pollIntervalMs:      Number(e["POLL_INTERVAL_MINUTES"]  ?? 15) * 60_000,
    graceMs:             Number(e["GRACE_MINUTES"]          ?? 10) * 60_000,
    recheckCooldownMs:   Number(e["RECHECK_COOLDOWN_HOURS"] ?? 24) * 3_600_000,
    dryRun:              (e["DRY_RUN"] ?? "true") !== "false",
    languageAllowlist:   e["LANGUAGE_ALLOWLIST"]
                           ? e["LANGUAGE_ALLOWLIST"].split(",").map((s) => s.trim())
                           : [],
    statePath:           e["STATE_PATH"] ?? "/data/state.json",
  };
}
