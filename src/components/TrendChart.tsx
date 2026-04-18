// Inline SVG sparkline — no chart library needed. Tufte-leaning.
// Data: array of { label, value } ordered oldest → newest.

export function TrendChart({
  data,
  height = 80,
  width = 560,
  valueFormat = (v: number) => v.toLocaleString(),
}: {
  data: Array<{ label: string; value: number }>;
  height?: number;
  width?: number;
  valueFormat?: (v: number) => string;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-muted">No snapshots yet.</p>;
  }

  const pad = { top: 12, right: 8, bottom: 20, left: 8 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;

  const values = data.map((d) => d.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = max - min || 1;

  const step = data.length > 1 ? w / (data.length - 1) : 0;
  const points = data.map((d, i) => {
    const x = pad.left + i * step;
    const y = pad.top + h - ((d.value - min) / span) * h;
    return { ...d, x, y };
  });

  const path = points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(" ");
  const last = points[points.length - 1];
  const first = points[0];

  return (
    <figure>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img">
        <path d={path} fill="none" stroke="#1f4d3a" strokeWidth="1.5" />
        <circle cx={last.x} cy={last.y} r={3} fill="#1f4d3a" />
        <text x={pad.left} y={height - 4} fontSize="10" fill="#6b7280">
          {first.label}
        </text>
        <text x={width - pad.right} y={height - 4} fontSize="10" fill="#6b7280" textAnchor="end">
          {last.label}
        </text>
        <text x={last.x} y={last.y - 6} fontSize="10" fill="#0b0b0c" textAnchor="end">
          {valueFormat(last.value)}
        </text>
      </svg>
    </figure>
  );
}
