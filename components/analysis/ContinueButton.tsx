import type { ButtonHTMLAttributes } from "react";

import styles from "./Analysis.module.css";

export function ContinueButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={styles.continueButton} type="button" {...props}>
      Continue to localization
    </button>
  );
}
