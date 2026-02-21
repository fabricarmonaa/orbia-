function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

async function main() {
  const appUrl = process.env.APP_URL || "http://127.0.0.1:5000";
  const token = process.env.AUTH_TOKEN || process.env.TOKEN || "";

  if (!token) {
    throw new Error("AUTH_TOKEN (or TOKEN) must be set");
  }

  const res = await fetch(`${appUrl}/api/dashboard/summary`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
  }

  const openCount = json?.orders?.openCount;
  const totalCount = json?.orders?.totalCount;
  const pendingCount = json?.orders?.pendingCount;
  const inProgressCount = json?.orders?.inProgressCount;
  const monthIncome = json?.cash?.monthIncome;
  const monthExpense = json?.cash?.monthExpense;
  const monthResult = json?.cash?.monthResult;
  const productsCount = json?.products?.count;

  const allOk = [
    openCount,
    totalCount,
    pendingCount,
    inProgressCount,
    monthIncome,
    monthExpense,
    monthResult,
    productsCount,
  ].every(isFiniteNumber);

  if (!allOk) {
    throw new Error(`Invalid shape: ${JSON.stringify(json)}`);
  }

  console.log("dashboard-summary-check OK", {
    openCount,
    totalCount,
    pendingCount,
    inProgressCount,
    monthIncome,
    monthExpense,
    monthResult,
    productsCount,
  });
}

main().catch((err) => {
  console.error("dashboard-summary-check FAIL", err?.message || err);
  process.exit(1);
});
