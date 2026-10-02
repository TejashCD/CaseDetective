import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../src/server/config.ts";
import { CaseSealer } from "../src/server/game/case-sealer.ts";
import { DEMO_CASE } from "../src/server/game/demo-case.ts";
import { CaseNotFoundError } from "../src/server/game/errors.ts";
import { gradeAccusationOffline, gradeTalkOffline } from "../src/server/game/offline-grader.ts";
import type { CaseFile, CaseProgress, CaseRecord, CaseWitness } from "../src/server/game/types.ts";

describe("loadConfig", () => {
  it("applies defaults", () => {
    assert.deepEqual(loadConfig({}), { port: 3000, model: "claude-opus-5-5", talkEffort: "low", apiKey: "", caseSecret: "" });
  });

  it("reads overrides and trims whitespace", () => {
    const config = loadConfig({ PORT: "8080", MODEL_ID: " m ", TALK_EFFORT: "medium", ANTHROPIC_API_KEY: " k ", CASE_SECRET: "s" });
    assert.deepEqual(config, { port: 8080, model: "m", talkEffort: "medium", apiKey: "k", caseSecret: "s" });
  });

  it("rejects an invalid port or effort", () => {
    assert.throws(() => loadConfig({ PORT: "abc" }), /PORT/);
    assert.throws(() => loadConfig({ PORT: "70000" }), /PORT/);
    assert.throws(() => loadConfig({ TALK_EFFORT: "extreme" }), /TALK_EFFORT/);
  });
});

describe("CaseSealer", () => {
  const record: CaseRecord = {
    id: "case-1",
    demo: false,
    caseFile: { title: "Secret title", solution: "The butler" } as CaseFile,
    progress: { suspicion: 42 } as CaseProgress,
    createdAt: 1,
  };

  it("round-trips a record without exposing its contents", () => {
    const sealer = new CaseSealer("secret");
    const token = sealer.seal(record);
    assert.ok(!token.includes("butler"));
    assert.deepEqual(sealer.open(token), record);
  });

  it("rejects tampered tokens and tokens from another secret", () => {
    const token = new CaseSealer("secret").seal(record);
    const flipped = token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA");
    assert.throws(() => new CaseSealer("secret").open(flipped), CaseNotFoundError);
    assert.throws(() => new CaseSealer("other").open(token), CaseNotFoundError);
    assert.throws(() => new CaseSealer("secret").open("garbage"), CaseNotFoundError);
    assert.throws(() => new CaseSealer("secret").open(null), CaseNotFoundError);
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
