// CaseDetective game server.
// Serves the static game from ./public and runs every AI call server-side,
// so the API key and each case's hidden solution never reach the browser.
import http from "node:http";
import crypto from "node:crypto";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { DEMO_CASE } from "./demo-case.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch {
  // No .env file: rely on the real environment.
}

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.MODEL_ID || "claude-opus-5-5";
const TALK_EFFORT = process.env.TALK_EFFORT || "low";
const KEY_CONFIGURED = Boolean(process.env.ANTHROPIC_API_KEY);
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "missing" });

const NPC_COLORS = ["#c2416b", "#3b6ea5", "#5f8a35"];

// ---------------------------------------------------------------------------
// AI calls
// ---------------------------------------------------------------------------

class RefusalError extends Error {}
class ShapeError extends Error {}

/** One structured model call. Retries once when the answer breaks a rule the schema can't enforce. */
async function askModel({ schema, system, user, effort, check }) {
  for (let attempt = 0; ; attempt++) {
    try {
      const value = await askOnce({ schema, system, user, effort });
      check?.(value);
      return value;
    } catch (error) {
      if (!(error instanceof ShapeError) || attempt >= 1) throw error;
      console.warn(`Retrying model call: ${error.message}`);
    }
  }
}

async function askOnce({ schema, system, user, effort }) {
  const format = betaZodOutputFormat(schema);
  const message = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    // Safety classifiers can decline harmless study material (biology especially).
    // "default" fallbacks re-run a declined request on a recommended model instead of failing.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
    output_config: { effort, format },
  });

  if (message.stop_reason === "refusal") {
    throw new RefusalError(message.stop_details?.explanation || "The request was declined.");
  }
  if (message.stop_reason === "max_tokens") throw new ShapeError("answer was cut off");
  // After a fallback, earlier text blocks can hold a declined model's partial output.
  const answer = message.content.filter((b) => b.type === "text").at(-1);
  if (!answer) throw new ShapeError("no text in answer");
  try {
    return format.parse(answer.text);
  } catch (error) {
    throw new ShapeError(error instanceof Error ? error.message : String(error));
  }
}

// ---------------------------------------------------------------------------
// Schemas and prompts
// ---------------------------------------------------------------------------

const NpcSchema = z.object({
  name: z.string().describe("Dutch first name or title + surname"),
  role: z.string().describe("Their job, 1-3 words, e.g. 'Flower seller'"),
  location: z.string().describe("A real-sounding Amsterdam street or place"),
  sign: z.string().describe("Shop sign over their door, 1-2 words, max 12 characters, uppercase"),
  concept: z.string().describe("The study concept this character guards, 2-5 words"),
  greeting: z.string().describe("In-character opening line, max 25 words, sets the mood"),
  challenge: z.string().describe("A question the student must answer to prove they understand the concept"),
  reveal_condition: z.string().describe("Hidden: exactly what a correct answer must show"),
  hint: z.string().describe("A nudge that points the way without giving the answer"),
  clue: z.string().describe("Short evidence text handed over when earned, e.g. 'Ledger: buyers fled when prices peaked'"),
  personality: z.string().describe("2-4 words of voice and manner"),
});

const CaseSchema = z.object({
  title: z.string().describe("'The Case of the ...'"),
  place: z.string().describe("District of Amsterdam where the case happens"),
  intro: z.string().describe("One atmospheric sentence, max 30 words"),
  objective: z.string().describe("What the detective must do, max 18 words"),
  accusation_question: z.string().describe("Final synthesis question requiring all three concepts"),
  solution: z.string().describe("Hidden model answer that combines all three concepts"),
  npcs: z.array(NpcSchema).describe("Exactly three witnesses, one per core concept"),
});

const TalkSchema = z.object({
  reply: z.string(),
  understanding: z.enum(["none", "partial", "full"]),
  suspicion_delta: z.number().int(),
  feedback_note: z.string(),
  quick_replies: z.array(z.string()),
});

const AccuseSchema = z.object({
  verdict: z.enum(["solved", "partial", "no"]),
  feedback: z.string(),
  missing: z.array(z.string()),
});

