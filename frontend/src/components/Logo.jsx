import React from "react";

export function Logo({ className = "", showText = true, size = 28 }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`} data-testid="replate-logo">
      <div
        className="relative flex items-center justify-center rounded-[6px] shrink-0"
        style={{ width: size, height: size, background: "#EF5A28" }}
      >
        <div className="rounded-full bg-black/85" style={{ width: size * 0.34, height: size * 0.34 }} />
      </div>
      {showText && (
        <span className="font-display font-extrabold tracking-tight text-white leading-none"
              style={{ fontSize: size * 0.62 }}>
          re<span className="text-[#EF5A28]">·</span>plate
        </span>
      )}
    </div>
  );
}

export default Logo;
