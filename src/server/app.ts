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

interface AppOptions {
  game: Game;
  ai: Pick<ModelClient, "model" | "configured">;
  staticDirs: readonly string[];
  logger?: Pick<Console, "error">;
}

export function createApp({ game, ai, staticDirs, logger = console }: AppOptions): http.Server {
  const handleApi = createApiHandler(game, ai);
  const serveStatic = createStaticHandler(staticDirs);

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
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
  }

  return http.createServer((req, res) => void handle(req, res));
}
