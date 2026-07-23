import { renderDishFrameMarkIcon } from "@/lib/og/dishframe-mark-image";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return renderDishFrameMarkIcon(size.width);
}
