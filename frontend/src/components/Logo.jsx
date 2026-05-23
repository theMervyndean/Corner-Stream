import React from "react";

const LOGO_URL = "https://customer-assets.emergentagent.com/job_945c7e1e-55c4-468f-bc30-c807e74dde96/artifacts/l9x74elv_ChatGPT%20Image%20May%209%2C%202026%2C%2003_40_29%20AM.png";

export default function Logo({ size = 36, withText = true, textTone = "navy" }) {
  return (
    <div className="flex items-center gap-2" data-testid="cs-logo">
      <img
        src={LOGO_URL}
        alt="Corner Streams"
        style={{ width: size, height: size, objectFit: "contain" }}
        className="rounded-md bg-white"
      />
      {withText && (
        <span className={`font-display font-extrabold text-lg leading-none ${textTone === "white" ? "text-white" : "cs-text-navy"}`}>
          Corner<span className="cs-text-green">Streams</span>
        </span>
      )}
    </div>
  );
}
