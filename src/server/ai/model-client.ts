import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type * as z from "zod/v4";
import { MalformedOutputError, ModelNotConfiguredError, RefusalError } from "./errors.ts";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

export interface AskOptions<S extends z.ZodType> {
  schema: S;
  system: string;
  user: string;
  effort: Effort;
  /** Extra checks the schema can't express. Throw MalformedOutputError to retry. */
  validate?: (value: z.infer<S>) => void;
}

export interface ModelClient {
  readonly model: string;
  readonly configured: boolean;
  ask<S extends z.ZodType>(options: AskOptions<S>): Promise<z.infer<S>>;
}

interface ModelClientOptions {
  apiKey: string;
  model: string;
  logger?: Pick<Console, "warn">;
  sdk?: Anthropic;
}

const MAX_TOKENS = 16_000;
const MAX_ATTEMPTS = 2;

export function createModelClient({ apiKey, model, logger = console, sdk }: ModelClientOptions): ModelClient {
  const anthropic = sdk ?? (apiKey ? new Anthropic({ apiKey }) : null);

  async function askOnce<S extends z.ZodType>(client: Anthropic, { schema, system, user, effort }: AskOptions<S>): Promise<z.infer<S>> {
    const format = betaZodOutputFormat(schema);
    const message = await client.beta.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      // Safety classifiers sometimes decline harmless study material (biology especially).
      // With default fallbacks a declined request is retried on another model instead of failing.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
      output_config: { effort, format },
    });

    if (message.stop_reason === "refusal") {
      throw new RefusalError(message.stop_details?.explanation || "The request was declined.");
    }
    if (message.stop_reason === "max_tokens") throw new MalformedOutputError("answer was cut off");

    // After a fallback, earlier text blocks may hold the declined model's partial output.
    const answer = message.content.filter((block) => block.type === "text").at(-1);
    if (!answer) throw new MalformedOutputError("no text in answer");
    try {
      return format.parse(answer.text);
    } catch (error) {
      throw new MalformedOutputError(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    model,
    configured: anthropic !== null,

    async ask(options) {
      if (!anthropic) throw new ModelNotConfiguredError();
      for (let attempt = 1; ; attempt++) {
        try {
          const value = await askOnce(anthropic, options);
          options.validate?.(value);
          return value;
        } catch (error) {
          if (!(error instanceof MalformedOutputError) || attempt >= MAX_ATTEMPTS) throw error;
          logger.warn(`Retrying model call: ${error.message}`);
        }
      }
    },
  };
}
