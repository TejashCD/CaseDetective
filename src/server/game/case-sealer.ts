// Turns a case record into an opaque token and back, so the server can stay stateless
// (one serverless instance may create a case and a different one continue it).
// AES-256-GCM keeps the hidden solution unreadable and makes tampering detectable.
import crypto from "node:crypto";
import zlib from "node:zlib";
import { CaseNotFoundError } from "./errors.ts";
import type { CaseRecord } from "./types.ts";

const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = "v1";

export class CaseSealer {
  readonly #key: Buffer;

  /** The secret can be any string; a 256-bit key is derived from it. */
  constructor(secret: string) {
    if (!secret) throw new Error("CaseSealer needs a secret");
    this.#key = Buffer.from(crypto.hkdfSync("sha256", secret, "casedetective", "case-token", 32));
  }

  seal(record: CaseRecord): string {
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.#key, iv);
    const body = Buffer.concat([cipher.update(zlib.deflateRawSync(JSON.stringify(record))), cipher.final()]);
    return `${VERSION}.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")}`;
  }

  open(token: unknown): CaseRecord {
    if (typeof token !== "string" || !token.startsWith(`${VERSION}.`)) throw new CaseNotFoundError();
    try {
      const raw = Buffer.from(token.slice(VERSION.length + 1), "base64url");
      const decipher = crypto.createDecipheriv("aes-256-gcm", this.#key, raw.subarray(0, IV_BYTES));
      decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
      const body = Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
      return JSON.parse(zlib.inflateRawSync(body).toString("utf8")) as CaseRecord;
    } catch {
      throw new CaseNotFoundError();
    }
  }
}
