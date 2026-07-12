import styles from "./Analysis.module.css";

export function AISignature({ resolved = false }: { resolved?: boolean }) {
  return (
    <div className={styles.signature} data-resolved={resolved} aria-hidden="true">
      <span />
      <i />
      <span />
    </div>
  );
}
