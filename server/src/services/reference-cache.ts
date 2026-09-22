import { createHash } from 'node:crypto';
import type { Collection } from 'mongodb';

export type ReferenceResult = { response: string; testResponse: string | null };
export type ReferenceCacheEntry = ReferenceResult & { _id: string; createdAt: Date; expiresAt: Date };
export type ReferenceIdentity = {
  datasetId: string;
  datasetHash: string;
  solution: string[];
  test: string | null;
  executorVersion: string;
  // Current execution uses personal databases. Remove this scope only after moving to
  // the shared, isolated grading environment; references can include database names.
  scope: string;
};

export function referenceKey(identity: ReferenceIdentity) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        'reference-cache-v1',
        identity.datasetId,
        identity.datasetHash,
        identity.solution,
        identity.test,
        identity.executorVersion,
        identity.scope,
      ]),
    )
    .digest('hex');
}

export async function getOrComputeReference(
  collection: Collection<ReferenceCacheEntry>,
  identity: ReferenceIdentity,
  compute: () => Promise<ReferenceResult>,
): Promise<ReferenceResult> {
  const _id = referenceKey(identity);
  const cached = await collection.findOne({ _id, expiresAt: { $gt: new Date() } });
  if (cached) return { response: cached.response, testResponse: cached.testResponse };

  // Only successful trusted reference executions may populate this collection.
  // Caller holds the grading queue slot throughout lookup, computation, and submission.
  const result = await compute();
  const createdAt = new Date();
  await collection.updateOne(
    { _id },
    {
      $set: {
        ...result,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + 30 * 24 * 60 * 60_000),
      },
    },
    { upsert: true },
  );
  return result;
}
