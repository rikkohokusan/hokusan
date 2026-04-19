// Compact trend card: big current number + tiny 12-week sparkline beneath.

type Point = { label: string; value: number };

export function Sparkline({
  label,
  data,
  format = (v: number) => v.toLocaleString(),
  tooltip,
}: {
  label: string;
  data: Point[];
  format?: (v: number) => string;
  tooltip?: string;
}) {
  if (!data.length) {
    return (
      <div className="hk-card">
        <div className="hk-label">{label}</div>
        <div className="mt-2 hk-number text-2xl text-muted">—</div>
      </div>
    );
  }
  const last = data[data.length - 1];
  const first = data[0];

  const w = 180, h = 36;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = data.length > 1 ? w / (data.length - 1) : 0;
  const points = data.map((d, i) => {
    const x = i * step;
    const y = h - ((d.value - min) / span) * h;
    return { x, y };
  });
  const path = points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(" ");

  // Trend direction: compare first half mean to second half mean
  const half = Math.floor(values.length / 2);
  const firstMean = values.slice(0, half).reduce((a, b) => a + b, 0) / (half || 1);
  const secondMean = values.slice(half).reduce((a, b) => a + b, 0) / (values.length - half || 1);
  const trending = firstMean === 0 ? 0 : (secondMean - firstMean) / firstMean;
  const arrow = trending > 0.05 ? "▲" : trending < -0.05 ? "▼" : "■";
  const arrowClass = trending > 0.05 ? "text-good" : trending < -0.05 ? "text-warn" : "text-muted";

  return (
    <div className="hk-card">
      <div className="hk-label" title={tooltip}>
        {label}
        {tooltip ? <span className="ml-1 text-muted cursor-help">ⓘ</span> : null}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="hk-number text-2xl">{format(last.value)}</span>
        <span className={`text-xs ${arrowClass}`}>{arrow}</span>
      </div>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="mt-2 block" role="img" aria-label={`${label} trend`}>
        <path d={path} fill="none" stroke="#1f4d3a" strokeWidth="1.5" />
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2.5" fill="#1f4d3a" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>{first.label}</span>
        <span>{last.label}</span>
      </div>
    </div>
  );
}
