/**
 * Lets the generators import the app's TypeScript helpers (src/…/lib/*.ts)
 * as they are: those files import each other without an extension
 * (`from './stops-utils'`), which Node only resolves with this hook.
 * Node strips the types itself (--experimental-strip-types, default in 24).
 *
 * Import this module before any such helper; import the helpers with
 * `await import(...)` so they resolve after the hook is in place.
 */

import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relative = specifier.startsWith('./') || specifier.startsWith('../');
    const fromTs = context.parentURL?.endsWith('.ts');
    if (relative && fromTs && !/\.[cm]?[jt]s$/.test(specifier)) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context);
    }
    return nextResolve(specifier, context);
  },
});
