import { Motion } from "@/components/motion/Motion";

import styles from "./Analysis.module.css";

interface AnalysisStepProps {
  message: string;
  state: "understood" | "unavailable";
}

export function AnalysisStep({ message, state }: AnalysisStepProps) {
  return (
    <Motion as="li" className={styles.step} data-state={state} preset="gentle">
      <span className={styles.stepMark} aria-hidden="true">
        {state === "understood" ? "✓" : "—"}
      </span>
      <span>{message}</span>
    </Motion>
  );
}
