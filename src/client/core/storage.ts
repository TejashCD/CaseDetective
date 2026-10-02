// Storage wrappers that never throw (storage can be disabled or full in private windows).

const PREFIX = "casedetective.";

function safely<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export interface SafeStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  getJson<T>(key: string): T | null;
  setJson(key: string, value: unknown): void;
}

function wrap(area: () => Storage): SafeStorage {
  return {
    get: (key) => safely(() => area().getItem(PREFIX + key), null),
    set: (key, value) => safely(() => area().setItem(PREFIX + key, value), undefined),
    remove: (key) => safely(() => area().removeItem(PREFIX + key), undefined),
    getJson: <T>(key: string) => safely(() => JSON.parse(area().getItem(PREFIX + key) ?? "null") as T | null, null),
    setJson: (key, value) => safely(() => area().setItem(PREFIX + key, JSON.stringify(value)), undefined),
  };
}

/** Cleared when the tab closes; survives refreshes. */
export const sessionStore = wrap(() => sessionStorage);
export const localStore = wrap(() => localStorage);
