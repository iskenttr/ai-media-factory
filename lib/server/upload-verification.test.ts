import { describe, expect, it } from "vitest";

import { verifyUploadFacts } from "./upload-verification";

describe("verifyUploadFacts", () => {
  const valid = {
    declaredSize: 1024,
    actualSize: 1024,
    declaredMime: "video/mp4",
    detectedMime: "video/mp4",
    maxUploadBytes: 2048,
  };

  it("accepts matching verified video facts", () => {
    expect(verifyUploadFacts(valid)).toEqual({ verifiedMime: "video/mp4" });
  });

  it.each([
    [{ ...valid, actualSize: 1000 }, "upload_size_mismatch"],
    [{ ...valid, actualSize: 3000 }, "upload_size_exceeded"],
    [{ ...valid, detectedMime: "image/png" }, "unsupported_media"],
    [{ ...valid, declaredMime: "application/octet-stream" }, "mime_type_mismatch"],
  ])("rejects dishonest upload facts", (input, error) => {
    expect(() => verifyUploadFacts(input)).toThrow(error);
  });
});
