import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "PowerUpCode — Practice DSA like a game";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#000000",
          color: "#ffffff",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          fontFamily:
            "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: "120px",
            fontWeight: 800,
            letterSpacing: "-0.04em",
            lineHeight: 1,
          }}
        >
          PowerUpCode
        </div>
        <div
          style={{
            display: "flex",
            marginTop: "32px",
            fontSize: "44px",
            fontWeight: 500,
            color: "#a1a1aa",
            letterSpacing: "-0.01em",
          }}
        >
          Practice DSA like a game.
        </div>
        <div
          style={{
            display: "flex",
            marginTop: "56px",
            gap: "20px",
            fontSize: "26px",
            color: "#71717a",
            fontWeight: 500,
          }}
        >
          <span>XP &amp; levels</span>
          <span>·</span>
          <span>Daily challenges</span>
          <span>·</span>
          <span>AI feedback</span>
        </div>
        <div
          style={{
            display: "flex",
            position: "absolute",
            bottom: "60px",
            right: "80px",
            fontSize: "24px",
            color: "#52525b",
            fontWeight: 500,
            letterSpacing: "0.02em",
          }}
        >
          powerupcode.com
        </div>
      </div>
    ),
    { ...size }
  );
}
