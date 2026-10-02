import { createReadStream, type Stats } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

export type RequestHandler = (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<void>;

/** Serves files from the given directories. The first directory containing the file wins. */
export function createStaticHandler(dirs: readonly string[]): RequestHandler {
  const roots = dirs.map((dir) => path.resolve(dir));

  return async (req, res, url) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendText(res, 405, "Method not allowed", { allow: "GET, HEAD" });
      return;
    }

    const found = await findFile(roots, url.pathname);
    if (found === "invalid") {
      sendText(res, 400, "Bad request");
      return;
    }
    if (!found) {
      sendText(res, 404, "Not found");
      return;
    }

    const { file, info } = found;
    res.writeHead(200, {
      "content-type": CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "content-length": info.size,
      "cache-control": "no-cache",
      "last-modified": info.mtime.toUTCString(),
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    await pipeline(createReadStream(file), res);
  };
}

async function findFile(roots: string[], pathname: string): Promise<{ file: string; info: Stats } | "invalid" | null> {
  for (const root of roots) {
    const file = resolveFile(root, pathname);
    if (!file) return "invalid";
    const info = await stat(file).catch(() => null);
    if (info?.isFile()) return { file, info };
  }
  return null;
}

/** Maps a URL path to a file inside root, or null when it is malformed or escapes root. */
export function resolveFile(root: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;

  const file = path.resolve(root, `.${path.posix.normalize(decoded)}`);
  const relative = path.relative(root, file);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return file;
}

function sendText(res: ServerResponse, status: number, text: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", ...headers }).end(text);
}
