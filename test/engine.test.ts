import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MalformedOutputError } from "../src/server/ai/errors.ts";
import { TalkSchema } from "../src/server/ai/schemas.ts";
import { CaseSealer } from "../src/server/game/case-sealer.ts";
import { Game } from "../src/server/game/engine.ts";
import { ActionNotAllowedError, CaseNotFoundError, InputTooLargeError, InvalidInputError } from "../src/server/game/errors.ts";
import { HISTORY_WINDOW, SUSPICION, WITNESS_COLORS } from "../src/server/game/rules.ts";
import type { AccuseResponse, TalkResponse } from "../src/shared/api.ts";
import { defaultAnswer, fakeAi, SAMPLE_CASE, silentLogger, talkQueue } from "./helpers/fakes.ts";

function setup(respond?: Parameters<typeof fakeAi>[0]) {
  const ai = fakeAi(respond);
  const game = new Game({ ai, sealer: new CaseSealer("test-secret"), talkEffort: "low", logger: silentLogger });
  return { ai, game };
}

/** Plays one case like the client does: always sending the latest token. */
class Player {
  readonly game: Game;
  token: string;

  constructor(game: Game, token: string) {
    this.game = game;
    this.token = token;
  }

  static async start(game: Game): Promise<Player> {
    return new Player(game, (await game.startCase("notes")).token);
  }

  async talk(witness: unknown, text: unknown): Promise<TalkResponse> {
    const result = await this.game.talk(this.token, witness, text);
    this.token = result.token;
    return result;
  }

  async accuse(text: unknown): Promise<AccuseResponse> {
    const result = await this.game.accuse(this.token, text);
    this.token = result.token;
    return result;
  }
}

describe("startCase", () => {
  it("creates a case and keeps secret fields out of the public view", async () => {
    const { game } = setup();
    const { case: view, token } = await game.startCase("Chemistry notes");

    assert.equal(view.title, SAMPLE_CASE.title);
    assert.deepEqual(
      view.npcs.map((n) => n.color),
      [...WITNESS_COLORS],
    );
    const [first] = view.npcs;
    assert.ok(first);
    assert.equal(first.sign, "LABORATORIUM", "signs are uppercased and capped at 12 characters");
    assert.equal(first.clue, null);
    const visible = JSON.stringify(view) + token;
    for (const secret of ["solution", "reveal_condition", "Combustion, oxidation", "Clue 1"]) {
      assert.ok(!visible.includes(secret), `leaks ${secret}`);
    }
    assert.deepEqual(view.state, { clues: [false, false, false], suspicion: SUSPICION.start, verdict: null, attempts: 0 });
  });

  it("rejects empty and oversized material without calling the model", async () => {
    const { game, ai } = setup();
    await assert.rejects(game.startCase("  "), InvalidInputError);
    await assert.rejects(game.startCase(42), InvalidInputError);
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
    const player = await Player.start(game);
    const result = await player.talk(1, "A great answer");

    assert.equal(result.clue, "Clue 2");
    assert.deepEqual(result.state.clues, [false, true, false]);
    assert.equal(result.quickReplies.length, 3);
    assert.equal(game.getCase(player.token).npcs[1]?.clue, "Clue 2");
  });

  it("awards a clue once and adds no suspicion after it is earned", async () => {
    const { game } = setup(talkQueue({ understanding: "full" }, { understanding: "full", suspicion_delta: 15 }));
    const player = await Player.start(game);
    await player.talk(0, "answer");
    const second = await player.talk(0, "follow-up");

    assert.equal(second.clue, null);
    assert.equal(second.suspicionDelta, 0);
    assert.equal(second.state.suspicion, SUSPICION.start);
  });

  it("clamps the suspicion change", async () => {
    const { game } = setup(talkQueue({ suspicion_delta: 99 }, { suspicion_delta: -20 }));
    const player = await Player.start(game);

    assert.equal((await player.talk(0, "wrong")).suspicionDelta, SUSPICION.maxPenalty);
    assert.equal((await player.talk(0, "wrong")).suspicionDelta, 0);
  });

  it("throws the player out at maximum suspicion and resets the meter", async () => {
    const { game } = setup(talkQueue(...Array.from({ length: 6 }, () => ({ suspicion_delta: 15 }))));
    const player = await Player.start(game);

    let result: TalkResponse | undefined;
    for (let i = 0; i < 6 && !result?.ejected; i++) result = await player.talk(0, "nonsense");
    assert.equal(result?.ejected, true);
    assert.equal(result.state.suspicion, SUSPICION.afterEjection);
    assert.equal(game.getReport(player.token).ejections, 1);
  });

  it("validates the witness, the message and the token", async () => {
    const { game } = setup();
    const player = await Player.start(game);
    await assert.rejects(player.talk(3, "hi"), InvalidInputError);
    await assert.rejects(player.talk("x", "hi"), InvalidInputError);
    await assert.rejects(player.talk(0, "   "), InvalidInputError);
    await assert.rejects(game.talk("not-a-token", 0, "hi"), CaseNotFoundError);
    await assert.rejects(game.talk(undefined, 0, "hi"), CaseNotFoundError);
  });

  it("keeps only recent conversation but counts every answer", async () => {
    const { game, ai } = setup();
    const player = await Player.start(game);
    for (let i = 0; i < 12; i++) await player.talk(0, `message ${i}`);
    const lastPrompt = ai.calls.at(-1)?.user ?? "";
    assert.ok(!lastPrompt.includes("Student: message 0\n"));
    assert.ok(lastPrompt.includes(`Student: message ${12 - HISTORY_WINDOW}`));
    assert.equal(game.getReport(player.token).concepts[0]?.exchanges, 12);
  });

  it("passes model failures through for generated cases", async () => {
    const { game } = setup((options) => {
      if (options.schema === TalkSchema) throw new Error("offline");
      return defaultAnswer(options);
    });
    const player = await Player.start(game);
    await assert.rejects(player.talk(0, "hello"), /offline/);
  });
});

