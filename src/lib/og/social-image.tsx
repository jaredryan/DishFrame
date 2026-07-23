import { ImageResponse } from "next/og";

const BACKGROUND = "#f4f6f8";
const TEXT_PRIMARY = "#252932";
const TEXT_SECONDARY = "#667080";
const BORDER = "#dfe4ea";
const BRAND_BLUE = "#2563eb";
const BRAND_GREEN = "#16a66a";
const BRAND_PURPLE = "#7c3aed";
const BRAND_ORANGE = "#f97316";

export const socialImageSize = { width: 1200, height: 630 };

function Card({
  accent,
  style,
}: {
  accent: string;
  style: React.CSSProperties;
}) {
  return (
    <div
      style={{
        position: "absolute",
        display: "flex",
        background: "#ffffff",
        border: `1px solid ${BORDER}`,
        borderTop: `4px solid ${accent}`,
        borderRadius: 16,
        ...style,
      }}
    />
  );
}

/**
 * Temporary DishFrame social image: modular cards echoing the "framed
 * preparation" motif behind a centered wordmark and tagline. Meant to be
 * replaced once a final logo and brand photography exist.
 */
export function renderSocialImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: BACKGROUND,
        fontFamily: "sans-serif",
      }}
    >
      <Card
        accent={BRAND_BLUE}
        style={{ width: 220, height: 140, left: 90, top: 90 }}
      />
      <Card
        accent={BRAND_GREEN}
        style={{ width: 180, height: 110, left: 110, bottom: 80 }}
      />
      <Card
        accent={BRAND_PURPLE}
        style={{ width: 190, height: 120, right: 100, top: 110 }}
      />
      <Card
        accent={BRAND_ORANGE}
        style={{ width: 160, height: 100, right: 130, bottom: 100 }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            width: 64,
            height: 64,
            borderRadius: 18,
            background: BRAND_BLUE,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 9,
              background: BRAND_ORANGE,
              marginTop: 10,
              marginLeft: 10,
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 72,
            fontWeight: 700,
            color: TEXT_PRIMARY,
          }}
        >
          Dish<span style={{ color: BRAND_BLUE }}>Frame</span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          marginTop: 28,
          fontSize: 30,
          color: TEXT_SECONDARY,
          textAlign: "center",
        }}
      >
        A better framework for the way you cook.
      </div>
    </div>,
    socialImageSize,
  );
}
