import { apiRequest } from "@/lib/auth";

export type ExpenseDefinitionType = "FIXED" | "VARIABLE";

export interface ExpenseDefinitionPayload {
  type: ExpenseDefinitionType;
  name: string;
  description?: string | null;
  category?: string | null;
  defaultAmount?: number | null;
  currency?: string | null;
  isActive?: boolean;
}

export async function getExpenseDefinitions(type?: ExpenseDefinitionType) {
  const query = type ? `?type=${type}` : "";
  const res = await apiRequest("GET", `/api/expenses/definitions${query}`);
  const data = await res.json();
  return data.data || [];
}

export async function createExpenseDefinition(payload: ExpenseDefinitionPayload) {
  const res = await apiRequest("POST", "/api/expenses/definitions", payload);
  const data = await res.json();
  return data.data;
}

export async function updateExpenseDefinition(id: number, payload: Partial<ExpenseDefinitionPayload>) {
  const res = await apiRequest("PUT", `/api/expenses/definitions/${id}`, payload);
  const data = await res.json();
  return data.data;
}

export async function deleteExpenseDefinition(id: number) {
  const res = await apiRequest("DELETE", `/api/expenses/definitions/${id}`);
  const data = await res.json();
  return data.ok;
}
