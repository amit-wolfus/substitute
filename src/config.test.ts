import { loadConfig } from "./config";

describe("loadConfig", () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv };
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it("uses sane defaults when no env vars are set", () => {
    delete process.env.POLL_INTERVAL_MINUTES;
    delete process.env.GRACE_MINUTES;
    delete process.env.RECHECK_COOLDOWN_HOURS;
    delete process.env.DRY_RUN;
    delete process.env.LANGUAGE_ALLOWLIST;
    delete process.env.MATCH_REQUIRES;
    delete process.env.STATE_PATH;

    const c = loadConfig();
    expect(c.pollIntervalMs).toBe(15 * 60_000);
    expect(c.graceMs).toBe(10 * 60_000);
    expect(c.recheckCooldownMs).toBe(24 * 3_600_000);
    expect(c.dryRun).toBe(true);
    expect(c.languageAllowlist).toEqual([]);
    expect(c.matchRequires).toEqual(["resolution", "source"]);
    expect(c.statePath).toBe("/data/state.json");
  });

  it("DRY_RUN=false disables dry run", () => {
    process.env.DRY_RUN = "false";
    expect(loadConfig().dryRun).toBe(false);
  });

  it("DRY_RUN unset defaults to true", () => {
    delete process.env.DRY_RUN;
    expect(loadConfig().dryRun).toBe(true);
  });

  it("DRY_RUN=true stays true", () => {
    process.env.DRY_RUN = "true";
    expect(loadConfig().dryRun).toBe(true);
  });

  it("DRY_RUN with any value other than 'false' stays true", () => {
    process.env.DRY_RUN = "yes";
    expect(loadConfig().dryRun).toBe(true);
  });

  it("parses LANGUAGE_ALLOWLIST as a comma-separated list", () => {
    process.env.LANGUAGE_ALLOWLIST = "he,fr,en";
    expect(loadConfig().languageAllowlist).toEqual(["he", "fr", "en"]);
  });

  it("trims whitespace from LANGUAGE_ALLOWLIST entries", () => {
    process.env.LANGUAGE_ALLOWLIST = "he, fr , en";
    expect(loadConfig().languageAllowlist).toEqual(["he", "fr", "en"]);
  });

  it("empty LANGUAGE_ALLOWLIST produces an empty array", () => {
    delete process.env.LANGUAGE_ALLOWLIST;
    expect(loadConfig().languageAllowlist).toEqual([]);
  });

  it("converts POLL_INTERVAL_MINUTES to milliseconds", () => {
    process.env.POLL_INTERVAL_MINUTES = "5";
    expect(loadConfig().pollIntervalMs).toBe(5 * 60_000);
  });

  it("converts GRACE_MINUTES to milliseconds", () => {
    process.env.GRACE_MINUTES = "30";
    expect(loadConfig().graceMs).toBe(30 * 60_000);
  });

  it("converts RECHECK_COOLDOWN_HOURS to milliseconds", () => {
    process.env.RECHECK_COOLDOWN_HOURS = "48";
    expect(loadConfig().recheckCooldownMs).toBe(48 * 3_600_000);
  });
});
