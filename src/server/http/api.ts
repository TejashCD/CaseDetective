import type { IncomingMessage } from "node:http";
import type { HealthResponse } from "../../shared/api.ts";
import type { ModelClient } from "../ai/model-client.ts";
import type { Game } from "../game/engine.ts";
import { HttpError } from "./errors.ts";
import { readJson, sendJson } from "./io.ts";
import type { RequestHandler } from "./static.ts";

interface Route {
  method: "GET" | "POST";
  pattern: RegExp;
  handle: (req: IncomingMessage, params: string[]) => unknown;
}

export function createApiHandler(game: Game, ai: Pick<ModelClient, "model" | "configured">): RequestHandler {
  const routes: Route[] = [
    {
      method: "GET",
      pattern: /^\/api\/health$/,
      handle: (): HealthResponse => ({ ok: true, model: ai.model, keyConfigured: ai.configured }),
    },
    {
      method: "POST",
      pattern: /^\/api\/demo$/,
      handle: () => game.startDemo(),
    },
    {
      method: "POST",
      pattern: /^\/api\/case$/,
      handle: async (req) => game.startCase((await readJson(req)).material),
    },
    {
      method: "GET",
      pattern: /^\/api\/case\/([^/]+)$/,
      handle: (_req, [id = ""]) => game.getCase(id),
    },
    {
      method: "POST",
      pattern: /^\/api\/case\/([^/]+)\/talk$/,
      handle: async (req, [id = ""]) => {
        game.getCase(id); // 404 before reading the body
        const { npc, text } = await readJson(req);
        return game.talk(id, npc, text);
      },
    },
    {
      method: "POST",
      pattern: /^\/api\/case\/([^/]+)\/accuse$/,
      handle: async (req, [id = ""]) => game.accuse(id, (await readJson(req)).text),
    },
    {
      method: "GET",
      pattern: /^\/api\/case\/([^/]+)\/report$/,
      handle: (_req, [id = ""]) => game.getReport(id),
    },
  ];

  return async (req, res, url) => {
    let pathMatched = false;
    for (const route of routes) {
      const match = route.pattern.exec(url.pathname);
      if (!match) continue;
      pathMatched = true;
      if (route.method !== req.method) continue;
      sendJson(res, 200, await route.handle(req, match.slice(1).map(decodeParam)));
      return;
    }
    if (pathMatched) throw new HttpError(405, "Method not allowed.");
    throw new HttpError(404, "Not found.");
  };
}

function decodeParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, "Malformed request.");
  }
}
