// Plain-English tooltips. Definitions lifted from playbooks.md's "Account health math" section
// so the dashboard and the internal playbook stay in sync.

export const GLOSSARY: Record<string, string> = {
  // Lifecycle buckets
  "New-Lead":          "Fresh inbound contact — no orders yet.",
  "Unactivated-Lead":  "Applied, never ordered. Application-form origin, batch-revived semi-annually.",
  "First-Time":        "One lifetime order. 1st→2nd is where LTV is built or lost.",
  "Graduating-Trial":  "2-3 orders and still within 1× their cadence. Highest-leverage cross-sell window — future VIPs if nudged now.",
  "Established-Active":"4+ lifetime orders, ordering on schedule. Stable base.",
  "At-Risk":           "1.5× their usual cadence silent — a nudge before they go cold.",
  "Dormant-VIP":       "6+ lifetime orders, past 2.5× cadence. Rikko personal call.",
  "Likely-Lost":       "4×+ cadence silent, >270 days, no Pipedrive activity in 90d. Last-chance batch.",

  // Cadence statuses
  "Warm":              "Ordering on or before their usual interval.",
  "At Risk":           "1.5× the median gap silent between their last orders.",
  "Dormant":           "2.5× the median gap silent — actively at risk of churn.",
  "Likely Lost":       "4×+ silent AND >270 days AND no activity 90d. Low reactivation yield.",

  // Basket trend
  "Eroding":           "Recent 3-order AOV down >25% vs the trailing 6 — hidden churn signal, more predictive than silence.",
  "Stable":            "Recent AOV within 25% of baseline.",
  "Growing":           "Recent AOV up >25% vs baseline — expanding wallet.",

  // Top-level concepts
  "Cadence Status":    "How on-schedule the account is vs its own personal order cadence.",
  "Lifecycle Bucket":  "Stage in the wholesale lifecycle: new lead → first-time → trial → established → dormant/lost.",
  "Personal Cadence":  "Median gap (days) between this account's last 3-5 orders. The promise they've made us — not a rule we impose.",
  "Basket Trend":      "Whether their recent average order value is growing, stable, or eroding vs their baseline.",
};

export function glossaryFor(term: string): string | undefined {
  return GLOSSARY[term];
}
