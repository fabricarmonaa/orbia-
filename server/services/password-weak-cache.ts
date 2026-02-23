const weakByUser = new Map<number, boolean>();

export function setPasswordWeakFlag(userId: number, isWeak: boolean) {
  weakByUser.set(userId, isWeak);
}

export function getPasswordWeakFlag(userId: number) {
  return weakByUser.get(userId) ?? false;
}
