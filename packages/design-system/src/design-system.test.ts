import { describe, expect, it } from "vitest";
import { darkTokens, lightTokens, themeCss } from "./index";

describe("design-system", () => {
  it("defines the same keys for light and dark", () => {
    expect(Object.keys(darkTokens).sort()).toEqual(Object.keys(lightTokens).sort());
  });
  it("uses black primary and respects reduced motion", () => {
    const css = themeCss();
    expect(css).toContain("--primary:oklch(0.145 0 0)");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain(".dark{");
  });
});
