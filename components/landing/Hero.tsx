"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Container } from "@/components/layout/Container";
import { UploadSurface } from "@/components/upload/UploadSurface";
import { uploadSourceVideo, type UploadProgressUpdate } from "@/lib/client/upload-video";

import styles from "./Hero.module.css";

export function Hero() {
  const router = useRouter();
  const [progress, setProgress] = useState<UploadProgressUpdate>();
  const [uploadError, setUploadError] = useState<string>();

  const handleVideoSelected = async (sourceVideo: File) => {
    setUploadError(undefined);
    setProgress({ fileName: sourceVideo.name, percent: 0, status: "Preparing your upload" });
    try {
      const result = await uploadSourceVideo(sourceVideo, setProgress);
      router.push(`/analysis/${result.jobId}`);
    } catch (error) {
      setProgress(undefined);
      setUploadError(error instanceof Error ? error.message : "The upload could not be completed.");
    }
  };

  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <Container className={styles.content} size="hero">
        <h1 id="hero-title" className={styles.title}>
          Make your video speak more
        </h1>
        <UploadSurface
          hintId="upload-hint"
          onVideoSelected={handleVideoSelected}
          progress={progress}
        />
        <p className={styles.hint} id="upload-hint">
          {uploadError ?? "Drop once. The rest comes next."}
        </p>
      </Container>
    </section>
  );
}
