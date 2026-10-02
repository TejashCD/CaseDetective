import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { RefusalError } from "../src/server/ai/errors.ts";
import { CaseSchema } from "../src/server/ai/schemas.ts";
import { createApp } from "../src/server/app.ts";
import { CaseSealer } from "../src/server/game/case-sealer.ts";
import { Game } from "../src/server/game/engine.ts";
import { resolveFile } from "../src/server/http/static.ts";
import type { CaseReport, CaseStarted, CaseView, ErrorResponse, TalkResponse } from "../src/shared/api.ts";
import { defaultAnswer, fakeAi, SAMPLE_CASE, silentLogger } from "./helpers/fakes.ts";

let server: Server;
let baseUrl: string;
let staticRoot: string;
let refuseNextCase = false;

before(async () => {
  // Two static roots, like production: hand-written assets and compiled scripts.
  staticRoot = await mkdtemp(path.join(os.tmpdir(), "casedetective-"));
  const assets = path.join(staticRoot, "public");
  const compiled = path.join(staticRoot, "web");
  await mkdir(path.join(compiled, "client"), { recursive: true });
  await mkdir(assets);
  await writeFile(path.join(assets, "index.html"), '<script type="module" src="client/main.js"></script>');
  await writeFile(path.join(compiled, "client", "main.js"), "export {};");

  const ai = fakeAi((options) => {
    if (options.schema === CaseSchema && refuseNextCase) {
      refuseNextCase = false;
      throw new RefusalError("declined");
    }
    return defaultAnswer(options);
  });
  const game = new Game({ ai, sealer: new CaseSealer("test-secret"), talkEffort: "low", logger: silentLogger });
  server = createApp({ game, ai, staticDirs: [assets, compiled], logger: silentLogger });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(staticRoot, { recursive: true, force: true });
});

function post(pathname: string, body: unknown): Promise<Response> {
  return fetch(baseUrl + pathname, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function errorOf(response: Response): Promise<string> {
  return ((await response.json()) as ErrorResponse).error;
}

describe("API", () => {
  it("reports health", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, model: "test-model", keyConfigured: true });
  });

  it("plays a case by passing the token along: create, talk, accuse too early, view, report", async () => {
    const created = await post("/api/case", { material: "Chemistry" });
    assert.equal(created.status, 200);
    const { case: view, token } = (await created.json()) as CaseStarted;
    assert.equal(view.title, SAMPLE_CASE.title);

    const talk = await post("/api/case/talk", { token, npc: 0, text: "Hello" });
    assert.equal(talk.status, 200);
    const { token: next } = (await talk.json()) as TalkResponse;
    assert.notEqual(next, token);

    const early = await post("/api/case/accuse", { token: next, text: "It was all three concepts at once." });
    assert.equal(early.status, 403);

    const fetched = (await (await post("/api/case/view", { token: next })).json()) as CaseView;
    assert.equal(fetched.id, view.id);

    const report = (await (await post("/api/case/report", { token: next })).json()) as CaseReport;
    assert.equal(report.solution, SAMPLE_CASE.solution);
    assert.equal(report.concepts[0]?.exchanges, 1);
  });

  it("starts the demo case", async () => {
    const { case: view } = (await (await post("/api/demo", {})).json()) as CaseStarted;
    assert.equal(view.demo, true);
    assert.equal(view.title, "The Case of the Vanished Tulips");
  });

  it("returns readable errors", async () => {
    const cases: [Promise<Response>, number, RegExp][] = [
      [post("/api/case", { material: "" }), 400, /Paste some notes/],
      [post("/api/case", "{not json"), 400, /Malformed/],
      [post("/api/case", "[1,2]"), 400, /Malformed/],
      [post("/api/case", { material: "x".repeat(250_000) }), 413, /too much text/],
      [post("/api/case/view", { token: "nope" }), 404, /can't be opened/],
      [post("/api/case/talk", { npc: 0, text: "hi" }), 404, /can't be opened/],
      [fetch(`${baseUrl}/api/unknown`), 404, /Not found/],
      [fetch(`${baseUrl}/api/case`), 405, /Method not allowed/],
    ];
    for (const [request, status, message] of cases) {
      const res = await request;
      assert.equal(res.status, status);
      assert.match(await errorOf(res), message);
    }
  });

  it("maps a model refusal to 422", async () => {
    refuseNextCase = true;
    const res = await post("/api/case", { material: "Biology" });
    assert.equal(res.status, 422);
    assert.match(await errorOf(res), /declined/);
  });

  it("sends no-store and security headers", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  });
});

describe("static files", () => {
  it("serves the page and compiled scripts from separate roots", async () => {
    const page = await fetch(`${baseUrl}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type") ?? "", /text\/html/);

    const script = await fetch(`${baseUrl}/client/main.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get("content-type") ?? "", /javascript/);
  });

  it("returns 404 for missing files and 405 for writes", async () => {
    assert.equal((await fetch(`${baseUrl}/nope.js`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/client`)).status, 404, "directories are not listed");
    assert.equal((await fetch(`${baseUrl}/index.html`, { method: "DELETE" })).status, 405);
  });

  it("rejects malformed paths", async () => {
    assert.equal((await fetch(`${baseUrl}/%E0%A4%A`)).status, 400);
  });

  it("never resolves a path outside the root", () => {
    const root = path.resolve("public");
    assert.equal(resolveFile(root, "/../package.json"), path.join(root, "package.json"));
    assert.equal(resolveFile(root, "/%2e%2e/%2e%2e/etc/passwd"), path.join(root, "etc", "passwd"));
    // Backslashes are separators on Windows only. Either way the result stays inside root.
    const backslashed = resolveFile(root, "/..%5c..%5cpackage.json");
    assert.ok(backslashed === null || backslashed.startsWith(root + path.sep));
    assert.equal(resolveFile(root, "/a%00b"), null);
    assert.equal(resolveFile(root, "/"), path.join(root, "index.html"));
  });
});
