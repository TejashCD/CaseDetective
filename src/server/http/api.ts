import type { IncomingMessage } from "node:http";
import type { HealthResponse } from "../../shared/api.ts";
import type { ModelClient } from "../ai/model-client.ts";
import type { Game } from "../game/engine.ts";
import { HttpError } from "./errors.ts";
import { readJson, sendJson } from "./io.ts";
import type { RequestHandler } from "./static.ts";

type RouteHandler = (req: IncomingMessage) => unknown;

export function createApiHandler(game: Game, ai: Pick<ModelClient, "model" | "configured">): RequestHandler {
  const routes = new Map<string, Partial<Record<"GET" | "POST", RouteHandler>>>([
    ["/api/health", { GET: (): HealthResponse => ({ ok: true, model: ai.model, keyConfigured: ai.configured }) }],
    ["/api/demo", { POST: () => game.startDemo() }],
    ["/api/case", { POST: async (req) => game.startCase((await readJson(req)).material) }],
    ["/api/case/view", { POST: async (req) => game.getCase((await readJson(req)).token) }],
    ["/api/case/report", { POST: async (req) => game.getReport((await readJson(req)).token) }],
    [
      "/api/case/talk",
      {
        POST: async (req) => {
          const { token, npc, text } = await readJson(req);
          return game.talk(token, npc, text);
        },
      },
    ],
    [
      "/api/case/accuse",
      {
        POST: async (req) => {
          const { token, text } = await readJson(req);
          return game.accuse(token, text);
        },
      },
    ],
  ]);

  return async (req, res, url) => {
    const route = routes.get(url.pathname.replace(/\/+$/, ""));
    if (!route) throw new HttpError(404, "Not found.");
    const handle = req.method === "GET" || req.method === "POST" ? route[req.method] : undefined;
    if (!handle) throw new HttpError(405, "Method not allowed.");
    sendJson(res, 200, await handle(req));
  };
}
