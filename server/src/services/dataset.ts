import type { DatasetName } from './execute';
import { withSubmissionSlot } from './execute/limits';
import { validateTask, validateReference } from './task-validation';
import { requiredPoints, validateTestPolicy } from './test-policy';
import type { Database } from './database.js';
import { parseCommand } from './escape.js';
import type { ServiceResponse } from './response.js';

export type Dataset = {
  id: string;
  name: string;
  kinds: Record<string, number>;
  minPoints?: number;
  bank: {
    kind: string;
    question: string;
    solution: string[];
    test: string | null;
    orderMatters?: boolean;
  }[];
};

export type GetDatasetArgs<F extends 'txt' | 'json'> = {
  datasetId: string;
  format: F;
};

export type GetDatasetResponse<F extends 'txt' | 'json'> = F extends 'txt'
  ? string
  :
      | { ok: true; data: string[][]; error: null }
      | {
          ok: false;
          data: null;
          error: string;
        };

export async function readDataset<F extends 'txt' | 'json'>(args: GetDatasetArgs<F>): Promise<GetDatasetResponse<F>> {
  const { datasetId, format } = args;

  const trimmed = datasetId.split('/')[0];

  try {
    const raw = await Bun.file(`${process.cwd()}/datasets/${trimmed}/dataset.txt`).text();

    if (format === 'txt') {
      return raw as GetDatasetResponse<F>;
    }

    return {
      ok: true,
      data: raw
        .split('\n')
        .filter(Boolean)
        .map(command => parseCommand(command)),
      error: null,
    } as GetDatasetResponse<F>;
  } catch (error) {
    console.error(error);
    return {
      ok: false,
      data: null,
      error: 'Dataset not found',
    } as GetDatasetResponse<F>;
  }
}

export type GetDatasetsArgs = {
  database: Database;
};

export async function getDatasets({ database }: GetDatasetsArgs) {
  return {
    ok: true,
    error: null,
    data: (
      await database.datasets
        .find(
          {},
          {
            projection: { _id: false, id: true, name: true, kinds: true, minPoints: true },
          },
        )
        .toArray()
    )
      .filter(dataset => dataset.kinds)
      .map(dataset => ({
        id: dataset.id,
        name: dataset.name,
        minPoints: requiredPoints(dataset),
      })),
  };
}

export type RawDatasetEntry = {
  Question: string;
  Solution: string[];
  Test?: string | null;
  OrderMatters?: boolean;
};

export type CreateOrUpdateDatasetArgs = {
  id: string;
  name: string;
  kind: string;
  database: Database;
  data: unknown;
  minPoints?: number;
};

export async function createOrUpdateDataset({
  id,
  name,
  kind,
  data,
  database,
  minPoints,
}: CreateOrUpdateDatasetArgs): Promise<ServiceResponse<null>> {
  const invalid = (error: string): ServiceResponse<null> => ({ ok: false, data: null, error });
  if (!['redis', 'RedisBasic', 'RedisAdvanced', 'mongodb'].includes(id)) return invalid('Unsupported dataset ID');
  if (!name.trim() || !kind.trim() || /[.$]/.test(kind)) return invalid('Name and a valid category are required');
  if (!Array.isArray(data) || data.length === 0) return invalid('Question bank must be a nonempty array');
  const bank: Dataset['bank'] = [];
  for (const [index, item] of data.entries()) {
    if (!item || typeof item !== 'object') return invalid(`Question ${index + 1}: invalid entry`);
    const task = {
      kind,
      question: item.Question,
      solution: item.Solution,
      test:
        item.Test === undefined || item.Test === null || (typeof item.Test === 'string' && !item.Test.trim())
          ? null
          : item.Test,
      orderMatters: item.OrderMatters,
    };
    const error = validateTask(task);
    if (error) return invalid(`Question ${index + 1}: ${error}`);
    bank.push(task);
  }
  const existing = await database.datasets.findOne({ id });
  const candidate = {
    bank: [...(existing?.bank ?? []), ...bank],
    kinds: { ...(existing?.kinds ?? {}), [kind]: existing?.kinds[kind] ?? 1 },
    minPoints: minPoints ?? existing?.minPoints,
  };
  const policyError = validateTestPolicy(candidate);
  if (policyError) return invalid(policyError);
  try {
    await withSubmissionSlot(async () => {
      for (const [index, task] of bank.entries()) {
        try {
          await validateReference(id as DatasetName, task);
        } catch (error) {
          throw new Error(`Question ${index + 1}: ${error instanceof Error ? error.message : 'Reference failed'}`);
        }
      }
    });
  } catch (error) {
    return invalid(error instanceof Error ? error.message : 'Reference validation failed');
  }

  await database.datasets.findOneAndUpdate(
    { id },
    {
      $addToSet: {
        bank: { $each: bank },
      },
      $set: {
        name,
        kinds: candidate.kinds,
        ...(candidate.minPoints === undefined ? {} : { minPoints: candidate.minPoints }),
      },
      $setOnInsert: { id },
    },
    { upsert: true },
  );

  return { ok: true, data: null, error: null };
}

