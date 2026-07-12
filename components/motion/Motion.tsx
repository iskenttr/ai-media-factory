import { createElement, type ComponentPropsWithoutRef, type ElementType } from "react";

type MotionProps<T extends ElementType = "div"> = {
  as?: T;
  preset?: "confident" | "gentle";
} & Omit<ComponentPropsWithoutRef<T>, "as">;

export function Motion<T extends ElementType = "div">({
  as,
  preset = "confident",
  ...props
}: MotionProps<T>) {
  return createElement(as ?? "div", {
    ...props,
    "data-motion": preset,
  });
}
