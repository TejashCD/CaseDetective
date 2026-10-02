import http from "node:http";
import type { ModelClient } from "./ai/model-client.ts";
import type { Game } from "./game/engine.ts";
import { createApiHandler } from "./http/api.ts";
import { toHttpError } from "./http/errors.ts";
import { sendJson } from "./http/io.ts";
import { createStaticHandler } from "./http/static.ts";

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
};

export interface AppOptions {
  game: Game;
  ai: Pick<ModelClient, "model" | "configured">;
  /** Directories to serve files from. Empty when a CDN serves them (Vercel). */
  staticDirs?: readonly string[];
  logger?: Pick<Console, "error">;
}

export type NodeHandler = (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>;

/** One request handler for both the standalone server and the Vercel function. */
export function createRequestHandler({ game, ai, staticDirs = [], logger = console }: AppOptions): NodeHandler {
  const handleApi = createApiHandler(game, ai);
  const serveStatic = createStaticHandler(staticDirs);

  return async (req, res) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
      else await serveStatic(req, res, url);
    } catch (error) {
      const { status, message } = toHttpError(error);
      if (status >= 500) logger.error(error);
      if (res.headersSent) {
        res.destroy();
        return;
      }
      sendJson(res, status, { error: message });
    }
  };
}

export function createApp(options: AppOptions): http.Server {
  const handle = createRequestHandler(options);
  return http.createServer((req, res) => void handle(req, res));
}
