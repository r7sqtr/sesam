interface Waiter {
  resolve: () => void;
  reject: (error: Error) => void;
}

const waiters = new Map<number, Waiter>();

export function resolveTask(taskId: number, result: { ok: boolean; message?: string }) {
  const waiter = waiters.get(taskId);
  if (!waiter) return;
  waiters.delete(taskId);
  if (result.ok) {
    waiter.resolve();
  } else {
    waiter.reject(new Error(result.message ?? "処理に失敗しました"));
  }
}

export function awaitTask(taskId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    waiters.set(taskId, { resolve, reject });
  });
}
