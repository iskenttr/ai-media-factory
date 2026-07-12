import type { ReactNode } from "react";

import styles from "./Analysis.module.css";

export function AnalysisCard({ children }: { children: ReactNode }) {
  return <div className={styles.card}>{children}</div>;
}
