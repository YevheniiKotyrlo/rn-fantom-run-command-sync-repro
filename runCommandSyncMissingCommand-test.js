/**
 * Copied into private/react-native-fantom/runner/__tests__/ by repro.cjs,
 * which removes it after the run.
 *
 * @format
 */

import {getDebugInfoFromCommandResult, runCommandSync} from '../utils';
import fs from 'fs';

function call(command, args) {
  try {
    const result = runCommandSync(command, args, {});
    return {
      returned: true,
      status: result.status,
      error: result.error == null ? null : String(result.error),
      errorCode: result.error?.code ?? null,
      stdoutType: typeof result.stdout,
      stdout: result.stdout,
      debugInfo: getDebugInfoFromCommandResult(result),
    };
  } catch (error) {
    return {
      returned: false,
      thrown: `${error.name}: ${error.message}`,
      thrownAt:
        String(error.stack)
          .split('\n')
          .find(line => line.includes('utils.js'))
          ?.trim() ?? null,
    };
  }
}

const results = {
  missing: call('fantom-command-that-does-not-exist', []),
  node: call(process.execPath, ['-e', 'process.stdout.write("ok")']),
};

if (process.env.FANTOM_REPRO_RESULTS != null) {
  fs.writeFileSync(process.env.FANTOM_REPRO_RESULTS, JSON.stringify(results));
}

it('reports a command that cannot start through its result', () => {
  expect(results.missing.thrown).toBeUndefined();
  expect(results.missing.errorCode).toBe('ENOENT');
  expect(results.missing.stdout).toBe('');
});

it('returns the output of a command that runs', () => {
  expect(results.node.stdout).toBe('ok');
});
