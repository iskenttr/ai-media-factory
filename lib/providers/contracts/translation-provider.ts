import type { TranslationProviderInput, TranslationProviderResult } from "@/lib/localization/contracts";

export interface TranslationProvider {
  readonly id: string;
  readonly version: string;
  translate(input: TranslationProviderInput): Promise<TranslationProviderResult>;
}
