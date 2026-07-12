import styles from "./Logo.module.css";

export function Logo() {
  return (
    <div className={styles.brand} aria-label="AI Media Factory">
      <span className={styles.mark} aria-hidden="true">
        <svg viewBox="0 0 24 24" role="img" focusable="false">
          <path
            d="M6.75 5.75h7.55a2 2 0 0 1 1.42.59l1.94 1.94a2 2 0 0 1 .59 1.42v8.55a2 2 0 0 1-2 2H6.75a2 2 0 0 1-2-2v-10.5a2 2 0 0 1 2-2Z"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
          <path
            d="m14.5 5.75 0 3a1 1 0 0 0 1 1h2.75"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
          <path
            d="M8.75 15.25h6.5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.5"
          />
        </svg>
      </span>
      <span className={styles.text}>AI Media Factory</span>
    </div>
  );
}
