# Fantom's runCommandSync throws for a command that cannot start

`runCommandSync` in `private/react-native-fantom/runner/utils.js` throws `TypeError: Cannot read properties of undefined (reading 'toString')` for a command that cannot start, instead of returning the result whose `error` is `spawnSync <command> ENOENT`.

In a react-native checkout after `yarn install`:

```sh
node repro.cjs <path to the react-native checkout>
```

It copies `runCommandSyncMissingCommand-test.js` into `private/react-native-fantom/runner/__tests__/`, runs it with Jest, removes it, and ends with one `SUMMARY:` line.

Exit: 1 while `runCommandSync` throws for the missing command, or returns a `stdout` that is not `''`; 0 once it returns the `ENOENT` error with `stdout` `''`; 2 for anything else.
