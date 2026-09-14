---
description: Regenerate TypeScript types from the OpenAPI specs and fix resulting type errors
allowed-tools: Bash, Read, Edit, Grep, Glob
argument-hint: "[feed | gbfs | user | all]"
---

Regenerate generated API types. Target: $ARGUMENTS (default `all`).

Never hand-edit the generated files and never hand-write API response types — they come from the specs in
`external_types/`.

| Target | Command | Output |
|---|---|---|
| `feed` | `yarn generate:api-types` | `src/app/services/feeds/types.ts` |
| `gbfs` | `yarn generate:gbfs-validator-types` | `src/app/services/feeds/gbfs-validator-types.ts` |
| `user` | `yarn generate:user-api-types` | `src/app/services/user-service-api-types.ts` |

Steps:

1. If a spec in `external_types/` was updated, confirm that with `git diff` first so you know what changed.
2. Run the relevant command(s). The gbfs/user scripts pipe through `eslint --fix` automatically.
3. `git diff --stat` the generated file, then review the **semantic** changes — new/removed/renamed schema
   fields, changed optionality, changed enum members. Summarize those for the user; don't just say
   "regenerated".
4. Run `npx tsc --noEmit` to find call sites broken by the new types, and fix them.
5. If a schema alias or type guard in `src/app/services/feeds/utils.ts` needs updating to cover a new type,
   update it there — that module is the ergonomic layer everything else should consume instead of indexing
   raw `paths[...]`.
6. Run `yarn lint` and `yarn test:ci`.

Report the semantic diff and anything that needs a human decision (e.g. a field that became optional and
now needs a null check with a real fallback, not just `?? ''`).
