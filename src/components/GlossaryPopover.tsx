"use client";

import { useState, useEffect } from "react";
import { GLOSSARY, type Explainer } from "@/lib/glossary";

const LIFECYCLE_ORDER = [
  "New-Lead",
  "Unactivated-Lead",
  "First-Time",
  "Graduating-Trial",
  "Established-Active",
  "At-Risk",
  "Dormant-VIP",
  "Likely-Lost",
];
const CADENCE_ORDER = ["Warm", "At Risk", "Dormant", "Likely Lost"];
const BASKET_ORDER = ["Growing", "Stable", "Eroding"];

export function GlossaryPopover({
  term,
  className,
  label,
  variant = "icon",
}: {
  term: string;
  className?: string;
  label?: string; // if provided, render as "{label} ⓘ"; else just the icon
  variant?: "icon" | "inline"; // inline = underlined clickable text + icon
}) {
  const [open, setOpen] = useState(false);
  const explainer = GLOSSARY[term];

  // Escape closes
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open]);

  if (!explainer) return label ? <span className={className}>{label}</span> : null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        className={
          (variant === "inline"
            ? "underline decoration-dotted underline-offset-2 decoration-muted hover:decoration-ink "
            : "") + (className ?? "")
        }
        aria-label={`What does ${term} mean?`}
      >
        {label ? <>{label}<span className="ml-1 text-muted">ⓘ</span></> : <span className="text-muted hover:text-ink cursor-pointer">ⓘ</span>}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-t-lg sm:rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto sm:mb-0 animate-[slideup_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="hk-label">{explainer.diagram ? "Stage" : "Term"}</div>
                <h3 className="mt-1 text-lg font-semibold">{term}</h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted hover:text-ink text-2xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {explainer.diagram ? <StepDiagram diagram={explainer.diagram} current={term} /> : null}

            <Section label="What it is" body={explainer.what} />
            <Section label="Why it matters" body={explainer.why} />
            <Section label="Example" body={explainer.example} italic />
            <Section label="What to do" body={explainer.action} bold />
          </div>
        </div>
      ) : null}
    </>
  );
}

function Section({ label, body, italic, bold }: { label: string; body: string; italic?: boolean; bold?: boolean }) {
  return (
    <div className="mt-4">
      <div className="hk-label">{label}</div>
      <p className={`mt-1 text-sm text-ink ${italic ? "italic text-muted" : ""} ${bold ? "font-medium" : ""}`}>
        {body}
      </p>
    </div>
  );
}

function StepDiagram({ diagram, current }: { diagram: "lifecycle" | "cadence" | "basket"; current: string }) {
  const steps =
    diagram === "lifecycle" ? LIFECYCLE_ORDER
    : diagram === "cadence" ? CADENCE_ORDER
    : BASKET_ORDER;

  return (
    <div className="mt-4 rounded border border-line bg-paper p-3">
      <div className="hk-label mb-2">
        {diagram === "lifecycle" ? "Lifecycle stages" : diagram === "cadence" ? "Cadence status" : "Basket trend"}
      </div>
      <div className="flex flex-wrap items-center gap-1 text-xs">
        {steps.map((s, i) => {
          const isCurrent = s === current;
          return (
            <span key={s} className="inline-flex items-center">
              <span
                className={
                  "rounded px-2 py-1 " +
                  (isCurrent
                    ? "bg-accent text-white font-medium"
                    : "text-muted bg-white border border-line")
                }
              >
                {s}
              </span>
              {i < steps.length - 1 ? <span className="mx-1 text-muted">→</span> : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}
