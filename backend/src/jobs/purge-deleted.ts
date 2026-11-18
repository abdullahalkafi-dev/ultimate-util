import type { FastifyBaseLogger } from 'fastify';
import { userCollections, PURGE_AFTER_DAYS } from '../modules/account/collections.js';

const HOUR_MS = 60 * 60 * 1000;

/** Permanently removes records that were soft-deleted more than 30 days ago. */
export async function purgeDeleted(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - PURGE_AFTER_DAYS * 24 * HOUR_MS);
  let removed = 0;
  for (const model of Object.values(userCollections)) {
    const res = await (model as unknown as { deleteMany(f: object): Promise<{ deletedCount: number }> }).deleteMany({
      deletedAt: { $ne: null, $lt: cutoff },
    });
    removed += res.deletedCount;
  }
  return removed;
}

export function startJobs(log: FastifyBaseLogger): () => void {
  const timer = setInterval(() => {
    purgeDeleted()
      .then((n) => n > 0 && log.info({ removed: n }, 'Purged deleted records'))
      .catch((err) => log.error({ err }, 'Purge job failed'));
  }, HOUR_MS);
  timer.unref();
  return () => clearInterval(timer);
}
