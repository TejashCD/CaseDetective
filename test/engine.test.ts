import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MalformedOutputError } from "../src/server/ai/errors.ts";
import { TalkSchema } from "../src/server/ai/schemas.ts";
import { CaseStore } from "../src/server/game/case-store.ts";
import { Game } from "../src/server/game/engine.ts";
import { ActionNotAllowedError, CaseNotFoundError, InputTooLargeError, InvalidInputError } from "../src/server/game/errors.ts";
import { SUSPICION, WITNESS_COLORS } from "../src/server/game/rules.ts";
import { defaultAnswer, fakeAi, SAMPLE_CASE, silentLogger, talkQueue } from "./helpers/fakes.ts";

function setup(respond?: Parameters<typeof fakeAi>[0]) {
  const ai = fakeAi(respond);
  const game = new Game({ ai, store: new CaseStore(), talkEffort: "low", logger: silentLogger });
  return { ai, game };
}

async function earnAllClues(game: Game, id: string): Promise<void> {
  for (const i of [0, 1, 2]) await game.talk(id, i, "answer");
}

describe("startCase", () => {
  it("creates a case and keeps secret fields out of the public view", async () => {
    const { game } = setup();
    const view = await game.startCase("Chemistry notes");

    assert.equal(view.title, SAMPLE_CASE.title);
    assert.deepEqual(
      view.npcs.map((n) => n.color),
      [...WITNESS_COLORS],
    );
    const [first] = view.npcs;
    assert.ok(first);
    assert.equal(first.sign, "LABORATORIUM", "signs are uppercased and capped at 12 characters");
    assert.equal(first.clue, null);
    const json = JSON.stringify(view);
    for (const secret of ["solution", "reveal_condition", "Combustion, oxidation", "Clue 1"]) {
      assert.ok(!json.includes(secret), `public view leaks ${secret}`);
    }
    assert.deepEqual(view.state, { clues: [false, false, false], suspicion: SUSPICION.start, verdict: null, attempts: 0 });
  });

  it("rejects empty and oversized material without calling the model", async () => {
    const { game, ai } = setup();
    await assert.rejects(game.startCase("  "), InvalidInputError);
    await assert.rejects(game.startCase("x".repeat(40_001)), InputTooLargeError);
    assert.equal(ai.calls.length, 0);
  });

  it("retries when fewer than three witnesses come back", async () => {
    const { game, ai } = setup();
    await game.startCase("notes");
    const validate = ai.calls[0]?.validate;
    assert.ok(validate);
    assert.throws(() => validate({ npcs: [{}, {}] }), MalformedOutputError);
    assert.doesNotThrow(() => validate({ npcs: [{}, {}, {}] }));
  });
});

