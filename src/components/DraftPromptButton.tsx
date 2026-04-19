"use client";

import { useState } from "react";

export function DraftPromptButton({ prompt, segmentLabel }: { prompt: string; segmentLabel: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-accent text-white px-3 py-1.5 text-xs hover:bg-accent/90"
      >
        Draft outreach
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-6 overflow-y-auto"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-md shadow-lg max-w-2xl w-full p-6 mt-12"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between">
              <div>
                <div className="hk-label">Draft prompt</div>
                <h3 className="mt-1 text-base font-semibold">{segmentLabel}</h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted hover:text-ink text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <p className="mt-3 text-sm text-muted">
              This prompt is grounded in real accounts, SKUs, and brand voice. Copy it, paste into claude.ai, get a
              draft, iterate there.
            </p>

            <pre className="mt-4 max-h-96 overflow-y-auto whitespace-pre-wrap rounded border border-line bg-paper p-3 text-xs font-mono leading-relaxed">
              {prompt}
            </pre>

            <div className="mt-4 flex items-center justify-between gap-3">
              <a
                href="https://claude.ai/new"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-accent hover:underline"
              >
                Open claude.ai →
              </a>
              <button
                type="button"
                onClick={copy}
                className="rounded-md bg-accent text-white px-4 py-2 text-sm hover:bg-accent/90"
              >
                {copied ? "Copied ✓" : "Copy prompt"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