const CASE_SYSTEM = `You design cases for CaseDetective, a serious detective game that teaches a student their own study material.
The game is set at night in Amsterdam: canals, rain, lamplight. The tone is grounded noir, never silly.
Pick the three most important concepts in the material. Each concept is guarded by one witness whose job fits the setting.
The case's mystery must be explained by combining all three concepts, so the final accusation works like an exam question.
Challenges must test understanding, not recall of a definition. Keep every fact accurate to the material.`;

function talkSystem(c) {
  return `You voice the witnesses in CaseDetective, a serious detective game that teaches study material through conversation.
Case file (hidden from the student):
${JSON.stringify(
  {
    title: c.title,
    place: c.place,
    solution: c.solution,
    witnesses: c.npcs.map((n) => ({
      name: n.name,
      role: n.role,
      concept: n.concept,
      challenge: n.challenge,
      reveal_condition: n.reveal_condition,
      clue: n.clue,
      personality: n.personality,
    })),
  },
  null,
  1,
)}

How to judge and reply:
- Stay in character as the witness named in the request. Max 70 words. Plain text, no markdown.
- Judge understanding, not keywords. Accept the student's own words and imperfect phrasing.
- "full" means the answer meets the reveal_condition. Then hand over the clue in character and name it.
- "partial" means on the right track. Nudge toward the missing piece. suspicion_delta 0.
- "none" means wrong or off-topic. Re-explain from a new angle with a concrete everyday example. suspicion_delta 5 to 15. Questions, requests for hints and honest confusion get 0.
- Never state the full answer to the challenge before the student earns it.
- feedback_note: one short sentence naming what the student should review, or "" when understanding is full.
- quick_replies: three short things the student might say next, under 8 words each, written as the student.`;
}

// ---------------------------------------------------------------------------
// Case store (in memory; fine for a single-machine demo)
// ---------------------------------------------------------------------------

const cases = new Map();

function storeCase(bible, demo) {
  const id = crypto.randomUUID();
  const c = {
    ...bible,
    npcs: bible.npcs.slice(0, 3).map((n, i) => ({ ...n, color: NPC_COLORS[i], sign: n.sign.toUpperCase().slice(0, 12) })),
  };
  const state = {
    clues: [false, false, false],
    suspicion: 15,
    notes: [],
    history: [[], [], []],
    attempts: 0,
    verdict: null,
    feedback: "",
    ejections: 0,
  };
  cases.set(id, { id, demo, c, state, created: Date.now() });
  if (cases.size > 500) cases.delete(cases.keys().next().value);
  return cases.get(id);
}

function publicView(entry) {
  const { id, demo, c, state } = entry;
  return {
    id,
    demo,
    title: c.title,
    place: c.place,
    intro: c.intro,
    objective: c.objective,
    accusationQuestion: c.accusation_question,
    npcs: c.npcs.map((n, i) => ({
      name: n.name,
      role: n.role,
      location: n.location,
      sign: n.sign,
      concept: n.concept,
      greeting: n.greeting,
      challenge: n.challenge,
      color: n.color,
      clue: state.clues[i] ? n.clue : null,
    })),
    state: publicState(state),
  };
}

function publicState(s) {
  return { clues: s.clues, suspicion: s.suspicion, verdict: s.verdict, attempts: s.attempts };
}

// ---------------------------------------------------------------------------
// Game logic
// ---------------------------------------------------------------------------

async function createCase(material) {
  const bible = await askModel({
    schema: CaseSchema,
    system: CASE_SYSTEM,
    effort: "medium",
    user: `Build a case from this study material.\n\n<material>\n${material}\n</material>`,
    check: (v) => {
      if (v.npcs.length < 3) throw new ShapeError(`expected 3 witnesses, got ${v.npcs.length}`);
    },
  });
  return storeCase(bible, false);
}

/** Keyword grading used only by the demo case when the AI service can't be reached. */
function offlineTalk(n, text) {
  const t = text.toLowerCase();
  const hit = n.keywords.some((k) => t.includes(k));
  const asking = /hint|help|explain|\?/.test(t);
  return {
    reply: hit
      ? `That's it exactly. Here, take this: ${n.clue}.`
      : `Not quite. Think about it this way: ${n.hint}`,
    understanding: hit ? "full" : t.length > 25 ? "partial" : "none",
    suspicion_delta: hit || asking || t.length > 25 ? 0 : 8,
    feedback_note: hit ? "" : `Review ${n.concept.toLowerCase()}: ${n.hint}`,
    quick_replies: ["Can I have a hint?", "Let me try again.", "Explain it another way."],
  };
}

