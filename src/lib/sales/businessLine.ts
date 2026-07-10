export type BusinessLine = "residential" | "gmax_ci" | "consultancy";

export const CONSULTANCY_ARTICLE_NUMBERS = new Set(["105", "41"]);
export const GMAX_CI_THRESHOLD = 300_000;

export type LinePortion = { businessLine: BusinessLine; total: number; netTotal: number; grossProfit: number };

function classifyBySize(total: number): BusinessLine {
  return total >= GMAX_CI_THRESHOLD ? "gmax_ci" : "residential";
}

// An invoice can mix a consultancy line item (article 105/41) with unrelated
// residential/C&I product rows on the same document — moving the whole invoice whenever
// any row matched was overstating Consultancy by the size of the other rows on it. Splits
// the invoice into its consultancy portion (summed from the matching rows at sync time)
// and the remainder, which is then classified by size like any other sale. A manual
// override forces the whole invoice into one line, same as the rest of the app's
// per-invoice overrides.
export function splitByBusinessLine(
  invoice: {
    total: number;
    net_total: number;
    gross_profit: number;
    consultancy_total: number;
    consultancy_net_total: number;
    consultancy_gross_profit: number;
  },
  override?: BusinessLine | null,
): LinePortion[] {
  if (override) {
    return [{ businessLine: override, total: invoice.total, netTotal: invoice.net_total, grossProfit: invoice.gross_profit }];
  }

  const portions: LinePortion[] = [];
  if (invoice.consultancy_total !== 0) {
    portions.push({
      businessLine: "consultancy",
      total: invoice.consultancy_total,
      netTotal: invoice.consultancy_net_total,
      grossProfit: invoice.consultancy_gross_profit,
    });
  }

  const remainderTotal = invoice.total - invoice.consultancy_total;
  if (remainderTotal !== 0) {
    portions.push({
      businessLine: classifyBySize(remainderTotal),
      total: remainderTotal,
      netTotal: invoice.net_total - invoice.consultancy_net_total,
      grossProfit: invoice.gross_profit - invoice.consultancy_gross_profit,
    });
  }

  return portions;
}
