import { canonical } from './comparison';

export type StateObservation = {
  engine: 'redis' | 'mongodb';
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  startedAt: number;
};

/** Compare net changes, so untouched seed timestamps/stream IDs do not affect grading. */
export function stateChanges(state: StateObservation): Record<string, unknown> {
  return Object.fromEntries(
    [...new Set([...Object.keys(state.before), ...Object.keys(state.after)])]
      .filter(key => canonical(state.before[key]) !== canonical(state.after[key]))
      .map(key => {
        if (!(key in state.after)) return [key, { deleted: true }];
        const value = state.after[key];
        if (state.engine !== 'redis' || !key.startsWith('key:')) return [key, value];
        const entry = value as { expiresAt: number };
        return [
          key,
          { ...entry, expiresAt: entry.expiresAt < 0 ? entry.expiresAt : entry.expiresAt - state.startedAt },
        ];
      }),
  );
}

export function sameStateChanges(
  expected: StateObservation,
  actual: StateObservation,
  fixedIds: string[] = [],
): boolean {
  if (expected.engine !== actual.engine) return false;
  if (expected.engine === 'mongodb') [expected, actual] = mongoPair(expected, actual, fixedIds);
  else [expected, actual] = redisPair(expected, actual, fixedIds);
  const left = stateChanges(expected);
  const right = stateChanges(actual);
  if (canonical(Object.keys(left).sort()) !== canonical(Object.keys(right).sort())) return false;
  return Object.keys(left).every(key => {
    if (expected.engine !== 'redis' || !key.startsWith('key:')) return canonical(left[key]) === canonical(right[key]);
    const a = left[key] as Record<string, unknown>;
    const b = right[key] as Record<string, unknown>;
    const { expiresAt: ae, ...av } = a;
    const { expiresAt: be, ...bv } = b;
    return (
      canonical(av) === canonical(bv) &&
      (ae === be ||
        (typeof ae === 'number' && typeof be === 'number' && ae >= 0 && be >= 0 && Math.abs(ae - be) <= 1000))
    );
  });
}

export function normalizeMongoSnapshot(response: string): Record<string, unknown> {
  const state = JSON.parse(response) as Record<string, { documents?: unknown[]; indexes?: unknown[] }>;
  for (const collection of Object.values(state)) {
    collection.documents?.sort((a, b) => canonical(a).localeCompare(canonical(b)));
    collection.indexes?.sort((a, b) => canonical(a).localeCompare(canonical(b)));
  }
  return state;
}

function mongoPair(
  expected: StateObservation,
  actual: StateObservation,
  fixedIds: string[],
): [StateObservation, StateObservation] {
  const id = (value: unknown): string | undefined => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const object = value as Record<string, unknown>;
    return Object.keys(object).length === 1 && typeof object.$oid === 'string' && /^[a-f0-9]{24}$/i.test(object.$oid)
      ? object.$oid
      : undefined;
  };
  const documents = (snapshot: Record<string, unknown>) =>
    Object.entries(snapshot).flatMap(([collection, value]) =>
      ((value as { documents?: Record<string, unknown>[] }).documents ?? []).map(document => ({
        collection,
        document,
      })),
    );
  const beforeIds = (state: StateObservation) =>
    new Set(
      documents(state.before)
        .map(({ document }) => id(document._id))
        .filter(Boolean),
    );
  const a = beforeIds(expected),
    b = beforeIds(actual);
  const fixed = new Set([...fixedIds.map(value => value.toLowerCase()), ...[...a].filter(value => b.has(value))]);
  const eraseIds = (value: unknown): unknown => {
    if (id(value)) return { $oid: '<generated>' };
    if (Array.isArray(value)) return value.map(eraseIds);
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, eraseIds(item)]));
    return value;
  };
  const normalize = (state: StateObservation): StateObservation => {
    const aliases = new Map<string, string>();
    for (const [phase, snapshot] of [
      ['seed', state.before],
      ['inserted', state.after],
    ] as const) {
      const counts = new Map<string, number>();
      for (const { collection, document } of documents(snapshot)) {
        const oid = id(document._id);
        if (!oid || fixed.has(oid) || aliases.has(oid)) continue;
        const identity = canonical([phase, collection, eraseIds(document)]);
        const count = counts.get(identity) ?? 0;
        counts.set(identity, count + 1);
        aliases.set(oid, `${identity}:${count}`);
      }
    }
    const replace = (value: unknown): unknown => {
      const oid = id(value);
      if (oid && aliases.has(oid)) return { $oid: aliases.get(oid) };
      if (Array.isArray(value)) return value.map(replace);
      if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)]));
      return value;
    };
    const snapshot = (value: Record<string, unknown>) => normalizeMongoSnapshot(JSON.stringify(replace(value)));
    return { ...state, before: snapshot(state.before), after: snapshot(state.after) };
  };
  return [normalize(expected), normalize(actual)];
}

function redisPair(
  expected: StateObservation,
  actual: StateObservation,
  fixedIds: string[],
): [StateObservation, StateObservation] {
  const normalize = (state: StateObservation): StateObservation => {
    const rewrite = (snapshot: Record<string, unknown>): Record<string, unknown> =>
      Object.fromEntries(
        Object.entries(snapshot).map(([key, entry]) => {
          const value = entry as { type?: string; value?: { entries: [string, unknown][] } };
          if (value.type !== 'stream' || !value.value) return [key, entry];
          const seed = state.before[key] as typeof value | undefined;
          const aliases = new Map(seed?.value?.entries.map(([id], index) => [id, `seed:${index}`]));
          return [
            key,
            {
              ...value,
              value: {
                ...value.value,
                entries: value.value.entries.map(([id, fields], index) => [
                  fixedIds.includes(id) ? id : (aliases.get(id) ?? `inserted:${index}`),
                  fields,
                ]),
              },
            },
          ];
        }),
      );
    return { ...state, before: rewrite(state.before), after: rewrite(state.after) };
  };
  return [normalize(expected), normalize(actual)];
}
