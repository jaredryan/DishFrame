import { ImageResponse } from "next/og";

const BRAND_BLUE = "#2563eb";
const BRAND_ORANGE = "#f97316";

/**
 * Nested-frame mark rendered for raster icon contexts (favicon, app icon,
 * apple-touch-icon) — the same outer-frame / inset-tile motif as
 * `DishFrameMark`, since ImageResponse can't reuse that SVG component.
 */
export function renderDishFrameMarkIcon(
  size: number,
  { square = false }: { square?: boolean } = {},
) {
  const outerRadius = square ? 0 : Math.round(size * 0.28);
  const innerSize = Math.round(size * 0.44);
  const innerRadius = Math.round(size * 0.14);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND_BLUE,
        borderRadius: outerRadius,
      }}
    >
      <div
        style={{
          width: innerSize,
          height: innerSize,
          background: BRAND_ORANGE,
          borderRadius: innerRadius,
          marginTop: Math.round(size * 0.12),
          marginLeft: Math.round(size * 0.12),
        }}
      />
    </div>,
    { width: size, height: size },
  );
}