describe("demo case", () => {
  it("falls back to keyword grading when the model is unavailable", async () => {
    const { game } = setup(() => {
      throw new Error("no network");
    });
    const started = game.startDemo();
    assert.equal(started.case.demo, true);
    const player = new Player(game, started.token);

    const miss = await player.talk(0, "no idea");
    assert.equal(miss.offline, true);
    assert.equal(miss.clue, null);

    const hit = await player.talk(0, "The price will fall because of the surplus");
    assert.equal(hit.offline, true);
    assert.match(hit.clue ?? "", /Receipt/);
  });
});

describe("accuse", () => {
  it("requires all three clues", async () => {
    const { game } = setup();
    const player = await Player.start(game);
    await assert.rejects(player.accuse("It was the butler, obviously."), ActionNotAllowedError);
  });

  it("records a solved verdict and counts attempts", async () => {
    const { game } = setup(talkQueue({ understanding: "full" }, { understanding: "full" }, { understanding: "full" }));
    const player = await Player.start(game);
    for (const i of [0, 1, 2]) await player.talk(i, "answer");

    await assert.rejects(player.accuse("short"), InvalidInputError);
    const result = await player.accuse("A long and thorough explanation.");
    assert.equal(result.verdict, "solved");
    assert.equal(result.state.verdict, "solved");
    assert.equal(result.state.attempts, 1);
  });
});

describe("getReport", () => {
  it("reveals the solution and removes duplicate review notes", async () => {
    const note = { feedback_note: "Review combustion." };
    const { game } = setup(talkQueue(note, note, { feedback_note: "Review oxidation." }));
    const player = await Player.start(game);
    await player.talk(0, "a");
    await player.talk(0, "b");
    await player.talk(1, "c");

    const report = game.getReport(player.token);
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
