/** Small four-point sparkles all around (cx, cy), each pulsing at its own moment. */
export function Sparkles({ cx, cy, scale = 1 }: { cx: number; cy: number; scale?: number }) {
  const sparkles = [
    { dx: 0, dy: 0, r: 6, delay: 0 },
    { dx: 8, dy: -6, r: 3.5, delay: 0.5 },
    { dx: 9, dy: 5, r: 2.5, delay: 1.4 },
    { dx: 0, dy: 10, r: 3.5, delay: 0.9 },
    { dx: -8.5, dy: 4, r: 3, delay: 0.2 },
    { dx: -7, dy: -7, r: 2.5, delay: 1.1 },
    { dx: 1, dy: -10.5, r: 3, delay: 1.7 },
  ];
  return (
    <>
      {sparkles.map(({ dx, dy, r, delay }, i) => {
        const x = cx + dx * scale;
        const y = cy + dy * scale;
        const s = r * scale;
        const n = s * 0.22;
        return (
          <path
            key={i}
            className="hex-shine"
            style={{ animationDelay: `${delay}s` }}
            d={`M${x} ${y - s} L${x + n} ${y - n} L${x + s} ${y} L${x + n} ${y + n} L${x} ${y + s} L${x - n} ${y + n} L${x - s} ${y} L${x - n} ${y - n} Z`}
            fill="#fde047"
          />
        );
      })}
    </>
  );
}
