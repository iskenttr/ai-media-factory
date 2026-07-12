import type { ComponentPropsWithoutRef, ElementType } from "react";

import styles from "./Container.module.css";

type ContainerProps<T extends ElementType = "div"> = {
  as?: T;
  size?: "wide" | "hero";
} & Omit<ComponentPropsWithoutRef<T>, "as">;

export function Container<T extends ElementType = "div">({
  as,
  className,
  size = "wide",
  ...props
}: ContainerProps<T>) {
  const Component = as ?? "div";
  const classes = [styles.container, styles[size], className].filter(Boolean).join(" ");

  return <Component className={classes} {...props} />;
}
