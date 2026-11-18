/**
 * Lets the generators import the app's TypeScript helpers (src/…/lib/*.ts)
 * as they are: those files import each other without an extension
 * (`from './stops-utils'`), which Node only resolves with this hook.
 * Node strips the types itself (--experimental-strip-types, default in 24).
 *
 * Packages the app imports by name whose CommonJS entry hides its named
 * exports from Node's ESM loader resolve to their ES module build instead
 * (ESM_BUILDS), as the app's bundler does.
 *
 * Import this module before any such helper; import the helpers with
 * `await import(...)` so they resolve after the hook is in place.
 */

import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

/** Package -> its ES module build (package.json `module`). */
const ESM_BUILDS = {
  '@googlemaps/polyline-codec': '@googlemaps/polyline-codec/dist/index.esm.js',
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(ESM_BUILDS, specifier)) return nextResolve(ESM_BUILDS[specifier], context);
    const relative = specifier.startsWith('./') || specifier.startsWith('../');
    const fromTs = context.parentURL?.endsWith('.ts');
    if (relative && fromTs && !/\.[cm]?[jt]s$/.test(specifier)) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context);
    }
    return nextResolve(specifier, context);
  },
});
