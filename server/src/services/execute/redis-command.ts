/** Backward-compatible command forms found in existing question banks. */
export function prepareRedisCommand(input: string[], readOnly: boolean): { command: string[]; count: boolean } {
  const command = [...input];
  const name = command[0]?.toUpperCase();
  if (readOnly) {
    if (
      name === 'BITFIELD' &&
      (command.length - 2) % 3 === 0 &&
      command.slice(2).every((token, index) => index % 3 !== 0 || token.toUpperCase() === 'GET')
    )
      command[0] = 'BITFIELD_RO';
    if (name === 'SORT' && !command.slice(2).some(token => token.toUpperCase() === 'STORE')) command[0] = 'SORT_RO';
    if (
      ['GEORADIUS', 'GEORADIUSBYMEMBER'].includes(name) &&
      !command.slice(2).some(token => ['STORE', 'STOREDIST'].includes(token.toUpperCase()))
    )
      command[0] = `${name}_RO`;
    if (name === 'EVAL') command[0] = 'EVAL_RO';
  }
  // Older banks use a trailing COUNT as a cardinality request, without Redis's limit argument.
  const count = name === 'GEOSEARCH' && command.at(-1)?.toUpperCase() === 'COUNT';
  if (count) command.pop();
  return { command, count };
}
