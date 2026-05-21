#!/usr/bin/env node
/**
 * Rebuild / fetch the prebuilt native bindings against Electron's Node ABI.
 *
 * Why this exists:
 *   - On Node 24+, the legacy `electron-rebuild` package fails with
 *     `require is not defined in ES module scope` because its yargs dependency
 *     no longer loads cleanly under the stricter ESM loader.
 *   - `electron-builder install-app-deps` can't always locate prebuild-install
 *     when pnpm has hoisted it under `.pnpm/` rather than the root.
 *
 * What this does:
 *   - Resolves the Electron version from the desktop app's deps tree.
 *   - For every native dep declared below, calls `prebuild-install` directly
 *     with `--runtime=electron --target=<electronVersion>` so it pulls the
 *     correct ABI binary (e.g. node-v123-* for Electron 30).
 *
 * Usage:
 *   pnpm rebuild-natives
 */

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const NATIVE_DEPS = ['better-sqlite3'];

function resolveFrom(specifier, fromDir) {
  return require.resolve(specifier, { paths: [fromDir] });
}

function main() {
  // Skip on CI: GitHub Actions / similar already use Node 22 where the bundled
  // legacy `electron-rebuild` works during the `pnpm release` script. Running
  // here would swap the host-Node prebuild for the Electron-ABI prebuild
  // *before* `pnpm test` executes — and tests use host Node, not Electron.
  // Detection is by env var so local users can force it: `CI=true` set by
  // GitHub Actions / GitLab CI / etc.
  if (process.env.CI === 'true' && process.env.DONKOR_FORCE_REBUILD !== '1') {
    console.log('[rebuild-natives] CI detected — skipping (release script handles native rebuild).');
    return;
  }

  const repoRoot = path.resolve(__dirname, '..');
  const desktopDir = path.join(repoRoot, 'apps', 'desktop');

  const electronPkg = resolveFrom('electron/package.json', desktopDir);
  const electronVersion = require(electronPkg).version;
  console.log(`[rebuild-natives] Electron ${electronVersion} (arch=${process.arch}, platform=${process.platform})`);

  for (const dep of NATIVE_DEPS) {
    const depPkg = resolveFrom(`${dep}/package.json`, desktopDir);
    const depDir = path.dirname(depPkg);
    // prebuild-install is a transitive dep of native packages — resolve it
    // relative to the native package's own directory so pnpm's strict tree works.
    const prebuildBin = resolveFrom('prebuild-install/bin.js', depDir);
    console.log(`[rebuild-natives] ${dep} → ${depDir}`);
    execFileSync(
      process.execPath,
      [
        prebuildBin,
        `--runtime=electron`,
        `--target=${electronVersion}`,
        `--arch=${process.arch}`,
        `--platform=${process.platform}`,
        `--tag-prefix=v`,
      ],
      { cwd: depDir, stdio: 'inherit' },
    );
  }

  console.log('[rebuild-natives] Done. Run `pnpm dev` to launch.');
}

main();