export type SetDatasetKindsArgs = {
  datasetId: string;
  kinds: Record<string, number>;
  minPoints?: number;
  database: Database;
};

export async function setDatasetKinds({
  datasetId,
  kinds,
  database,
  minPoints,
}: SetDatasetKindsArgs): Promise<ServiceResponse<null>> {
  const dataset = await database.datasets.findOne({ id: datasetId });
  if (!dataset) return { ok: false, data: null, error: 'Dataset not found' };
  const next = { ...dataset, kinds: { ...dataset.kinds, ...kinds }, minPoints: minPoints ?? dataset.minPoints };
  const error = validateTestPolicy(next);
  if (error) return { ok: false, data: null, error };
  await database.datasets.updateOne(
    { id: datasetId },
    {
      $set: { kinds: next.kinds, ...(next.minPoints === undefined ? {} : { minPoints: next.minPoints }) },
    },
  );
  return { ok: true, data: null, error: null };
}

export type ExtractDatasetKindsArgs = {
  datasetId: string;
  database: Database;
};

export async function extractDatasetKinds({ datasetId, database }: ExtractDatasetKindsArgs) {
  const kinds = await database.datasets
    .aggregate([
      { $match: { id: datasetId } },
      { $unwind: { path: '$bank' } },
      {
        $project: {
          _id: 0,
          kind: '$bank.kind',
          kinds: 1,
        },
      },
      {
        $group: {
          _id: '$kind',
          total: { $count: {} },
          kinds: { $first: '$kinds' },
        },
      },
      {
        $addFields: {
          current: {
            $let: {
              vars: {
                kinds: {
                  $objectToArray: '$$ROOT.kinds',
                },
              },
              in: {
                $arrayElemAt: [
                  {
                    $map: {
                      input: {
                        $filter: {
                          input: '$$kinds',
                          as: 'item',
                          cond: {
                            $eq: ['$$item.k', '$_id'],
                          },
                        },
                      },
                      as: 'item',
                      in: '$$item.v',
                    },
                  },
                  0,
                ],
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          kind: '$_id',
          total: 1,
          current: 1,
        },
      },
    ])
    .toArray();

  return { ok: true, error: null, data: kinds };
}

export type DeleteDatasetKindArgs = {
  id: string;
  database: Database;
  kind: string;
};

export async function deleteDatasetKind({ id, database, kind }: DeleteDatasetKindArgs) {
  const dataset = await database.datasets.findOne({ id });
  if (!dataset) return { ok: false, data: null, error: 'Dataset not found' };
  const kinds = Object.fromEntries(Object.entries(dataset.kinds).filter(([key]) => key !== kind));
  const bank = dataset.bank.filter(task => task.kind !== kind);
  const error = validateTestPolicy({ ...dataset, kinds, bank });
  if (error) return { ok: false, data: null, error };
  await database.datasets.updateOne({ id }, { $set: { kinds, bank } });
  return { ok: true, error: null, data: null };
}
