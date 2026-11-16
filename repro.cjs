// Calls Fantom's runCommandSync (runner/utils.js) with a command that does not
// exist, and with one that runs, in a react-native checkout (yarn install done).
//
// It copies runCommandSyncMissingCommand-test.js into
// private/react-native-fantom/runner/__tests__/, runs it with Jest, and
// removes it again.
//
// Usage: node repro.cjs <path to a react-native checkout>
// Exit: 1 while runCommandSync throws for the missing command, or returns a
//       stdout that is not '',
//       0 once it returns the ENOENT error with stdout '',
//       2 for anything else (no checkout, no Jest, no results, another error,
//       the command that runs no longer returning its output).

'use strict';

const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const RUNNER_DIR = 'private/react-native-fantom/runner';
const UTILS = `${RUNNER_DIR}/utils.js`;
const TEST_NAME = 'runCommandSyncMissingCommand-test.js';
const TEST_FILE = `${RUNNER_DIR}/__tests__/${TEST_NAME}`;

let copiedTo = null;

function removeCopy() {
  if (copiedTo != null) {
    fs.rmSync(copiedTo, {force: true});
    console.log(`removed ${TEST_FILE}`);
    copiedTo = null;
  }
}

function finish(code, summary) {
  removeCopy();
  console.log(`SUMMARY: ${summary}`);
  process.exit(code);
}

// An unexpected error is a failed step, never the verdict.
process.on('uncaughtException', error => {
  finish(2, `the reproducer stopped: ${error.message}`);
});

const checkout = process.argv[2];
if (checkout == null) {
  finish(2, 'usage: node repro.cjs <path to a react-native checkout>');
}
const root = path.resolve(checkout);

function clean(text) {
  return String(text)
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split(root + path.sep)
    .join('')
    .split(root)
    .join('.')
    .split(process.execPath)
    .join('node')
    .replace(/(Users|home)(\\+|\/)[^\\/"\s]+/g, '$1$2…');
}

const git = spawnSync('git', ['-C', root, 'log', '-1', '--format=%h (%cs)'], {
  encoding: 'utf8',
});
const commit = git.status === 0 ? git.stdout.trim() : 'unknown commit';
console.log(
  `react-native ${commit}, ${os.type()} ${os.release()}, node ${process.version}`,
);

const utilsPath = path.join(root, UTILS);
if (!fs.existsSync(utilsPath)) {
  finish(2, `${UTILS} not found in the checkout`);
}
const lines = fs.readFileSync(utilsPath, 'utf8').split('\n');
for (const field of ['stdout', 'stderr']) {
  const index = lines.findIndex(line =>
    line.trim().startsWith(`${field}: result.${field}`),
  );
  console.log(
    index === -1
      ? `${UTILS}: (no "${field}: result.${field}" line)`
      : `${UTILS}:${index + 1}: ${lines[index].trim()}`,
  );
}

let jestBin;
try {
  jestBin = path.join(
    path.dirname(require.resolve('jest/package.json', {paths: [root]})),
    'bin',
    'jest.js',
  );
} catch {
  finish(2, 'jest not found in the checkout: run yarn install there first');
}

const target = path.join(root, TEST_FILE);
if (fs.existsSync(target)) {
  finish(2, `${TEST_FILE} already exists in the checkout; not overwriting it`);
}
fs.copyFileSync(path.join(__dirname, TEST_NAME), target);
copiedTo = target;
console.log(`copied ${TEST_NAME} to ${RUNNER_DIR}/__tests__/`);

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fantom-repro-'));
const reportFile = path.join(outDir, 'jest.json');
const resultsFile = path.join(outDir, 'results.json');
console.log(`$ yarn jest ${TEST_FILE}`);
const jest = spawnSync(
  process.execPath,
  [jestBin, TEST_FILE, '--json', `--outputFile=${reportFile}`],
  {
    cwd: root,
    encoding: 'utf8',
    env: {...process.env, FORCE_COLOR: '0', FANTOM_REPRO_RESULTS: resultsFile},
  },
);
removeCopy();
console.log(`jest exited ${jest.status}`);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}
const report = readJson(reportFile);
const results = readJson(resultsFile);
fs.rmSync(outDir, {recursive: true, force: true});

for (const t of report?.testResults?.[0]?.assertionResults ?? []) {
  console.log(`  ${t.status}: ${t.title}`);
}

if (results == null || results.missing == null || results.node == null) {
  const message = report?.testResults?.[0]?.message;
  const tail = clean(message || `${jest.stdout}\n${jest.stderr}`)
    .trim()
    .split('\n')
    .slice(-20)
    .join('\n');
  console.log(tail);
  finish(2, 'the test recorded no results from runCommandSync');
}

function describe(label, r) {
  if (!r.returned) {
    console.log(`${label}: threw ${clean(r.thrown)}`);
    if (r.thrownAt != null) {
      console.log(`  ${clean(r.thrownAt)}`);
    }
    return;
  }
  console.log(
    `${label}: returned status ${r.status}, error ${clean(r.error)}, stdout ${r.stdoutType === 'string' ? JSON.stringify(r.stdout) : r.stdoutType}`,
  );
  console.log(
    `  getDebugInfoFromCommandResult: ${clean(r.debugInfo).split('\n').join('\n  | ')}`,
  );
}

const MISSING = "runCommandSync('fantom-command-that-does-not-exist', [], {})";
describe(MISSING, results.missing);
describe(
  "runCommandSync(node, ['-e', 'process.stdout.write(\"ok\")'], {})",
  results.node,
);

if (!results.node.returned || results.node.stdout !== 'ok') {
  finish(2, 'runCommandSync no longer returns the output of a command that runs');
}

const missing = results.missing;
if (!missing.returned) {
  if (/^TypeError: .*'toString'/.test(missing.thrown)) {
    finish(
      1,
      `${MISSING} throws "${missing.thrown}" instead of returning the ENOENT spawn error; expected a result with error.code ENOENT and stdout ''`,
    );
  }
  finish(2, `${MISSING} throws another error: ${clean(missing.thrown)}`);
}
if (missing.errorCode !== 'ENOENT') {
  finish(2, `${MISSING} returns error code ${missing.errorCode}, not ENOENT`);
}
if (missing.stdout !== '') {
  finish(
    1,
    `${MISSING} returns the ENOENT error but stdout ${missing.stdoutType === 'string' ? JSON.stringify(missing.stdout) : missing.stdoutType}; expected ''`,
  );
}
finish(
  0,
  `${MISSING} returns the ENOENT spawn error with stdout '', and getDebugInfoFromCommandResult names it`,
);
