---
description: Add or update i18n message keys in both en and fr, keeping the files in parity
allowed-tools: Bash, Read, Edit, Grep, Glob
argument-hint: "<namespace.key> [English text]"
---

Add or update translation keys: $ARGUMENTS

Messages live in `messages/en.json` and `messages/fr.json`. Existing namespaces: `common`,
`emailVerification`, `feeds`, `account`, `contactUs`, `gbfs`, `home`, `about`, `footer`. Prefer an existing
namespace over inventing one.

## Rules

1. **Always edit both files.** They are currently at full parity — every namespace present in `en.json`
   exists in `fr.json`. Keep it that way; a key present in only one locale renders as the raw key.
2. Mirror the same nesting path and key order in both files so diffs stay readable.
3. Provide a real French translation. If you are not confident in the wording for a domain term (transit
   jargon like "feed", "dataset", "validation report", "producer"), say so explicitly and mark it for review
   rather than shipping a silent guess — check how the same term is already translated elsewhere in
   `fr.json` first and stay consistent with it.
4. next-intl uses ICU message syntax. For interpolation use `{count}`, and use proper `plural`/`select`
   blocks rather than string concatenation:
   ```json
   { "feedCount": "{count, plural, =0 {No feeds} one {# feed} other {# feeds}}" }
   ```
   French plural rules differ from English — don't copy the English arms verbatim.
5. Do not hardcode user-facing strings in components. Read them via `useTranslations('namespace')` in client
   components, `getTranslations()` from `next-intl/server` in server components.

## Consuming the key

```tsx
'use client';
import { useTranslations } from 'next-intl';
const t = useTranslations('feeds');
// t('myNewKey')
```

## Verify

- `node -e "require('./messages/en.json'); require('./messages/fr.json')"` — catches JSON syntax errors.
- Confirm parity, e.g.:
  ```bash
  node -e "const en=require('./messages/en.json'),fr=require('./messages/fr.json');const f=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'&&v!==null?f(v,p+k+'.'):[p+k]);const a=f(en),b=f(fr);console.log('only en:',a.filter(k=>!b.includes(k)));console.log('only fr:',b.filter(k=>!a.includes(k)));"
  ```
- `yarn lint` and `yarn test:ci`.

**Testing note:** `next-intl` is globally mocked in Jest and `useTranslations()` returns the key itself. So
tests assert on **keys**, not English text — don't update specs to expect your new English string.
