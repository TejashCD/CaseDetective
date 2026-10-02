import Anthropic from "@anthropic-ai/sdk";
import { MalformedOutputError, ModelNotConfiguredError, RefusalError } from "../ai/errors.ts";
import { ActionNotAllowedError, CaseNotFoundError, InputTooLargeError, InvalidInputError } from "../game/errors.ts";

export class HttpError extends Error {
  override name = "HttpError";
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Maps any error to a status code and a message that is safe to show the player. */
export function toHttpError(error: unknown): { status: number; message: string } {
  const [status, message] = classify(error);
  return { status, message };
}

function classify(error: unknown): [number, string] {
  if (error instanceof HttpError) return [error.status, error.message];

  if (error instanceof InvalidInputError) return [400, error.message];
  if (error instanceof ActionNotAllowedError) return [403, error.message];
  if (error instanceof CaseNotFoundError) return [404, error.message];
  if (error instanceof InputTooLargeError) return [413, error.message];

  if (error instanceof ModelNotConfiguredError) {
    return [500, "No API key on the server. Add ANTHROPIC_API_KEY to .env, or play the demo case."];
  }
  if (error instanceof RefusalError) return [422, "This material was declined. Try rephrasing it or pick another topic."];
  if (error instanceof MalformedOutputError) return [502, "The answer came back malformed. Try again."];

  if (error instanceof Anthropic.AuthenticationError) {
    return [500, "The server's Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env."];
  }
  if (error instanceof Anthropic.PermissionDeniedError) return [500, "The Anthropic API key doesn't have access to this model."];
  if (error instanceof Anthropic.RateLimitError) return [429, "The witnesses are busy right now. Wait a few seconds and try again."];
  if (error instanceof Anthropic.APIConnectionError) return [502, "Couldn't reach the AI service. Check the internet connection."];
  if (error instanceof Anthropic.APIError) return [502, `The AI service returned an error (${error.status ?? "unknown"}). Try again.`];

  return [500, "Something went wrong on the server."];
}
