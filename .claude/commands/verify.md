---
description: Run the full local CI gate — lint, unit tests, and a typecheck
allowed-tools: Bash(yarn lint), Bash(yarn lint:fix), Bash(yarn test:ci), Bash(npx tsc --noEmit), Read, Edit, Grep, Glob
argument-hint: "[--fix]"
---

Run this project's complete pre-PR verification and report results honestly.

Arguments: $ARGUMENTS (if `--fix` is passed, run `yarn lint:fix` first)

Run all three in parallel where possible, since they're independent:

1. `yarn lint` — ESLint over `src`. Remember `prettier/prettier` is an **error** here, so formatting
   failures fail CI.
2. `yarn test:ci` — the exact Jest command CI runs.
3. `npx tsc --noEmit` — **not part of CI and there is no `typecheck` script.** CI only catches type errors
   indirectly via `next build`, so this is the step most likely to surface something new. Run it.

Then:

- Fix what you broke. Do **not** "fix" violations of rules that are deliberately disabled in
  `eslint.config.mjs` — notably all `react-hooks/exhaustive-deps` and `rules-of-hooks`, and the
  `no-unsafe-*` family.
- If `tsc` reports pre-existing errors unrelated to the current change, say so and list them separately
  rather than folding them into your own work.
- Report each command's actual pass/fail state with the relevant output. If something fails and you can't
  fix it, say that plainly instead of hedging.

Note: this does not run Cypress. For e2e use `/e2e`.
