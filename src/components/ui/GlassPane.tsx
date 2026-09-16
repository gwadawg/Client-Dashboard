import type { ElementType, HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
};

/**
 * Web approximation of Apple Liquid Glass (regular variant).
 * Use only on chrome: sidebar, toolbar, sheets. Not content cards.
 */
export default function GlassPane({
  as: Tag = "div",
  className = "",
  ...props
}: Props) {
  return <Tag className={["ws-glass", className].filter(Boolean).join(" ")} {...props} />;
}
