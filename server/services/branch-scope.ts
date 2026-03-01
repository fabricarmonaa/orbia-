type AuthContext = {
  scope?: string;
  branchId?: number | null;
};

export function requireBranchScopeForOperation(
  auth: AuthContext,
  operation: string,
): { ok: true; branchId: number } | { ok: false; status: number; body: { error: string; code: string } } {
  if (auth.scope !== "BRANCH" || !auth.branchId) {
    return {
      ok: false,
      status: 400,
      body: {
        error: `${operation} requiere contexto de sucursal`,
        code: "BRANCH_SCOPE_REQUIRED",
      },
    };
  }

  return { ok: true, branchId: auth.branchId };
}
