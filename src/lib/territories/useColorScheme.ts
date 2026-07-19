"use client";

import { useEffect, useState } from "react";

/**
 * Tracks the viewer's OS/browser color-scheme preference so client components can pick
 * the correct light/dark color variant -- the choropleth/tier/competitor ramps genuinely
 * differ per mode (see color.ts), not just chrome/text tokens, so this can't be handled by
 * CSS variables alone the way surface/text colors are.
 */
export function useColorScheme(): "light" | "dark" {
  const [mode, setMode] = useState<"light" | "dark">("light");

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = (matches: boolean) => setMode(matches ? "dark" : "light");
    sync(query.matches);
    const listener = (e: MediaQueryListEvent) => sync(e.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  return mode;
}
