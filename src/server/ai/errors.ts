export class RefusalError extends Error {
  override name = "RefusalError";
}

/** The model answered in the wrong shape. Worth one retry. */
export class MalformedOutputError extends Error {
  override name = "MalformedOutputError";
}

export class ModelNotConfiguredError extends Error {
  override name = "ModelNotConfiguredError";

  constructor() {
    super("No Anthropic API key is configured.");
  }
}
