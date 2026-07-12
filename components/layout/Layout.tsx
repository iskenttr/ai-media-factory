import type { ReactNode } from "react";

import styles from "./Layout.module.css";

interface LayoutProps {
  children: ReactNode;
  header: ReactNode;
}

export function Layout({ children, header }: LayoutProps) {
  return (
    <div className={styles.pageShell}>
      <header className={styles.topbar}>{header}</header>
      <main>{children}</main>
    </div>
  );
}
