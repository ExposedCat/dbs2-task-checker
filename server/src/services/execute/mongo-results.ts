import { parse } from 'acorn';

/** Materialize only the final expression, preserving mongosh's own async evaluator.
 * Parse JavaScript rather than guessing where a query ends with string/regex edits.
 */
export function prepareMongoResult(queries: string[]): string {
  const code = queries.join(';\n');
  const program = parse(code, { ecmaVersion: 'latest', allowAwaitOutsideFunction: true });
  const last = program.body.filter(statement => statement.type !== 'EmptyStatement').at(-1);
  if (last?.type !== 'ExpressionStatement') return code;
  const expression = last.expression;
  return `${code.slice(0, expression.start)}(async function (value) {
    const result = await value;
    return result && typeof result.toArray === 'function' ? await result.toArray() : result;
  })(${code.slice(expression.start, expression.end)})${code.slice(expression.end)}`;
}
