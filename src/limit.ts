export function limit<A extends unknown[], R>(
  limit: number,
  fn: (...args: A) => R,
): (...args: A) => Promise<Awaited<R>> {
  const active = new Set<Promise<void>>();

  return Object.defineProperties(
    async function (this: unknown, ...args: A): Promise<Awaited<R>> {
      while (active.size >= limit) await Promise.race(active);
      const r = Promise.resolve().then(() => fn.apply(this, args));
      const c = r.then(() => {}).catch(() => {});
      active.add(c);
      void c.finally(() => active.delete(c));
      return await r;
    },
    { length: { value: fn.length }, name: { value: fn.name } },
  );
}
