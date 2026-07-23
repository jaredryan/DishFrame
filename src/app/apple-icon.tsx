import { renderDishFrameMarkIcon } from "@/lib/og/dishframe-mark-image";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return renderDishFrameMarkIcon(size.width, { square: true });
}
