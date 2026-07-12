import { Motion } from "@/components/motion/Motion";

import styles from "./UploadSurface.module.css";

export interface UploadProgress {
  fileName: string;
  percent: number;
  status: string;
}

interface UploadStateProps {
  progressLabelId: string;
  progress?: UploadProgress;
  state: "idle" | "drag" | "loading";
}

export function UploadState({ progressLabelId, progress, state }: UploadStateProps) {
  const progressPercent = progress ? Math.min(100, Math.max(0, progress.percent)) : 0;

  return (
    <>
      <Motion className={styles.orb} preset="confident" aria-hidden="true">
        <div className={styles.orbRing} />
        <div className={styles.orbCore}>
          <svg viewBox="0 0 24 24" role="img" focusable="false">
            <path
              d="M12 6v12M6 12h12"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.7"
            />
          </svg>
        </div>
      </Motion>

      <div className={`${styles.copy} ${styles.copyIdle}`} aria-hidden={state !== "idle"}>
        <p className={styles.title}>Drop your video here</p>
      </div>

      <div className={`${styles.copy} ${styles.copyDrag}`} aria-hidden={state !== "drag"}>
        <p className={styles.title}>Let it travel further</p>
        <p className={styles.subtitle}>Release to drop</p>
      </div>

      {progress ? (
        <div className={styles.progress} aria-hidden={state !== "loading"}>
          <div className={styles.progressMeta}>
            <span className={styles.progressFilename} id={progressLabelId}>
              {progress.fileName}
            </span>
            <span className={styles.progressPercentage}>{progressPercent}%</span>
          </div>
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
            aria-labelledby={progressLabelId}
          >
            <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
          </div>
          <p className={styles.progressStatus} aria-live="polite">
            {progress.status}
          </p>
        </div>
      ) : null}
    </>
  );
}
