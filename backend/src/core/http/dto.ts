import type { HydratedDocument } from 'mongoose';

type AnyDoc = HydratedDocument<object>;

const toIso = (value: unknown): string | null =>
  value instanceof Date ? value.toISOString() : typeof value === 'string' ? value : null;

/** Converts a Mongoose document into the public shape: no owner, no __v, ISO dates. */
export function toDto<T extends object>(doc: AnyDoc, omit: string[] = []): T {
  const raw = doc.toObject({ versionKey: false }) as Record<string, unknown>;
  const { _id, owner: _owner, ...rest } = raw;
  for (const key of omit) delete rest[key];
  return {
    ...rest,
    id: String(_id),
    createdAt: toIso(rest.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(rest.updatedAt) ?? new Date(0).toISOString(),
    deletedAt: toIso(rest.deletedAt),
  } as unknown as T;
}

export const ok = <T>(data: T) => ({ data });
