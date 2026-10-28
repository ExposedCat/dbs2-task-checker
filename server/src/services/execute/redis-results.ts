import type { ComparisonReply } from '../comparison';

function pairs(values: unknown): unknown[][] {
  if (!Array.isArray(values) || values.length % 2) throw new Error('Invalid Redis pair reply');
  return Array.from({ length: values.length / 2 }, (_, index) => [values[index * 2], values[index * 2 + 1]]);
}
function fields(values: unknown): Record<string, unknown> {
  return Object.fromEntries(pairs(values).map(([key, value]) => [String(key), value]));
}

/** Preserve Redis tuples and field/value associations before comparing row collections. */
export function redisComparisonReply(command: string[], result: unknown): ComparisonReply {
  const name = command[0].toUpperCase();
  const options = command.slice(1).map(value => value.toUpperCase());
  if (name === 'JSON.GET') {
    return { value: typeof result === 'string' ? JSON.parse(result) : result, rowPaths: [] };
  }
  if (name === 'JSON.MGET' && Array.isArray(result)) {
    return { value: result.map(item => (typeof item === 'string' ? JSON.parse(item) : item)), rowPaths: [] };
  }
  if (name === 'HGETALL') return { value: fields(result), rowPaths: [] };
  if (name === 'HSCAN' && Array.isArray(result)) {
    return {
      value: {
        cursor: result[0],
        entries: command.slice(3).some(arg => arg.toUpperCase() === 'NOVALUES') ? result[1] : pairs(result[1]),
      },
      rowPaths: ['/entries'],
    };
  }
  if (['SCAN', 'SSCAN', 'ZSCAN'].includes(name) && Array.isArray(result)) {
    return {
      value: { cursor: result[0], entries: name === 'ZSCAN' ? pairs(result[1]) : result[1] },
      rowPaths: ['/entries'],
    };
  }
  if (
    /^(Z(RANGE|REVRANGE|RANGEBYSCORE|REVRANGEBYSCORE|RANGEBYLEX|REVRANGEBYLEX|RANDMEMBER|DIFF|INTER|UNION))$/.test(name)
  ) {
    const optionStart = ['ZDIFF', 'ZINTER', 'ZUNION'].includes(name)
      ? 2 + Number(command[1])
      : name === 'ZRANDMEMBER'
        ? 3
        : 4;
    const withScores = command.slice(optionStart).some(arg => arg.toUpperCase() === 'WITHSCORES');
    return { value: withScores ? pairs(result) : result, rowPaths: [''] };
  }
  if (name === 'HRANDFIELD' && command.slice(3).some(arg => arg.toUpperCase() === 'WITHVALUES'))
    return { value: pairs(result), rowPaths: [''] };
  if (name === 'FT.SEARCH' && Array.isArray(result)) {
    // Read flags only in option positions, skipping counted and fixed-width arguments.
    const flags = new Set<string>();
    const widths: Record<string, number> = {
      LIMIT: 2,
      SORTBY: 1,
      FILTER: 3,
      GEOFILTER: 5,
      LANGUAGE: 1,
      EXPANDER: 1,
      SCORER: 1,
      PAYLOAD: 1,
      DIALECT: 1,
      TIMEOUT: 1,
      SLOP: 1,
    };
    for (let i = 3; i < command.length; i++) {
      const option = command[i].toUpperCase();
      flags.add(option);
      if (option === 'RETURN' && command[i + 1] === '0') flags.add('NOCONTENT');
      if (['RETURN', 'PARAMS', 'INKEYS', 'INFIELDS'].includes(option)) i += 1 + Number(command[i + 1]);
      else i += widths[option] ?? 0;
    }
    const rows: Record<string, unknown>[] = [];
    for (let i = 1; i < result.length; ) {
      const row: Record<string, unknown> = { id: result[i++] };
      if (flags.has('WITHSCORES')) row.score = result[i++];
      if (flags.has('WITHPAYLOADS')) row.payload = result[i++];
      if (flags.has('WITHSORTKEYS')) row.sortKey = result[i++];
      if (!flags.has('NOCONTENT')) row.fields = fields(result[i++]);
      rows.push(row);
    }
    return { value: { total: result[0], rows }, rowPaths: ['/rows'] };
  }
  if (name === 'FT.AGGREGATE' && Array.isArray(result) && !options.includes('WITHCURSOR')) {
    return { value: { total: result[0], rows: result.slice(1).map(fields) }, rowPaths: ['/rows'] };
  }
  const rowCommands = [
    'KEYS',
    'SMEMBERS',
    'SDIFF',
    'SINTER',
    'SUNION',
    'SRANDMEMBER',
    'LRANGE',
    'HKEYS',
    'HVALS',
    'FT._LIST',
  ];
  return { value: result, rowPaths: rowCommands.includes(name) && Array.isArray(result) ? [''] : [] };
}
