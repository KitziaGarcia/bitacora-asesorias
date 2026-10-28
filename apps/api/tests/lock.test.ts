import { it, expect } from 'vitest';
import { withLock } from '../src/lock';

it('runs same-key tasks one at a time, in order', async () => {
  const log: string[] = [];
  const task = (n: string, ms: number) => withLock('k', async () => {
    log.push(`start ${n}`); await new Promise(r => setTimeout(r, ms)); log.push(`end ${n}`);
  });
  await Promise.all([task('a', 20), task('b', 1)]);
  expect(log).toEqual(['start a', 'end a', 'start b', 'end b']);
});
it('keeps going after a task throws', async () => {
  await expect(withLock('k2', async () => { throw new Error('x'); })).rejects.toThrow('x');
  await expect(withLock('k2', async () => 5)).resolves.toBe(5);
});
