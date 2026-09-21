import { parseArgsStringToArgv } from 'string-argv';

export function parseCommand(command: string) {
  return parseArgsStringToArgv(command);
}