async function talk(entry, npcIndex, text) {
  const { c, state } = entry;
  const n = c.npcs[npcIndex];
  const history = state.history[npcIndex];
  const earned = state.clues[npcIndex];
  const transcript = history
    .slice(-10)
    .map((h) => `Student: ${h.student}\n${n.name}: ${h.npc}`)
    .join("\n");

  let r;
  let offline = false;
  try {
    r = await askModel({
      schema: TalkSchema,
      system: talkSystem(c),
      effort: TALK_EFFORT,
      user: `You are ${n.name}, ${n.role} at ${n.location}.
${earned ? "The student already earned your clue. Answer their questions as a helpful tutor in character; understanding \"full\", suspicion_delta 0." : `Your challenge to the student: ${n.challenge}`}
Conversation so far:
${transcript || "(none yet; you already greeted them and asked your challenge)"}

The student says: <student>${text}</student>`,
    });
  } catch (error) {
    if (!entry.demo) throw error;
    console.warn(`AI service unavailable, using offline grading for the demo: ${error.message}`);
    r = offlineTalk(n, text);
    offline = true;
  }

  const delta = earned ? 0 : Math.max(0, Math.min(15, r.suspicion_delta | 0));
  history.push({ student: text, npc: r.reply });
  state.suspicion = Math.min(100, state.suspicion + delta);

  let clueEarned = false;
  if (!earned && r.understanding === "full") {
    state.clues[npcIndex] = true;
    clueEarned = true;
  }
  if (r.understanding !== "full" && r.feedback_note) {
    state.notes.push({ concept: n.concept, note: r.feedback_note });
  }

  let ejected = false;
  if (state.suspicion >= 100) {
    ejected = true;
    state.ejections++;
    state.suspicion = 60;
  }

  return {
    reply: r.reply,
    understanding: r.understanding,
    suspicionDelta: delta,
    quickReplies: r.quick_replies.slice(0, 3),
    clue: clueEarned ? n.clue : null,
    ejected,
    offline,
    state: publicState(state),
  };
}

async function accuse(entry, text) {
  const { c, state } = entry;
  state.attempts++;
  let r;
  let offline = false;
  try {
    r = await askModel({
      schema: AccuseSchema,
      system: `You are the chief inspector in CaseDetective, a detective game that teaches study material. You grade the detective's final explanation like a fair, demanding examiner.`,
      effort: "medium",
      user: `Case: ${c.title}
Final question: ${c.accusation_question}
Model answer (hidden): ${c.solution}
The three concepts: ${c.npcs.map((n) => n.concept).join("; ")}

The detective's explanation: <student>${text}</student>

Accept the student's own words. "solved" requires all three concepts used correctly and linked to the case. "partial" means some concepts are right or the links are weak. "no" means mostly wrong.
feedback: 2-3 sentences in the inspector's voice saying what was right and what is missing. Do not reveal the model answer unless the verdict is "solved".
missing: names of concepts that were absent or wrong (empty when solved).`,
    });
  } catch (error) {
    if (!entry.demo) throw error;
    offline = true;
    const t = text.toLowerCase();
    const hits = c.npcs.filter((n) => n.keywords.some((k) => t.includes(k)));
    const missing = c.npcs.filter((n) => !hits.includes(n)).map((n) => n.concept);
    r = {
      verdict: hits.length >= 3 ? "solved" : hits.length === 2 ? "partial" : "no",
      feedback: hits.length >= 3 ? "You tied all three concepts together. Case closed." : `Close, but your story has holes. Bring in: ${missing.join(", ")}.`,
      missing,
    };
  }
  state.verdict = r.verdict === "solved" ? "solved" : state.verdict;
  state.feedback = r.feedback;
  return { verdict: r.verdict, feedback: r.feedback, missing: r.missing, offline, state: publicState(state) };
}

