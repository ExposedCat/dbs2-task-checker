// Loaded by Node before mongosh parses its CLI. Keep query text and transient
// credentials off the host OS command line, while retaining mongosh's evaluator.
const input = JSON.parse(require('fs').readFileSync(0, 'utf8'));
if (input.uri) process.argv.push('--eval', `globalThis.db = connect(${JSON.stringify(input.uri)})`);
process.argv.push('--eval', input.code);
