export type BusinessLine = "residential" | "gmax_ci" | "consultancy";

export const CONSULTANCY_ARTICLE_NUMBERS = new Set(["105", "41"]);
export const GMAX_CI_THRESHOLD = 300_000;

// Default classification rule (confirmed with finance): any invoice carrying article
// 105 or 41 is Consultancy; otherwise size alone splits Residential vs C&I/G-Max, since
// the same customer can place both small residential and large C&I orders. Always
// overridable per invoice — override wins outright.
export function resolveBusinessLine(
  invoice: { total: number; has_consultancy_article: boolean },
  override?: BusinessLine | null,
): BusinessLine {
  if (override) return override;
  if (invoice.has_consultancy_article) return "consultancy";
  return invoice.total >= GMAX_CI_THRESHOLD ? "gmax_ci" : "residential";
}
