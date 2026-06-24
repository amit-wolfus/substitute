import { rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { loadState, saveState } from "./state";

describe("loadState", () => {
  it("returns empty state when file does not exist", async () => {
    const s = await loadState("/nonexistent/path/that/does-not-exist.json");
    expect(s).toEqual({ items: {} });
  });
});

describe("saveState / loadState round-trip", () => {
  let tmpPath: string;

  beforeEach(() => {
    tmpPath = join(tmpdir(), `substitute-state-test-${Date.now()}.json`);
  });

  afterEach(async () => {
    await rm(tmpPath, { force: true });
  });

  it("persists and restores state correctly", async () => {
    const state = {
      items: {
        "radarr:262:he": { firstSeenMs: 1_000_000, lastActedMs: null },
        "sonarr:2409:he": { firstSeenMs: 2_000_000, lastActedMs: 3_000_000 },
      },
    };
    await saveState(tmpPath, state);
    const loaded = await loadState(tmpPath);
    expect(loaded).toEqual(state);
  });

  it("creates missing parent directories", async () => {
    const nestedDir = join(tmpdir(), `sub-dir-test-${Date.now()}`);
    const nestedPath = join(nestedDir, "nested", "state.json");
    try {
      await saveState(nestedPath, { items: {} });
      const loaded = await loadState(nestedPath);
      expect(loaded).toEqual({ items: {} });
    } finally {
      await rm(nestedDir, { recursive: true, force: true });
    }
  });

  it("overwrites an existing file with new state", async () => {
    await saveState(tmpPath, { items: { "radarr:1:he": { firstSeenMs: 1, lastActedMs: null } } });
    await saveState(tmpPath, { items: {} });
    const loaded = await loadState(tmpPath);
    expect(loaded).toEqual({ items: {} });
  });
});
