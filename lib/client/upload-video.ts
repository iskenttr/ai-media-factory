export interface UploadProgressUpdate {
  fileName: string;
  percent: number;
  status: string;
}

interface UploadSessionResponse {
  uploadId: string;
  uploadToken: string;
  uploadUrl: string;
}

interface UploadCompletedResponse {
  jobId: string;
  uploadId: string;
}

async function createUploadSession(sourceVideo: File): Promise<UploadSessionResponse> {
  const response = await fetch("/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: sourceVideo.name,
      sizeBytes: sourceVideo.size,
      mimeType: sourceVideo.type || "application/octet-stream",
    }),
  });
  if (!response.ok) {
    throw new Error("I couldn’t prepare this upload. Please try again.");
  }
  return (await response.json()) as UploadSessionResponse;
}

function streamUpload(
  sourceVideo: File,
  session: UploadSessionResponse,
  onProgress: (progress: UploadProgressUpdate) => void,
) {
  return new Promise<UploadCompletedResponse>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", session.uploadUrl);
    request.setRequestHeader("Content-Type", sourceVideo.type || "application/octet-stream");
    request.setRequestHeader("X-Upload-Token", session.uploadToken);

    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || event.total <= 0) {
        return;
      }
      onProgress({
        fileName: sourceVideo.name,
        percent: Math.min(99, Math.round((event.loaded / event.total) * 100)),
        status: "Uploading your video",
      });
    });

    request.upload.addEventListener("load", () => {
      onProgress({
        fileName: sourceVideo.name,
        percent: 100,
        status: "Verifying your video",
      });
    });

    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        resolve(JSON.parse(request.responseText) as UploadCompletedResponse);
      } else {
        reject(new Error("I couldn’t verify this video. Please choose another file."));
      }
    });
    request.addEventListener("error", () => {
      reject(new Error("The upload was interrupted. Please try again."));
    });
    request.send(sourceVideo);
  });
}

export async function uploadSourceVideo(
  sourceVideo: File,
  onProgress: (progress: UploadProgressUpdate) => void,
) {
  const session = await createUploadSession(sourceVideo);
  return streamUpload(sourceVideo, session, onProgress);
}
