// Prompt templates for segment-based outreach drafting.
// These get copied into claude.ai — the dashboard never calls an LLM at runtime.
// Each template embeds real account data so the draft is grounded, not generic.

import type { EnrichedOrg } from "./pipedrive";

type SegmentCtx = {
  label: string;
  groupBy: "bucket" | "sector" | "category";
  count: number;
  totalLtv: number;
  avgAov: number;
  avgOrders: number;
  topSector: string | null;
  topCategory: string | null;
  orgs: EnrichedOrg[]; // top 10 by LTV
};

// The Hokusan B2B voice guide — condensed from brand-voice.md so the marketer doesn't have to paste it.
const HOKUSAN_VOICE = `
**Voice: Hokusan B2B wholesale.** Quiet confidence — operator-to-operator. Craft, not luxury.
Provenance is the pitch (grade, cultivar, harvest, Shizuoka). Short sentences; operators skim.
Canadian spelling. No emoji. No exclamation points. No "game-changer," "unlock," "elevate,"
"premium quality." Lead with what it IS before what it DOES.`.trim();

// Skill mapping per lifecycle bucket — which playbook style applies.
function skillForBucket(label: string): { skill: string; framing: string; goal: string } {
  const l = label.toLowerCase();
  if (l.includes("graduating") || l.includes("trial")) {
    return {
      skill: "copywriting (cross-sell)",
      framing:
        "These accounts are 2-3 orders in and still ordering on schedule. Natural-extension cross-sell — reference what they're already buying and propose ONE sensible addition for their sector.",
      goal: "One short email: reference their SKU mix, propose one natural extension, ask for a short reply if interesting. Not a sales pitch — an operator recommending to another operator.",
    };
  }
  if (l.includes("dormant") && l.includes("vip")) {
    return {
      skill: "cold-email + churn-prevention framing",
      framing:
        "6+ lifetime orders, gone quiet past 2.5× their usual cadence. This is a personal touch from Rikko — NOT a marketing email.",
      goal: "One short personal note from Rikko: acknowledge the silence, reference their actual last order, ask what changed, offer to just chat. No pitch, no discount. Real.",
    };
  }
  if (l.includes("at-risk") || l.includes("at risk")) {
    return {
      skill: "churn-prevention + email-sequence (light nudge)",
      framing:
        "Past 1.5× their usual order cadence — about to go cold. Not yet dormant. A light visibility nudge before things slip further. No discount, no urgency theater.",
      goal: "One low-pressure email: 'thought of you, how's stock looking, here's what's fresh.' Grounded in their actual SKU mix.",
    };
  }
  if (l.includes("likely-lost") || l.includes("likely lost")) {
    return {
      skill: "cold-email (last-chance tone)",
      framing:
        "4×+ cadence silent, >270 days, no Pipedrive activity in 90+ days. Reactivation yield is low — one honest last-chance email, then archive.",
      goal: "One short, honest email: 'haven't heard from you in a while — is there anything we can do, or should we close your file?' No soft-sell, no guilt.",
    };
  }
  if (l.includes("first-time")) {
    return {
      skill: "email-sequence (second-order flow)",
      framing:
        "Single lifetime order. The 1st→2nd order is where wholesale LTV is built or lost. Reference the exact SKU they tried, ask about performance, offer a second-order hook.",
      goal: "One email referencing their first SKU by name: 'how did it perform?', optional reorder CTA, open door for feedback.",
    };
  }
  if (l.includes("established-active") || l.includes("established active")) {
    return {
      skill: "copywriting (adjacent-grade cross-sell)",
      framing:
        "Stable, reliable buyers at 4+ orders. Low-stakes expansion — propose the adjacent grade or complementary SKU for their sector.",
      goal: "Short, specific: name the adjacent SKU, explain why it fits alongside what they already buy, invite one reply to try a sample.",
    };
  }
  if (l.includes("unactivated") || l.includes("new-lead") || l.includes("new lead")) {
    return {
      skill: "cold-email (first-touch)",
      framing: "Applied or inquired but never ordered. First-touch B2B email.",
      goal: "Short intro: who we are in one line, what we offer for their sector, one specific next step (sample / rate card / quick call).",
    };
  }
  // Default for sector/product groupings
  return {
    skill: "cold-email + copywriting (sector-targeted outreach)",
    framing: `Accounts grouped by "${label}". Outreach should speak to what this group has in common.`,
    goal: "One short email tailored to this group. Specific SKU recommendation, operator-to-operator tone.",
  };
}

export function buildSegmentPrompt(ctx: SegmentCtx): string {
  const { skill, framing, goal } = skillForBucket(ctx.label);
  const accountLines = ctx.orgs
    .slice(0, 10)
    .map((o, i) => {
      const parts = [
        `${i + 1}. ${o.name}`,
        o.business_sector ? `sector: ${o.business_sector}` : null,
        o.order_count != null ? `${o.order_count} orders` : null,
        o.avg_order_value != null ? `AOV $${Math.round(o.avg_order_value)}` : null,
        o.days_since_last_order != null ? `${o.days_since_last_order}d since last` : null,
        o.last_3_orders_summary ? `last mix: ${o.last_3_orders_summary}` : null,
      ].filter(Boolean);
      return `   ${parts.join(" · ")}`;
    })
    .join("\n");

  return `You're drafting a B2B wholesale outreach email for Hokusan Tea Canada.

# Segment
**${ctx.label}** (${ctx.groupBy}) — ${ctx.count} accounts
- Total LTV: $${Math.round(ctx.totalLtv).toLocaleString("en-CA")} CAD
- Avg AOV: $${Math.round(ctx.avgAov).toLocaleString("en-CA")}
- Avg orders per account: ${ctx.avgOrders.toFixed(1)}
${ctx.topSector ? `- Top sector: ${ctx.topSector}` : ""}
${ctx.topCategory ? `- Top product: ${ctx.topCategory}` : ""}

# Playbook (${skill})
${framing}

**Goal:** ${goal}

# Real accounts in this segment (for grounding — use real SKUs and sectors, do NOT invent)
${accountLines}

# Voice
${HOKUSAN_VOICE}

# What I need from you
Draft ONE email template for this segment. Use merge fields where the copy should vary by account
(e.g., \`{{first_name}}\`, \`{{last_sku}}\`, \`{{sector}}\`). Do NOT personalize per account in the draft —
a marketer will merge + send via their ESP.

Respond in this exact format:

**Subject line:** (one line, <60 chars, specific, no hype)

**Preview text:** (one sentence, <100 chars)

**Body:** (3-5 short paragraphs, Hokusan voice)

Flag anything you want me to double-check before sending (e.g., "verify H-M2 1kg availability").
`;
}
