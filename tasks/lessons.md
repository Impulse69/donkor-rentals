# Lessons

## Native ABI: run tests on Electron's Node, not the host's

**What went wrong.** `pnpm test` failed with `ERR_DLOPEN_FAILED` on every test that
opens a database. `better-sqlite3` is a native addon, so its compiled binding only
loads under the exact ABI it was built for. `postinstall` → `rebuild-natives` fetches
the **Electron** ABI build (node-v123 for Electron 30) because the app needs it at
runtime, but Vitest ran under **host Node** (v141 on Node 25). One file,
`build/Release/better_sqlite3.node`, two incompatible consumers.

The pre-existing workaround was a `CI === 'true'` skip inside `rebuild-natives.cjs`,
so CI could keep a host-Node prebuild. That only moved the problem: locally the two
targets still fought over the same file, and this machine has **no published prebuild
for Node 25 and no Visual C++ toolchain** to build one from source — so no host-Node
binary was obtainable at all.

**Fix.** `ELECTRON_RUN_AS_NODE=1` makes the Electron binary behave as a plain Node
interpreter while keeping Electron's ABI. See `scripts/vitest-electron.cjs`. One
native build now serves both the app and the tests, there is no ABI swapping, and the
host Node version stops mattering. Tests also exercise the runtime the app actually
ships on, which is strictly more faithful.

**Gotcha.** Vitest's default `threads` pool does not tear down cleanly under Electron:
it reports every test as passing, then exits **127** before printing a summary — so
`pnpm` fails while the console looks green. `pool: 'forks'` in `vitest.config.ts` fixes
it. If a test run ever looks like it passed but the command failed, check the exit code
before believing the output.

**Rule.** Don't chase a matching host Node version for a native addon in an Electron
app. Point the test runner at Electron's Node instead.

## An append-only migration runner will silently no-op a squashed baseline

**What went wrong.** After collapsing `0001`–`0009` into `0001_baseline.sql`, the app
crashed on launch with `no such column: tin`. The dev database already had all nine
legacy migrations recorded. The runner saw `0001_baseline` as unapplied, ran it — but
every statement is `CREATE TABLE IF NOT EXISTS`, so it did **nothing**, recorded itself
as applied, and left a hybrid schema: old tables, missing new columns, sync/auth tables
still present.

**Why it matters.** The failure is silent at migration time and only surfaces later as
a confusing "no such column" from unrelated code. `IF NOT EXISTS` makes a squashed
baseline a no-op rather than an error.

**Rule.** A squashed baseline should refuse to run against a database that carries
legacy migration rows, rather than half-applying. Detect prior ids in `_migrations` and
throw with instructions. Deleting the dev database is the workaround, not the fix.

## Verify the delegate's environment claims, not just its code

Codex reported `pnpm test` failing on a Vitest **config-load** error and renamed
`vitest.config.ts` → `.mjs` chasing it — the rename did not help and the file content
was byte-identical, so it was pure churn (reverted). The config loaded fine outside its
sandbox; the real failure was the ABI mismatch above, which its `--ignore-scripts`
install had masked by leaving no binding at all.

**Rule.** When a delegate reports a failing verification, reproduce it locally before
accepting either the diagnosis or any fix built on it. Also check what it changed
*while* diagnosing — those edits often outlive the theory that motivated them.
