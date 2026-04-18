export function BigNumber({
  label,
  value,
  delta,
  format = (v: number | string) => String(v),
  hint,
}: {
  label: string;
  value: number | string | null;
  delta?: number | null; // week-over-week % delta (e.g., 0.12 for +12%)
  format?: (v: number | string) => string;
  hint?: string;
}) {
  const isPositive = (delta ?? 0) >= 0;
  return (
    <div className="hk-card">
      <div className="hk-label">{label}</div>
      <div className="mt-2 hk-number text-3xl">{value == null ? "—" : format(value)}</div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {delta != null ? (
          <span className={isPositive ? "text-good" : "text-warn"}>
            {isPositive ? "▲" : "▼"} {(Math.abs(delta) * 100).toFixed(1)}% WoW
          </span>
        ) : null}
        {hint ? <span className="text-muted">{hint}</span> : null}
      </div>
    </div>
  );
}
