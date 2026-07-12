import { describe, expect, it } from "vitest";

import { LocalProviderRegistry } from "./provider-registry";

describe("LocalProviderRegistry", () => {
  it("returns no provider when binary or model is not configured", async () => {
    const registry = new LocalProviderRegistry(undefined, undefined);
    await expect(registry.speech()).resolves.toBeNull();
    await expect(registry.speakers()).resolves.toBeNull();
    expect(registry.contentProfile().id).toBe("deterministic-evidence");
  });

  it("returns no provider when configured paths do not exist", async () => {
    await expect(
      new LocalProviderRegistry("/missing/whisper-cli", "/missing/model.bin").speech(),
    ).resolves.toBeNull();
  });
});
