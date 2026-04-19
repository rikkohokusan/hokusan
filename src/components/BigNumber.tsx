import Link from "next/link";

export function BigNumber({
  label,
  value,
  delta,
  format = (v: number | string) => String(v),
  hint,
  href,
  tooltip,
}: {
  label: string;
  value: number | string | null;
  delta?: number | null; // week-over-week % delta (e.g., 0.12 for +12%)
  format?: (v: number | string) => string;
  hint?: string;
  href?: string;
  tooltip?: string;
}) {
  const isPositive = (delta ?? 0) >= 0;
  const body = (
    <div className={"hk-card " + (href ? "transition hover:border-accent hover:shadow-sm" : "")}>
      <div className="hk-label" title={tooltip}>
        {label}
        {tooltip ? <span className="ml-1 text-muted cursor-help">ⓘ</span> : null}
      </div>
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
  return href ? <Link href={href} className="block">{body}</Link> : body;
}
