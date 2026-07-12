"use client";

import {
  useRef,
  useState,
  useId,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";

import { UploadState, type UploadProgress } from "./UploadState";
import styles from "./UploadSurface.module.css";

const acceptedVideoTypes =
  "video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.webm,.m4v";

interface UploadSurfaceProps {
  hintId: string;
  onVideoSelected?: (sourceVideo: File) => void;
  progress?: UploadProgress;
}

function isAcceptedVideo(sourceVideo: File) {
  return sourceVideo.type.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/i.test(sourceVideo.name);
}

export function UploadSurface({ hintId, onVideoSelected, progress }: UploadSurfaceProps) {
  const progressLabelId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const isLoading = Boolean(progress);
  const state = isLoading ? "loading" : isDragging ? "drag" : "idle";

  const selectVideo = (sourceVideo?: File) => {
    if (!sourceVideo || !isAcceptedVideo(sourceVideo)) {
      return;
    }

    onVideoSelected?.(sourceVideo);
  };

  const openFilePicker = () => {
    if (!isLoading) {
      inputRef.current?.click();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    openFilePicker();
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    selectVideo(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    if (isLoading) {
      return;
    }

    dragDepth.current += 1;
    setIsDragging(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);

    if (dragDepth.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    selectVideo(event.dataTransfer.files[0]);
  };

  return (
    <div
      className={styles.surface}
      data-state={state}
      role="button"
      tabIndex={0}
      aria-describedby={hintId}
      aria-disabled={isLoading}
      aria-label="Drop your video here or click to upload"
      onClick={openFilePicker}
      onKeyDown={handleKeyDown}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept={acceptedVideoTypes}
        aria-label="Choose a source video"
        onChange={handleInputChange}
      />
      <UploadState progressLabelId={progressLabelId} progress={progress} state={state} />
    </div>
  );
}
