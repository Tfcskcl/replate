import React from "react";

export function Logo({ className = "", size = 28 }) {
  return (
    <img src="/replate-logo.png" alt="RE-PLATE" data-testid="replate-logo"
      className={`w-auto object-contain ${className}`} style={{ height: size }} />
  );
}

export default Logo;
