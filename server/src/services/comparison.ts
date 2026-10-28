/** Decode the JSON reply stream (Redis emits one JSON value per command).
 * Never evaluate shell output: MongoDB must return canonical Extended JSON.
 */
export function parseReplies(output: string): unknown[] {
  const replies: unknown[] = [];
  let start = 0;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  const input = output.trim();
  for (let index = 0; index <= input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else {
      if ((char === undefined || /\s/.test(char)) && depth === 0) {
        if (index > start) replies.push(JSON.parse(input.slice(start, index)));
        start = index + 1;
      } else if (char === '"') quoted = true;
      else if (char === '[' || char === '{') depth++;
      else if (char === ']' || char === '}') depth--;
    }
  }
  if (quoted || depth !== 0 || !replies.length) throw new Error('Execution did not return valid JSON');
  return replies;
}

export type ComparisonReply = { value: unknown; rowPaths: string[] };

export function canonical(value: unknown, rowPaths: string[] = [], orderMatters = true, path = ''): string {
  if (Array.isArray(value)) {
    const items = value.map((item, index) => canonical(item, rowPaths, orderMatters, `${path}/${index}`));
    if (!orderMatters && rowPaths.includes(path)) items.sort();
    return `[${items.join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item, rowPaths, orderMatters, `${path}/${key}`)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function compareResponses(
  expected: string,
  actual: string,
  orderMatters = false,
  expectedComparison?: string,
  actualComparison?: string,
): boolean {
  const normalize = (output: string, comparison?: string): string[] => {
    const replies: ComparisonReply[] =
      comparison === undefined
        ? parseReplies(output).map(value => ({ value, rowPaths: Array.isArray(value) ? [''] : [] }))
        : JSON.parse(comparison);
    return replies.map(({ value, rowPaths }) => canonical(value, rowPaths, orderMatters));
  };
  const reference = normalize(expected, expectedComparison);
  let submission: string[];
  try {
    submission = normalize(actual, actualComparison);
  } catch {
    return false;
  }
  return reference.length === submission.length && reference.every((value, index) => value === submission[index]);
}
