---
description: Start the E2E stack (Next + MSW + Firebase emulator) and run Cypress specs
allowed-tools: Bash, Read, Edit, Grep, Glob
argument-hint: "[spec name or path, e.g. signin]"
---

Run the Cypress e2e suite. Target: $ARGUMENTS (empty means the whole suite).

The stack needs two services before Cypress can run — Next on **:3001** with MSW mocking enabled, and the
Firebase auth emulator on **:9099**.

1. Check whether they're already up (`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001` and
   `:9099`). Don't start a second copy if they are.
2. If not, start the stack **in the background**: `yarn e2e:setup:dev` for iteration (uses `next dev`), or
   `yarn e2e:setup` to match CI exactly (runs `next build` first — slower, but it's also the only real
   typecheck gate). Prefer `:dev` unless the task is about reproducing a CI failure.
3. Wait for both ports to answer before proceeding — poll, don't sleep blindly.
4. Run the specs:
   - whole suite: `yarn e2e:run`
   - one spec: `CYPRESS_BASE_URL=http://localhost:3001 npx cypress run --spec "cypress/e2e/<name>.cy.ts"`
5. Report actual results. On failure, read the spec and check
   `cypress/screenshots/` and `cypress/videos/`.

Things that will bite you:

- `cy.createNewUserAndSignIn()` **wipes all Firebase emulator accounts** — specs are not isolated from each
  other in that respect.
- The session-renewal block in `cypress/e2e/userFeatureFlags.cy.ts` is `describe.skip` because the renewal
  interval doesn't fire under CI's `next start`. Expect it to be skipped; don't un-skip casually.
- Local env comes from `.env.development`. `cypress/e2e/feed-isr-caching.cy.ts` needs `REVALIDATE_SECRET`
  to be set there.
- Stop the background stack when you're done.

For patterns and custom commands, load the `mobility-testing` skill.