describe("talk", () => {
  it("awards the clue on full understanding", async () => {
    const { game } = setup(talkQueue({ understanding: "full", reply: "Here's the clue." }));
    const { id } = await game.startCase("notes");
    const result = await game.talk(id, 1, "A great answer");

    assert.equal(result.clue, "Clue 2");
    assert.deepEqual(result.state.clues, [false, true, false]);
    assert.equal(result.quickReplies.length, 3);
    assert.equal(game.getCase(id).npcs[1]?.clue, "Clue 2");
  });

  it("awards a clue once and adds no suspicion after it is earned", async () => {
    const { game } = setup(talkQueue({ understanding: "full" }, { understanding: "full", suspicion_delta: 15 }));
    const { id } = await game.startCase("notes");
    await game.talk(id, 0, "answer");
    const second = await game.talk(id, 0, "follow-up");

    assert.equal(second.clue, null);
    assert.equal(second.suspicionDelta, 0);
    assert.equal(second.state.suspicion, SUSPICION.start);
  });

  it("clamps the suspicion change", async () => {
    const { game } = setup(talkQueue({ suspicion_delta: 99 }, { suspicion_delta: -20 }));
    const { id } = await game.startCase("notes");

    assert.equal((await game.talk(id, 0, "wrong")).suspicionDelta, SUSPICION.maxPenalty);
    assert.equal((await game.talk(id, 0, "wrong")).suspicionDelta, 0);
  });

  it("throws the player out at maximum suspicion and resets the meter", async () => {
    const { game } = setup(talkQueue(...Array.from({ length: 6 }, () => ({ suspicion_delta: 15 }))));
    const { id } = await game.startCase("notes");

    let ejected = false;
    let suspicion = 0;
    for (let i = 0; i < 6 && !ejected; i++)
      ({
        ejected,
        state: { suspicion },
      } = await game.talk(id, 0, "nonsense"));
    assert.equal(ejected, true);
    assert.equal(suspicion, SUSPICION.afterEjection);
    assert.equal(game.getReport(id).ejections, 1);
  });

  it("validates the witness and the message", async () => {
    const { game } = setup();
    const { id } = await game.startCase("notes");
    await assert.rejects(game.talk(id, 3, "hi"), InvalidInputError);
    await assert.rejects(game.talk(id, "x", "hi"), InvalidInputError);
    await assert.rejects(game.talk(id, 0, "   "), InvalidInputError);
    await assert.rejects(game.talk("missing", 0, "hi"), CaseNotFoundError);
  });

  it("only sends recent conversation to the model", async () => {
    const { game, ai } = setup();
    const { id } = await game.startCase("notes");
    for (let i = 0; i < 12; i++) await game.talk(id, 0, `message ${i}`);
    const lastPrompt = ai.calls.at(-1)?.user ?? "";
    assert.ok(!lastPrompt.includes("Student: message 0\n"));
    assert.ok(lastPrompt.includes("Student: message 10"));
  });

  it("passes model failures through for generated cases", async () => {
    const { game } = setup((options) => {
      if (options.schema === TalkSchema) throw new Error("offline");
      return defaultAnswer(options);
    });
    const { id } = await game.startCase("notes");
    await assert.rejects(game.talk(id, 0, "hello"), /offline/);
  });
});

describe("demo case", () => {
  it("falls back to keyword grading when the model is unavailable", async () => {
    const { game } = setup(() => {
      throw new Error("no network");
    });
    const { id, demo } = game.startDemo();
    assert.equal(demo, true);

    const miss = await game.talk(id, 0, "no idea");
    assert.equal(miss.offline, true);
    assert.equal(miss.clue, null);

    const hit = await game.talk(id, 0, "The price will fall because of the surplus");
    assert.equal(hit.offline, true);
    assert.match(hit.clue ?? "", /Receipt/);
  });
});

describe("accuse", () => {
  it("requires all three clues", async () => {
    const { game } = setup();
    const { id } = await game.startCase("notes");
    await assert.rejects(game.accuse(id, "It was the butler, obviously."), ActionNotAllowedError);
  });

  it("records a solved verdict and counts attempts", async () => {
    const { game } = setup(talkQueue({ understanding: "full" }, { understanding: "full" }, { understanding: "full" }));
    const { id } = await game.startCase("notes");
    await earnAllClues(game, id);

    await assert.rejects(game.accuse(id, "short"), InvalidInputError);
    const result = await game.accuse(id, "A long and thorough explanation.");
    assert.equal(result.verdict, "solved");
    assert.equal(result.state.verdict, "solved");
    assert.equal(result.state.attempts, 1);
  });
});

describe("getReport", () => {
  it("reveals the solution and removes duplicate review notes", async () => {
    const note = { feedback_note: "Review combustion." };
    const { game } = setup(talkQueue(note, note, { feedback_note: "Review oxidation." }));
    const { id } = await game.startCase("notes");
    await game.talk(id, 0, "a");
    await game.talk(id, 0, "b");
    await game.talk(id, 1, "c");

    const report = game.getReport(id);
    assert.equal(report.solution, SAMPLE_CASE.solution);
    assert.deepEqual(
      report.notes.map((n) => n.note),
      ["Review combustion.", "Review oxidation."],
    );
    assert.deepEqual(
      report.concepts.map((c) => c.exchanges),
      [2, 1, 0],
    );
  });
});
