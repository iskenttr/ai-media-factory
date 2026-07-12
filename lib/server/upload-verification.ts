export const supportedVideoTypes = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "video/x-matroska",
]);

export function verifyUploadFacts(input: {
  declaredSize: number;
  actualSize: number;
  declaredMime: string;
  detectedMime: string | undefined;
  maxUploadBytes: number;
}) {
  if (input.actualSize > input.maxUploadBytes || input.actualSize > input.declaredSize) {
    throw new Error("upload_size_exceeded");
  }
  if (input.actualSize !== input.declaredSize) throw new Error("upload_size_mismatch");
  if (!input.detectedMime || !supportedVideoTypes.has(input.detectedMime)) {
    throw new Error("unsupported_media");
  }
  if (!input.declaredMime.startsWith("video/")) throw new Error("mime_type_mismatch");
  return { verifiedMime: input.detectedMime };
}
