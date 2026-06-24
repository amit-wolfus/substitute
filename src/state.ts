import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname } from "path";

export interface ItemState {
  firstSeenMs: number;
  lastActedMs: number | null;
}

export interface State {
  items: Record<string, ItemState>;
}

export async function loadState(path: string): Promise<State> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as State;
  } catch {
    return { items: {} };
  }
}

export async function saveState(path: string, state: State): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2), "utf-8");
}
