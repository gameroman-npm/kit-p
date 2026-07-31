export interface Queue {
  add<T>(fn: () => Promise<T> | T): Promise<T>;
  clear(): void;
  readonly size: number;
  readonly pending: number;
  onIdle(): Promise<void>;
}

export function queue(options: { concurrency?: number } = {}): Queue {
  const concurrency = options.concurrency ?? Infinity;
  let q: { task(): Promise<void>; reject(reason: Error): void }[] = [];
  let active = 0;
  let idle: Array<() => void> = [];

  function checkIdle(): void {
    if (active === 0 && q.length === 0) {
      const resolvers = idle;
      idle = [];
      for (const resolve of resolvers) {
        resolve();
      }
    }
  }

  function next(): void {
    if (active >= concurrency || q.length === 0) return;

    const task = q.shift()!.task;
    active++;

    void task().finally(() => {
      active--;
      next();
      checkIdle();
    });
  }

  return {
    add<T>(fn: () => Promise<T> | T): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        q.push({
          reject,
          async task() {
            try {
              resolve(await fn());
            } catch (e) {
              reject(e);
            }
          },
        });
        next();
      });
    },

    clear() {
      const clearedTasks = q;
      q = [];

      for (const { reject } of clearedTasks) {
        reject(new Error("Queue cleared"));
      }

      checkIdle();
    },

    get size() {
      return q.length;
    },

    get pending() {
      return active;
    },

    onIdle() {
      if (active === 0 && q.length === 0) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        idle.push(resolve);
      });
    },
  };
}
