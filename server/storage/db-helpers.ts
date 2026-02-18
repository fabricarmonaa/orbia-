export async function safeDbOperation<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[db] ${operation} failed`, { message });
    throw err;
  }
}
