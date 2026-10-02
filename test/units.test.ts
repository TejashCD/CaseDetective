import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../src/server/config.ts";
import { CaseStore } from "../src/server/game/case-store.ts";
import { DEMO_CASE } from "../src/server/game/demo-case.ts";
import { gradeAccusationOffline, gradeTalkOffline } from "../src/server/game/offline-grader.ts";
import type { CaseFile, CaseProgress, CaseWitness } from "../src/server/game/types.ts";

describe("loadConfig", () => {
  it("applies defaults", () => {
    assert.deepEqual(loadConfig({}), { port: 3000, model: "claude-opus-5-5", talkEffort: "low", apiKey: "" });
  });

  it("reads overrides and trims whitespace", () => {
    const config = loadConfig({ PORT: "8080", MODEL_ID: " m ", TALK_EFFORT: "medium", ANTHROPIC_API_KEY: " k " });
    assert.deepEqual(config, { port: 8080, model: "m", talkEffort: "medium", apiKey: "k" });
  });

  it("rejects an invalid port or effort", () => {
    assert.throws(() => loadConfig({ PORT: "abc" }), /PORT/);
    assert.throws(() => loadConfig({ PORT: "70000" }), /PORT/);
    assert.throws(() => loadConfig({ TALK_EFFORT: "extreme" }), /TALK_EFFORT/);
  });
});

describe("CaseStore", () => {
  const data = { caseFile: {} as CaseFile, progress: {} as CaseProgress, demo: false };

  it("evicts the least recently used case when full", () => {
    const store = new CaseStore({ maxCases: 2 });
    const a = store.add(data);
    const b = store.add(data);
    store.get(a.id); // a is now the most recently used
    const c = store.add(data);
    assert.ok(store.get(a.id));
    assert.equal(store.get(b.id), undefined);
    assert.ok(store.get(c.id));
    assert.equal(store.size, 2);
  });

  it("expires idle cases", () => {
    let now = 0;
    const store = new CaseStore({ ttlMs: 1000, now: () => now });
    const record = store.add(data);
    now = 900;
    assert.ok(store.get(record.id), "access refreshes the timer");
    now = 1800;
    assert.ok(store.get(record.id));
    now = 2900;
    assert.equal(store.get(record.id), undefined);
  });
});

describe("offline grading", () => {
  const witnesses = DEMO_CASE.npcs.map((w, i) => ({ ...w, color: `#00000${i}` })) as [CaseWitness, CaseWitness, CaseWitness];
  const [seller, banker, farmer] = witnesses;

  it("awards a clue when the answer names the concept", () => {
    const result = gradeTalkOffline(seller, "The price would DROP sharply.");
    assert.equal(result.understanding, "full");
    assert.equal(result.suspicion_delta, 0);
    assert.equal(result.feedback_note, "");
  });

  it("treats questions and long attempts kindly, and short guesses as careless", () => {
    assert.equal(gradeTalkOffline(banker, "hint?").suspicion_delta, 0);
    const attempt = gradeTalkOffline(banker, "I think it depends on the people buying it");
    assert.equal(attempt.understanding, "partial");
    assert.equal(attempt.suspicion_delta, 0);
    const guess = gradeTalkOffline(banker, "dunno");
    assert.equal(guess.understanding, "none");
    assert.ok(guess.suspicion_delta > 0);
  });

  it("grades the accusation by concept coverage", () => {
    const all = gradeAccusationOffline(witnesses, "A crash after a surplus, elastic luxury demand, and pollution.");
    assert.equal(all.verdict, "solved");
    assert.deepEqual(all.missing, []);

    const two = gradeAccusationOffline(witnesses, "Prices crashed and buyers of a luxury fled.");
    assert.equal(two.verdict, "partial");
    assert.deepEqual(two.missing, [farmer.concept]);

    assert.equal(gradeAccusationOffline(witnesses, "Bad luck.").verdict, "no");
  });
});
