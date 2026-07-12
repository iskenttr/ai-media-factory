import { z } from "zod";

import type { QualityAssistantInput, QualityAssistantProvider, QualityAssistantResult } from "../contracts/quality-assistant-provider";

const responseSchema = z.object({
  score: z.number().min(0).max(100),
  rerenderRecommended: z.boolean(),
  findings: z.array(z.object({
    category: z.enum(["turkish", "segmentation", "placement", "collision", "typography"]),
    cueIndex: z.number().int().nonnegative().nullable(),
    recommendation: z.string().min(1).max(500),
  })).max(30),
});

export class GeminiQualityAssistant implements QualityAssistantProvider {
  readonly id = "gemini-quality-assistant-v1";
  private readonly cache = new Map<string, QualityAssistantResult>();
  private usageDay = "";
  private dailyEstimatedTokens = 0;

  constructor(
    private readonly endpoint: string,
    private readonly accessToken: () => Promise<string>,
    private readonly dailyTokenBudget = 100_000,
    private readonly request: typeof fetch = fetch,
  ) {}

  async review(input: QualityAssistantInput): Promise<QualityAssistantResult> {
    const cached = this.cache.get(input.fingerprint);
    if (cached) return { ...cached, cached: true };
    if (input.frames.length > 8) throw new Error("gemini_frame_limit_exceeded");
    const estimatedInputTokens = Math.ceil(JSON.stringify({ ...input, frames: input.frames.map((frame) => ({ ...frame, base64: "" })) }).length / 4)
      + input.frames.length * 258;
    const day = new Date().toISOString().slice(0, 10);
    if (day !== this.usageDay) { this.usageDay = day; this.dailyEstimatedTokens = 0; }
    if (this.dailyEstimatedTokens + estimatedInputTokens > this.dailyTokenBudget) throw new Error("gemini_daily_budget_exceeded");

    const parts: unknown[] = [{ text: `Review this Turkish subtitle plan. Return JSON only. Deterministic score: ${input.deterministicScore}. Metadata and cues: ${JSON.stringify({ metadata: input.metadata, cues: input.cues })}` }];
    input.frames.forEach((frame) => parts.push({ inlineData: { mimeType: frame.mimeType, data: frame.base64 } }));
    const response = await this.request(this.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${await this.accessToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } }),
    });
    if (!response.ok) throw new Error(`gemini_request_failed:${response.status}`);
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = payload.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
    if (!text) throw new Error("gemini_response_empty");
    const parsed = responseSchema.parse(JSON.parse(text));
    this.dailyEstimatedTokens += estimatedInputTokens;
    const result = { ...parsed, cached: false, estimatedInputTokens };
    this.cache.set(input.fingerprint, result);
    return result;
  }
}
