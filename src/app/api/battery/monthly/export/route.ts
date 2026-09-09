import ExcelJS from "exceljs";
import { computeMonthlyBatteryWeights } from "@/lib/battery/monthlyWeights";

export async function GET() {
  const monthly = await computeMonthlyBatteryWeights();

  const workbook = new ExcelJS.Workbook();

  const summarySheet = workbook.addWorksheet("Monthly totals");
  summarySheet.columns = [
    { header: "Month", key: "month", width: 12 },
    { header: "Total weight (kg)", key: "totalWeightKg", width: 20 },
  ];
  summarySheet.getRow(1).font = { bold: true };
  for (const m of monthly) {
    summarySheet.addRow({ month: m.month, totalWeightKg: Number(m.totalWeightKg.toFixed(2)) });
  }

  const detailSheet = workbook.addWorksheet("Detail by model");
  detailSheet.columns = [
    { header: "Month", key: "month", width: 12 },
    { header: "Article #", key: "articleNumber", width: 14 },
    { header: "Description", key: "articleDescription", width: 32 },
    { header: "Quantity", key: "quantity", width: 12 },
    { header: "Unit weight (kg)", key: "weightKg", width: 16 },
    { header: "Weight contribution (kg)", key: "weightContributionKg", width: 22 },
  ];
  detailSheet.getRow(1).font = { bold: true };
  for (const m of monthly) {
    for (const row of m.byModel) {
      detailSheet.addRow({
        month: m.month,
        articleNumber: row.articleNumber,
        articleDescription: row.articleDescription ?? "",
        quantity: row.quantity,
        weightKg: row.weightKg ?? "not set",
        weightContributionKg: Number(row.weightContributionKg.toFixed(2)),
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const today = new Date().toISOString().slice(0, 10);

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="battery-weights-${today}.xlsx"`,
    },
  });
}
