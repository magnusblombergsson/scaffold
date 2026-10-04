import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { existsSync } from 'node:fs';
import { cp, readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Native modules that Vite leaves out of the main bundle (see
 * vite.main.config.mts). They are packaged in node_modules, with the modules
 * they require.
 */
const NATIVE_MODULES = ['@parcel/watcher'];

/** Rendered from the SVGs beside them by `npm run icons`. */
const ICON = 'assets/icon/icon';
/** Squirrel shows this in Add/Remove Programs, so it must be online. */
const ICON_URL =
  'https://raw.githubusercontent.com/magnusblombergsson/scaffold/main/assets/icon/icon.ico';

async function copyWithDependencies(
  names: string[],
  buildPath: string,
): Promise<void> {
  const seen = new Set<string>();
  const queue = [...names];
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (seen.has(name)) continue;
    seen.add(name);
    const from = path.join(process.cwd(), 'node_modules', name);
    // Optional dependencies for other platforms aren't installed.
    if (!existsSync(from)) continue;
    await cp(from, path.join(buildPath, 'node_modules', name), {
      recursive: true,
    });
    const manifest = JSON.parse(
      await readFile(path.join(from, 'package.json'), 'utf8'),
    );
    queue.push(
      ...Object.keys({
        ...manifest.dependencies,
        ...manifest.optionalDependencies,
      }),
    );
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    // Native binaries can't be loaded from inside the archive.
    asar: { unpack: '**/*.node' },
    // Packager picks .ico or .icns by platform.
    icon: ICON,
    // The Linux window icon, read from the resources folder (see shell.ts).
    extraResource: [`${ICON}.png`],
  },
  hooks: {
    packageAfterCopy: (_config, buildPath) =>
      copyWithDependencies(NATIVE_MODULES, buildPath),
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({ setupIcon: `${ICON}.ico`, iconUrl: ICON_URL }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({ options: { icon: `${ICON}.png` } }),
    new MakerDeb({ options: { icon: `${ICON}.png` } }),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main/main.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
