import crypto from "node:crypto";
import type { CaseFile, CaseProgress, CaseRecord } from "./types.ts";

interface CaseStoreOptions {
  maxCases?: number;
  ttlMs?: number;
  now?: () => number;
}

/**
 * In-memory LRU store with an idle timeout. Cases are lost on restart.
 * Map keeps insertion order, so re-inserting on access keeps the oldest entry first.
 */
export class CaseStore {
  readonly #records = new Map<string, CaseRecord>();
  readonly #maxCases: number;
  readonly #ttlMs: number;
  readonly #now: () => number;

  constructor({ maxCases = 500, ttlMs = 12 * 60 * 60 * 1000, now = Date.now }: CaseStoreOptions = {}) {
    this.#maxCases = maxCases;
    this.#ttlMs = ttlMs;
    this.#now = now;
  }

  get size(): number {
    return this.#records.size;
  }

  add(data: { caseFile: CaseFile; progress: CaseProgress; demo: boolean }): CaseRecord {
    const now = this.#now();
    const record: CaseRecord = { id: crypto.randomUUID(), ...data, createdAt: now, touchedAt: now };
    this.#records.set(record.id, record);
    while (this.#records.size > this.#maxCases) {
      const oldest = this.#records.keys().next().value;
      if (oldest === undefined) break;
      this.#records.delete(oldest);
    }
    return record;
  }

  get(id: string): CaseRecord | undefined {
    const record = this.#records.get(id);
    if (!record) return undefined;

    this.#records.delete(id);
    const now = this.#now();
    if (now - record.touchedAt > this.#ttlMs) return undefined;

    record.touchedAt = now;
    this.#records.set(id, record);
    return record;
  }
}
