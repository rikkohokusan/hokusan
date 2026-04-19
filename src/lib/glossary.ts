// Plain-English explainers for dashboard jargon.
// Written for a sales team where English is a second language.
// Grade 5 reading level. Short sentences. Concrete examples.

export type Explainer = {
  what: string;
  why: string;
  example: string;
  action: string;
  // Position within a named stepper diagram. Renders as a tiny visual under the text.
  diagram?: "lifecycle" | "cadence" | "basket";
};

export const GLOSSARY: Record<string, Explainer> = {
  // ---------------- Lifecycle Bucket — positions in the customer journey ----------------
  "Lifecycle Bucket": {
    what: "What stage a customer is at — from new lead to regular buyer to lost.",
    why: "Different stages need different messages. A new lead needs an intro. A regular buyer needs a new product idea. Don't send the same email to both.",
    example: "A cafe that has ordered 5 times is Established-Active. A cafe that applied but never ordered is Unactivated-Lead.",
    action: "Match your outreach to the stage. Use the buckets below as your guide.",
  },

  "New-Lead": {
    what: "A brand new contact. They filled out a form or reached out, but no order yet.",
    why: "They are curious. This is when they are most likely to open your reply.",
    example: "A bubble tea shop filled the wholesale form yesterday. Today is your best day to email them.",
    action: "Reply fast. The first 30 minutes matter more than the next 30 days.",
    diagram: "lifecycle",
  },

  "Unactivated-Lead": {
    what: "Someone who asked about us a long time ago, but never ordered.",
    why: "Cold leads rarely wake up from a single email. They need a reason to come back.",
    example: "A bakery filled the form 8 months ago. We emailed once. Silence since.",
    action: "Wait for a bigger campaign (like a new harvest launch) and include them in a batch. Do not waste a weekly slot on one cold email.",
    diagram: "lifecycle",
  },

  "First-Time": {
    what: "A customer with exactly 1 order. They tried us once.",
    why: "The 2nd order decides everything. If they reorder, they usually stay. If they don't, they are gone.",
    example: "Le Bleu Coffee ordered H-M2 matcha once, 40 days ago. They haven't come back yet.",
    action: "Email asking how the tea performed. Mention the exact product they bought. Offer a smooth reorder.",
    diagram: "lifecycle",
  },

  "Graduating-Trial": {
    what: "A customer who has ordered 2 or 3 times and is still ordering on time.",
    why: "This is the very best time to sell them one more product. They trust us now. A small push turns them into a regular.",
    example: "Hundo-P Smoothies has ordered 3 times. They buy matcha canister. They are ready to try H-M3 next.",
    action: "Contact this week. Suggest ONE extra product that fits their menu. Not a discount — a recommendation.",
    diagram: "lifecycle",
  },

  "Established-Active": {
    what: "A regular customer. 4 or more orders. Ordering on schedule.",
    why: "This is our base. Safe revenue. They are already sold on us.",
    example: "Moments Cafe orders every 3-4 weeks, same mix. Predictable, healthy account.",
    action: "Keep delivery smooth. Maybe suggest the grade above or below what they already buy. No pushy sales.",
    diagram: "lifecycle",
  },

  "At-Risk": {
    what: "A regular customer who is late on their next order. Not yet gone, but slipping.",
    why: "A quiet nudge now costs nothing. If you wait, they may go find another supplier.",
    example: "Cafe Wanoka usually orders every 27 days. It has been 40 days. No reason given.",
    action: "Send one friendly email. No discount. Just 'thought of you, how's stock?' — grounded in their past orders.",
    diagram: "lifecycle",
  },

  "Dormant-VIP": {
    what: "A big customer (6+ orders over time) who has gone quiet for a long time.",
    why: "These are our most valuable relationships. Losing one is a big hit. Only Rikko should handle these — not a marketing email.",
    example: "Beck's Broth ordered 40 times ceremonial matcha. Then stopped 95 days ago. No reason on file.",
    action: "Rikko calls personally. Reference what they used to order. Ask what changed. No pitch — just real talk.",
    diagram: "lifecycle",
  },

  "Likely-Lost": {
    what: "A customer who has been silent for more than 4× their usual order gap AND over 270 days.",
    why: "The odds of bringing them back are low. Spending a rep's week here has poor return.",
    example: "A cafe that used to order every 30 days hasn't ordered in 300 days and no one has talked to them in 90 days.",
    action: "Send one honest last-chance email. If no reply, close the file. Don't dwell.",
    diagram: "lifecycle",
  },

  // ---------------- Cadence Status — are they on time? ----------------
  "Cadence Status": {
    what: "Is this customer ordering on their usual schedule, or are they late?",
    why: "Every customer has their own rhythm. Some order every 2 weeks, some every 2 months. We compare each one to their OWN schedule.",
    example: "If Cafe A usually orders every 30 days and it has been 32 days, that is Warm. If it has been 75 days, that is Dormant.",
    action: "Use this to decide who needs a nudge. Warm = leave alone. At Risk = gentle nudge. Dormant = active outreach.",
  },

  "Warm": {
    what: "On time or close to it. They are ordering when we expect them to.",
    why: "Healthy. No outreach needed from a cadence point of view.",
    example: "Customer orders every 30 days. Their last order was 25 days ago. Still warm.",
    action: "Leave them alone unless there is a cross-sell opportunity (see Graduating-Trial or Established-Active).",
    diagram: "cadence",
  },

  "At Risk": {
    what: "Past their usual order window by a little — about 1.5× their normal gap.",
    why: "First sign of trouble. Cheap to fix now. Expensive if ignored.",
    example: "Usually orders every 30 days. It has been 45 days. Nothing broken yet, but the pattern broke.",
    action: "Send a light email. Reference what they order. No discount, no pressure.",
    diagram: "cadence",
  },

  "Dormant": {
    what: "Way past their usual window — 2.5× their normal gap or more.",
    why: "They are actively going cold. Without effort they will be lost in a few more weeks.",
    example: "Usually orders every 30 days. It has been 80 days. Definitely a problem.",
    action: "Direct outreach. If they are a VIP (6+ orders), Rikko calls personally. If not, a rep sends a personal email.",
    diagram: "cadence",
  },

  "Likely Lost": {
    what: "Silent for 4× their usual gap AND more than 270 days AND no one has talked to them in 90 days.",
    why: "Reactivation almost never works this late. Time is better spent on warmer accounts.",
    example: "Usually ordered every 30 days. Silent 300 days. Last rep activity: 6 months ago.",
    action: "One honest 'is there anything we can do, or should we close the file?' email. Then move on.",
    diagram: "cadence",
  },

  // ---------------- Basket Trend — is their average order going up or down? ----------------
  "Basket Trend": {
    what: "Is each order getting bigger, staying the same, or getting smaller?",
    why: "This is the hidden signal of churn. Someone can order on time but slowly shrink their basket — they are testing a competitor on some items.",
    example: "A cafe used to order $800/month. Their last 3 orders were $450 average. They are still on time, but something changed.",
    action: "When Eroding: ask what changed. Maybe they are trying another supplier for one product. Act before the whole order leaves.",
  },

  "Growing": {
    what: "Their recent orders are bigger than before. Average up by more than 25%.",
    why: "Great signal. They are buying more from us. Good candidate for a next-tier product.",
    example: "Used to order $600 average. Last 3 orders were $900 average. Basket is growing.",
    action: "Offer a complementary product or a bigger bag size. They are ready.",
    diagram: "basket",
  },

  "Stable": {
    what: "Their order size is about the same as usual. Within 25% of their normal.",
    why: "Healthy pattern. No change needed.",
    example: "Orders are always $600-700. They just ordered $650. Normal.",
    action: "No action needed on basket. Focus on cadence instead.",
    diagram: "basket",
  },

  "Eroding": {
    what: "Their recent orders are smaller than before. Average down by more than 25%.",
    why: "Strong warning sign. More predictive than silence. They are quietly leaving.",
    example: "Used to order $1,000 average. Last 3 orders were $600 average. Still on time — but shrinking.",
    action: "Call or email. Ask directly: did our product change? Are you using another supplier for something? Solve it.",
    diagram: "basket",
  },

  // ---------------- Computed concepts ----------------
  // ---------------- Sparkline metrics on /pulse ----------------
  "Weekly revenue": {
    what: "Total money from Shopify orders each week, in Canadian dollars.",
    why: "This is the cleanest view of how the business is trending. Voided and refunded orders are not counted.",
    example: "If this week shows $96,879 and the arrow is green, revenue is up from the past four weeks.",
    action: "Compare to the 4-week trend. If it's trending down, check the Basket Eroding and At-Risk buckets to see who's buying less.",
  },
  "Weekly orders": {
    what: "How many orders we got each week, no matter the size.",
    why: "Tells you if we are shipping more or fewer packages. Useful alongside AOV to see if the business is growing through bigger orders or more orders.",
    example: "96 orders this week, up 32% from the last 4-week average.",
    action: "If orders go up but revenue stays flat, AOV is shrinking — check Basket Eroding.",
  },
  "Weekly AOV": {
    what: "Average Order Value — total revenue divided by number of orders.",
    why: "Tells you how much a typical customer is spending per order. If AOV drops while orders are steady, customers are buying smaller baskets.",
    example: "AOV of $1,009 means each wholesale order averages about a thousand dollars.",
    action: "Falling AOV is a hidden-churn signal. Cross-check with the Basket Eroding card.",
  },
  "New leads per week": {
    what: "How many new deals were added to the Application Form pipeline in Pipedrive each week.",
    why: "This is the top of the sales funnel. Fewer new leads this month means less revenue 2-3 months from now.",
    example: "22 new leads this week, down 25% from the 4-week trend.",
    action: "If leads are dropping, review marketing — website form, referrals, outbound activity.",
  },

  "Personal Cadence": {
    what: "The normal number of days between this customer's orders.",
    why: "Every customer has their own rhythm. We measure each one against their own pattern, not a one-size-fits-all rule.",
    example: "Cafe A orders every 30 days. Cafe B orders every 14 days. Both are healthy — on their own schedule.",
    action: "Use this number to judge lateness. Days-since ÷ cadence = how late they are.",
  },
};

// Short version for list views / badges when the long explainer is too much
export function shortDescription(term: string): string | undefined {
  return GLOSSARY[term]?.what;
}
