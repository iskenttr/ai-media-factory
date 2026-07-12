export type ProviderFailureCode =
  | "model_not_configured"
  | "provider_failure"
  | "insufficient_speech";

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
