import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import next from 'eslint-config-next/core-web-vitals';
import prettierRecommended from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'build/',
      'out/',
      'node_modules/',
      '.next/',
      'coverage/',
      '**/*.config.js',
      '**/*.config.mjs',
      'next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked.map((c) => ({ ...c, files: ['**/*.{ts,tsx}'] })),
  // next[1] (next/typescript) is skipped — it re-declares @typescript-eslint,
  // conflicting with tseslint.configs.recommended above, which we use instead
  // for TypeScript 6 compatibility and the full recommended ruleset.
  (({ languageOptions: _lang, ...rest }) => rest)(next[0]),
  next[3], // core-web-vitals: promotes no-html-link-for-pages + no-sync-scripts to errors
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parserOptions: { projectService: true },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          vars: 'all',
          args: 'none',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      // TODO: hooks called inside render callbacks, incorrect hook usage patterns,
      // and missing/extra effect dependencies — to be fixed in a separate ticket.
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-render': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/exhaustive-deps': 'off',
      // TypeScript handles these; disable the core JS versions.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      // Type-checked rules from recommendedTypeChecked that are too noisy
      // for the current codebase — kept off to preserve parity with the
      // previous eslint-config-standard-with-typescript baseline.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
    },
  },
  prettierRecommended,
);
