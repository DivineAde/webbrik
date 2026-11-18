/** Central design tokens for the product UI. Black primary, neutral surfaces, OKLCH colors. */
export const lightTokens = {
  background: "oklch(1 0 0)",
  foreground: "oklch(0.145 0 0)",
  card: "oklch(1 0 0)",
  muted: "oklch(0.97 0 0)",
  "muted-foreground": "oklch(0.52 0 0)",
  primary: "oklch(0.145 0 0)",
  "primary-foreground": "oklch(0.985 0 0)",
  secondary: "oklch(0.97 0 0)",
  "secondary-foreground": "oklch(0.205 0 0)",
  accent: "oklch(0.96 0 0)",
  destructive: "oklch(0.5 0.21 27)",
  border: "oklch(0.922 0 0)",
  input: "oklch(0.922 0 0)",
  ring: "oklch(0.708 0 0)",
  "panel-bg": "oklch(0.985 0 0)",
  "canvas-bg": "oklch(0.96 0 0)",
  selection: "oklch(0.55 0.2 260)",
  "selection-soft": "oklch(0.55 0.2 260 / 14%)",
  raised: "oklch(0.99 0 0)",
} as const;

export const darkTokens: Record<keyof typeof lightTokens, string> = {
  background: "oklch(0.145 0 0)",
  foreground: "oklch(0.985 0 0)",
  card: "oklch(0.18 0 0)",
  muted: "oklch(0.24 0 0)",
  "muted-foreground": "oklch(0.7 0 0)",
  primary: "oklch(0.985 0 0)",
  "primary-foreground": "oklch(0.145 0 0)",
  secondary: "oklch(0.24 0 0)",
  "secondary-foreground": "oklch(0.985 0 0)",
  accent: "oklch(0.27 0 0)",
  destructive: "oklch(0.65 0.22 25)",
  border: "oklch(1 0 0 / 12%)",
  input: "oklch(1 0 0 / 15%)",
  ring: "oklch(0.556 0 0)",
  "panel-bg": "oklch(0.17 0 0)",
  "canvas-bg": "oklch(0.12 0 0)",
  selection: "oklch(0.7 0.15 260)",
  "selection-soft": "oklch(0.7 0.15 260 / 22%)",
  raised: "oklch(0.21 0 0)",
};

export const scale = {
  radius: { sm: "4px", md: "6px", lg: "8px", xl: "12px", "2xl": "16px" },
  space: [0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64],
  fontSize: { xs: "12px", sm: "13px", base: "14px", md: "15px", lg: "17px", xl: "22px" },
  fontWeight: { regular: 400, medium: 500, semibold: 600 },
  lineHeight: { tight: 1.2, snug: 1.4, normal: 1.5 },
  shadow: { sm: "0 1px 2px oklch(0 0 0 / 6%)", md: "0 4px 12px oklch(0 0 0 / 8%)", lg: "0 12px 32px oklch(0 0 0 / 12%)" },
  z: { canvas: 0, panel: 10, toolbar: 20, popover: 40, dialog: 50, toast: 60 },
  motion: { fast: "100ms", base: "160ms", slow: "240ms", easeOut: "cubic-bezier(0.22, 1, 0.36, 1)", easeInOut: "cubic-bezier(0.65, 0, 0.35, 1)" },
} as const;

type Tokens = Record<string, string>;
const decls = (t: Tokens) => Object.entries(t).map(([k, v]) => `--${k}:${v}`).join(";");

/** CSS variables for both themes; components never branch on theme, they only read variables. */
export function themeCss(): string {
  const scaleVars: Tokens = {};
  for (const [k, v] of Object.entries(scale.radius)) scaleVars[`radius-${k}`] = v;
  for (const [k, v] of Object.entries(scale.fontSize)) scaleVars[`text-${k}`] = v;
  for (const [k, v] of Object.entries(scale.shadow)) scaleVars[`shadow-${k}`] = v;
  for (const [k, v] of Object.entries(scale.z)) scaleVars[`z-${k}`] = String(v);
  for (const [k, v] of Object.entries(scale.motion)) scaleVars[`motion-${k}`] = v;
  return [
    `:root{${decls(lightTokens)};${decls(scaleVars)}}`,
    `.dark{${decls(darkTokens)}}`,
    `@media (prefers-reduced-motion:reduce){:root{--motion-fast:0ms;--motion-base:0ms;--motion-slow:0ms}}`,
  ].join("\n");
}