function report(entry) {
  const { c, state } = entry;
  const seen = new Set();
  const notes = state.notes.filter((n) => {
    const k = n.concept + n.note;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return {
    title: c.title,
    place: c.place,
    verdict: state.verdict,
    feedback: state.feedback,
    attempts: state.attempts,
    suspicion: state.suspicion,
    ejections: state.ejections,
    solution: c.solution,
    concepts: c.npcs.map((n, i) => ({
      concept: n.concept,
      witness: n.name,
      earned: state.clues[i],
      clue: n.clue,
      challenge: n.challenge,
      exchanges: state.history[i].length,
    })),
    notes,
  };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 200_000) throw new HttpError(413, "That's too much text. Trim it under 40,000 characters.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new HttpError(400, "Malformed request.");
  }
}

function getCase(id) {
  const entry = cases.get(id);
  if (!entry) throw new HttpError(404, "This case file is gone. The server may have restarted. Start a new case.");
  return entry;
}

function explain(error) {
  if (error instanceof HttpError) return [error.status, error.message];
  if (error instanceof RefusalError) return [422, "This material was declined. Try rephrasing it or pick another topic."];
  if (error instanceof Anthropic.AuthenticationError) return [500, "The server's Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env."];
  if (error instanceof Anthropic.PermissionDeniedError) return [500, "The Anthropic API key doesn't have access to this model."];
  if (error instanceof Anthropic.RateLimitError) return [429, "The witnesses are busy right now. Wait a few seconds and try again."];
  if (error instanceof Anthropic.APIConnectionError) return [502, "Couldn't reach the AI service. Check the internet connection."];
  if (error instanceof Anthropic.APIError) return [502, `The AI service returned an error (${error.status ?? "unknown"}). Try again.`];
  if (error instanceof ShapeError) return [502, "The answer came back malformed. Try again."];
  return [500, "Something went wrong on the server."];
}

async function api(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean); // ["api", ...]
  const method = req.method;

  if (method === "GET" && parts[1] === "health") {
    return send(res, 200, { ok: true, model: MODEL, keyConfigured: KEY_CONFIGURED });
  }
  if (method === "POST" && parts[1] === "demo") {
    return send(res, 200, publicView(storeCase(DEMO_CASE, true)));
  }
  if (method === "POST" && parts[1] === "case" && parts.length === 2) {
    const { material } = await readJson(req);
    const text = String(material || "").trim();
    if (text.length < 3) throw new HttpError(400, "Paste some notes or name a topic first.");
    if (text.length > 40_000) throw new HttpError(413, "That's too much text. Trim it under 40,000 characters.");
    if (!KEY_CONFIGURED) throw new HttpError(500, "No API key on the server. Add ANTHROPIC_API_KEY to .env, or play the demo case.");
    return send(res, 200, publicView(await createCase(text)));
  }
  if (parts[1] === "case" && parts[2]) {
    const entry = getCase(parts[2]);
    if (method === "POST" && parts[3] === "talk") {
      const { npc, text } = await readJson(req);
      const i = Number(npc);
      const msg = String(text || "").trim().slice(0, 1500);
      if (![0, 1, 2].includes(i)) throw new HttpError(400, "Unknown witness.");
      if (!msg) throw new HttpError(400, "Say something first.");
      return send(res, 200, await talk(entry, i, msg));
    }
    if (method === "POST" && parts[3] === "accuse") {
      if (!entry.state.clues.every(Boolean)) throw new HttpError(403, "You need all three clues before the inspector will listen.");
      const { text } = await readJson(req);
      const msg = String(text || "").trim().slice(0, 4000);
      if (msg.length < 10) throw new HttpError(400, "Make your case in a few sentences.");
      return send(res, 200, await accuse(entry, msg));
    }
    if (method === "GET" && parts[3] === "report") return send(res, 200, report(entry));
    if (method === "GET" && !parts[3]) return send(res, 200, publicView(entry));
  }
  throw new HttpError(404, "Not found.");
}

async function serveStatic(res, url) {
  const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const file = path.normalize(path.join(ROOT, "public", rel));
  if (!file.startsWith(path.join(ROOT, "public"))) {
    res.writeHead(403).end();
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    return await serveStatic(res, url);
  } catch (error) {
    const [status, message] = explain(error);
    if (status >= 500) console.error(error);
    send(res, status, { error: message });
  }
});

server.listen(PORT, () => {
  console.log(`CaseDetective running at http://localhost:${PORT}`);
  console.log(`Model: ${MODEL} | API key ${KEY_CONFIGURED ? "loaded" : "MISSING (demo case runs offline)"}`);
});
