export type BranchLike = {
  id?: number;
  name?: string | null;
  deletedAt?: Date | string | null;
  isSystem?: boolean | null;
};

export function normalizeBranchName(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function isSystemCentralBranchName(name: string | null | undefined) {
  const normalized = normalizeBranchName(name);
  return normalized === "casa central" || normalized === "sucursal central";
}

export function isSystemManagedBranch(branch: BranchLike) {
  if (!branch || branch.deletedAt) return false;
  return branch.isSystem === true || isSystemCentralBranchName(branch.name);
}

export function countUserManagedBranches(branches: BranchLike[]) {
  return branches.filter((branch) => !branch.deletedAt && !isSystemManagedBranch(branch)).length;
}

export function findBranchNameConflict(branches: BranchLike[], name: string) {
  const normalizedTarget = normalizeBranchName(name);
  if (!normalizedTarget) return null;
  return branches.find((branch) => !branch.deletedAt && normalizeBranchName(branch.name) === normalizedTarget) || null;
}
