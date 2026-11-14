import type { SpecVibeState, StateEvent } from '../types.js';
import { readJson, writeJson } from './fs.js';
import { projectPaths } from './paths.js';
import { nowIso } from './utils.js';

export const DEFAULT_STATE: SpecVibeState = {
  version: 1,
  activeTrack: null,
  history: [],
};

export async function loadState(root: string): Promise<SpecVibeState> {
  const state = await readJson<SpecVibeState>(
    projectPaths(root).state,
    structuredClone(DEFAULT_STATE),
  );
  return {
    ...structuredClone(DEFAULT_STATE),
    ...state,
    history: Array.isArray(state.history) ? state.history : [],
  };
}

export async function saveState(root: string, state: SpecVibeState): Promise<void> {
  await writeJson(projectPaths(root).state, state);
}

export async function updateState(
  root: string,
  update: (state: SpecVibeState) => SpecVibeState | undefined,
): Promise<SpecVibeState> {
  const state = await loadState(root);
  const maybeNext = update(state);
  const next = maybeNext ?? state;
  await saveState(root, next);
  return next;
}

export async function appendHistory(
  root: string,
  event: Omit<StateEvent, 'at'> & { at?: string },
): Promise<void> {
  await updateState(root, (state) => {
    state.history.push({ ...event, at: event.at ?? nowIso() });
    if (state.history.length > 250) state.history = state.history.slice(-250);
    return state;
  });
}

export async function setActiveTrack(root: string, slug: string | null): Promise<void> {
  await updateState(root, (state) => {
    state.activeTrack = slug;
    return state;
  });
}
