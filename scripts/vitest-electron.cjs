#!/usr/bin/env node
/**
 * Run Vitest using Electron's bundled Node instead of the host Node.
 *
 * Why this exists:
 *   `better-sqlite3` is a native addon, so its compiled binding only loads
 *   under the exact ABI it was built for. `pnpm rebuild-natives` fetches the
 *   *Electron* ABI build (node-v123 for Electron 30) because that is what the
 *   app needs at runtime. Host Node is a different ABI — v141 on Node 25 — so
 *   any test that opens a database used to die with ERR_DLOPEN_FAILED.
 *
 *   The old workaround was to skip the Electron rebuild on CI so tests could
 *   use a host-Node prebuild. That only moved the problem: locally the two
 *   targets still fought over one `build/Release/better_sqlite3.node`, and on
 *   a host Node with no published prebuild (and no Visual C++ toolchain to
 *   build from source) there is no host-Node binary to be had at all.
 *
 *   Setting ELECTRON_RUN_AS_NODE=1 makes the Electron binary behave as a plain
 *   Node interpreter while keeping Electron's ABI. One native build serves both
 *   the app and the tests, no ABI swapping, and no dependency on which Node the
 *   developer happens to have installed. Tests also exercise the same runtime
 *   the app ships on, which is strictly more faithful.
 *
 * Usage (from apps/desktop):
 *   node ../../scripts/vitest-electron.cjs run
 */

const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

function resolveElectronBinary(fromDir) {
  // Outside an Electron process, `require('electron')` resolves to the path of
  // the executable rather than the API object.
  const entry = require.resolve('electron', { paths: [fromDir] });
  const binary = require(entry);
  if (typeof binary !== 'string' || !existsSync(binary)) {
    throw new Error(
      'Could not locate the Electron binary. Run `pnpm install` and then `pnpm rebuild-natives`.',
    );
  }
  return binary;
}

function main() {
  const cwd = process.cwd();
  const electron = resolveElectronBinary(cwd);
  const vitest = require.resolve('vitest/vitest.mjs', { paths: [cwd] });

  const result = spawnSync(electron, [vitest, ...process.argv.slice(2)], {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });

  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

main();
