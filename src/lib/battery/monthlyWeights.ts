import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";

type SaleLineRow = { article_number: string; quantity: number; invoice_date: string };
type ModelRow = { article_number: string; article_description: string | null; weight_kg: number | null };

export type MonthlyModelBreakdown = {
  articleNumber: string;
  articleDescription: string | null;
  quantity: number;
  weightKg: number | null;
  weightContributionKg: number;
};

export type MonthlyBatteryWeight = {
  month: string; // "YYYY-MM"
  totalWeightKg: number;
  byModel: MonthlyModelBreakdown[];
};

/**
 * Joins battery_sale_lines against battery_models.weight_kg in application code rather
 * than storing a rollup table -- one source of truth (the raw lines + the weight config),
 * no risk of a materialized total drifting out of sync with either.
 */
export async function computeMonthlyBatteryWeights(): Promise<MonthlyBatteryWeight[]> {
  const supabase = createAdminClient();

  const [saleLines, models] = await Promise.all([
    fetchAllRows<SaleLineRow>((from, to) =>
      supabase.from("battery_sale_lines").select("article_number, quantity, invoice_date").range(from, to),
    ),
    fetchAllRows<ModelRow>((from, to) =>
      supabase.from("battery_models").select("article_number, article_description, weight_kg").range(from, to),
    ),
  ]);

  const modelByArticle = new Map(models.map((m) => [m.article_number, m]));

  // month -> article_number -> aggregate
  const byMonth = new Map<string, Map<string, { quantity: number }>>();
  for (const line of saleLines) {
    const month = line.invoice_date.slice(0, 7);
    const byArticle = byMonth.get(month) ?? new Map<string, { quantity: number }>();
    const entry = byArticle.get(line.article_number) ?? { quantity: 0 };
    entry.quantity += line.quantity;
    byArticle.set(line.article_number, entry);
    byMonth.set(month, byArticle);
  }

  const result: MonthlyBatteryWeight[] = [...byMonth.entries()]
    .map(([month, byArticle]) => {
      const byModel: MonthlyModelBreakdown[] = [...byArticle.entries()]
        .map(([articleNumber, { quantity }]) => {
          const model = modelByArticle.get(articleNumber);
          const weightKg = model?.weight_kg ?? null;
          return {
            articleNumber,
            articleDescription: model?.article_description ?? null,
            quantity,
            weightKg,
            weightContributionKg: weightKg != null ? quantity * weightKg : 0,
          };
        })
        .sort((a, b) => b.weightContributionKg - a.weightContributionKg);

      const totalWeightKg = byModel.reduce((sum, m) => sum + m.weightContributionKg, 0);
      return { month, totalWeightKg, byModel };
    })
    .sort((a, b) => b.month.localeCompare(a.month));

  return result;
}
