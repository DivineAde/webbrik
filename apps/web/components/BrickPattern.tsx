/** A running-bond brick wall, unique per seed. It stands in for a project thumbnail and is the product's one recurring motif. */
function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed: number) { let a = seed || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function BrickPattern({ seed, className = "", bold = false, neutral = false }: { seed: string; className?: string; bold?: boolean; neutral?: boolean }) {
  const h = hash(seed), rand = rng(h);
  const hue = neutral ? 260 : h % 360;
  const W = 44, H = 20, GAP = 3, COLS = 9, ROWS = 11;
  const bricks: { x: number; y: number; w: number; fill: string }[] = [];
  const pick = Math.floor(rand() * COLS * ROWS * 0.5) + 20; // one brick is "selected", like an element in the editor
  let i = 0, selected: { x: number; y: number; w: number } | null = null;
  for (let r = 0; r < ROWS; r++) {
    const off = r % 2 ? -W / 2 : 0;
    for (let c = 0; c < COLS + 1; c++) {
      const x = c * (W + GAP) + off, y = r * (H + GAP);
      const t = rand();
      const l = bold ? (neutral ? 0.9 + t * 0.07 : 0.82 + t * 0.1) : 0.93 + t * 0.045;
      const chroma = neutral ? 0.006 : bold ? 0.05 : 0.018;
      bricks.push({ x, y, w: W, fill: `oklch(${l.toFixed(3)} ${chroma} ${hue})` });
      if (i++ === pick) selected = { x, y, w: W };
    }
  }
  return (
    <svg viewBox={`0 0 ${COLS * (W + GAP)} ${ROWS * (H + GAP)}`} preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true" focusable="false">
      <rect width="100%" height="100%" fill={`oklch(${bold ? 0.97 : 0.985} 0.006 ${hue})`} />
      {bricks.map((b, k) => <rect key={k} x={b.x} y={b.y} width={b.w} height={H} rx="2" fill={b.fill} />)}
      {selected && <rect x={selected.x} y={selected.y} width={selected.w} height={H} rx="2" fill="none" stroke="var(--selection)" strokeWidth="2" />}
    </svg>
  );
}
