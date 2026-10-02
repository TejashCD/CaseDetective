import type { IncomingMessage, ServerResponse } from "node:http";
import { tooMuchText } from "../game/rules.ts";
import { HttpError } from "./errors.ts";

/** Bytes. Room for the longest allowed study material in multi-byte UTF-8. */
export const MAX_BODY_BYTES = 200_000;

export type JsonBody = Record<string, unknown>;

export async function readJson(req: IncomingMessage, limit = MAX_BODY_BYTES): Promise<JsonBody> {
  if (Number(req.headers["content-length"]) > limit) throw new HttpError(413, tooMuchText());

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, tooMuchText());
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Malformed request.");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Malformed request.");
  }
  return body as JsonBody;
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}
