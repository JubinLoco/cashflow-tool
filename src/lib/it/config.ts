// IT-solution revenue is grouped into revenue streams. A stream is a column in the IT
// solutions table and a series in its chart; key = stable id, label = what's shown.
//
// To add a stream later (local flexibility, mFRR, ...): add an entry here, then either map
// the Fortnox article number(s) that bill it in IT_ARTICLE_STREAM below, or write rows for
// it into it_recurring_revenue / a new source in monthlyItSolutions.ts. The tab picks up
// the new column and chart series automatically; colours are assigned per stream in
// ItChart.tsx, in this order.
export const IT_REVENUE_STREAMS = [
  { key: "startup", label: "Start-up revenue" },
  { key: "solar_simulation", label: "Solar simulation revenue" },
] as const;

export type ItStreamKey = (typeof IT_REVENUE_STREAMS)[number]["key"];

// Roles behind the IT cost, with a ROUGH monthly cost per person (SEK). Rates are only used
// as weights to split each invoice's actual total across the people on it (headcount x
// rate), so the roles always add up exactly to the invoice -- the rates just say how big a
// share each role gets. Edit freely; nothing else depends on the absolute numbers.
export const IT_ROLES = [
  { key: "head_developer", label: "Head developer", monthlyRate: 55000 },
  { key: "developer", label: "Additional developers", monthlyRate: 10000 },
  { key: "design", label: "Design", monthlyRate: 500 },
  { key: "product", label: "Product", monthlyRate: 10000 },
  { key: "tester", label: "Tester", monthlyRate: 5000 },
  { key: "marketing", label: "Marketing", monthlyRate: 10000 },
] as const;

export type ItRoleKey = (typeof IT_ROLES)[number]["key"];
export type ItTeam = Partial<Record<ItRoleKey, number>>;

// Fortnox article number -> revenue stream (net, ex-VAT invoice lines).
export const IT_ARTICLE_STREAM: Record<string, ItStreamKey> = {
  "41": "startup", // WattWealth documentation and battery steering support
  "105": "solar_simulation", // Service Simulation and Stringing
};

// Fixed monthly fees in it_recurring_revenue (currently only Swedala Tak) are solar-simulation.
export const IT_RECURRING_STREAM: ItStreamKey = "solar_simulation";

// Article numbers pulled from Fortnox at sync time.
export const IT_ARTICLE_NUMBERS = Object.keys(IT_ARTICLE_STREAM);

// Earliest month with IT cost (first WattWealth invoice covers September 2024).
export const IT_REVENUE_FROM_DATE = "2024-09-01";
