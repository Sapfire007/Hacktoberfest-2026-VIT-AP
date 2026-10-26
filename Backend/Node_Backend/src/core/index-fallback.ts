/**
 * Queries that keep working before their Firestore indexes are deployed.
 *
 * A query that filters on one field and orders by another needs a composite index, listed
 * in firestore.indexes.json and deployed with `firebase deploy --only firestore:indexes`.
 * Until that has been done, Firestore refuses the query with FAILED_PRECONDITION - and the
 * screen behind it (who is on campus, overstays, gate search) shows an error at the gate.
 *
 * `withIndexFallback` runs the ordered query, and when the index is missing runs an
 * index-free version instead: the same equality filter without the ordering, sorted in
 * memory. That is fine for the sizes involved (people inside right now; one officer's
 * entries; one plate's visits), and the ordered query takes over by itself as soon as the
 * index exists. Each missing index is logged once, so the fix is not forgotten.
 */

const warned = new Set<string>();

/** Firestore's "this query needs an index" error. gRPC status 9 is FAILED_PRECONDITION. */
export function isMissingIndexError(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null;
  return Boolean(
    e && (e.code === 9 || e.code === 'failed-precondition' || String(e.message ?? '').includes('requires an index'))
  );
}

export async function withIndexFallback<T>(
  label: string,
  ordered: () => Promise<T>,
  fallback: () => Promise<T>
): Promise<T> {
  try {
    return await ordered();
  } catch (error) {
    if (!isMissingIndexError(error)) throw error;
    if (!warned.has(label)) {
      warned.add(label);
      console.warn(
        `⚠️  Firestore index for "${label}" is not deployed; using a slower fallback. ` +
          'Deploy them from Backend/Node_Backend: npx firebase-tools deploy --only firestore:indexes'
      );
    }
    return fallback();
  }
}

/** Newest first, by a Timestamp/Date field. Documents without the field go last. */
export function byNewest<T>(field: (item: T) => unknown) {
  const millis = (value: unknown): number => {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    const v = value as { toMillis?: () => number; toDate?: () => Date };
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v.toDate === 'function') return v.toDate().getTime();
    return 0;
  };
  return (a: T, b: T) => millis(field(b)) - millis(field(a));
}
