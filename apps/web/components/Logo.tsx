/** Webbrik mark: two offset bricks (running bond). Pure SVG so it takes the text colour. */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="2" y="4" width="13" height="7" rx="2" fill="currentColor" />
      <rect x="9" y="13" width="13" height="7" rx="2" fill="currentColor" opacity="0.55" />
    </svg>
  );
}
