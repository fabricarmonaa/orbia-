import { apiRequest } from "@/lib/auth";

export interface MonthlySummaryTotals {
  income: number;
  expenses: number;
  fixedImpact: number;
  net: number;
}

export interface MonthlySummaryResponse {
  id: number;
  tenantId: number;
  year: number;
  month: number;
  totalsJson: MonthlySummaryTotals;
  createdAt: string;
}

export async function generateMonthlySummary(payload: { year: number; month: number; force?: boolean }) {
  const res = await apiRequest("POST", "/api/reports/monthly-summary", payload);
  const data = await res.json();
  return data.data as MonthlySummaryResponse;
}
