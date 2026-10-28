const tails = new Map<string, Promise<unknown>>();
const noop = () => {};

/** Serialises async tasks sharing a key within this process. */
export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  const run = prev.catch(noop).then(fn);
  const tail = run.then(noop, noop);
  tails.set(key, tail);
  return run.finally(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
}
