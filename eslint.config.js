import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Flat ESLint configuration for Wadjet.
 *
 * Type-checked rules are applied only to the TypeScript sources under `src/`
 * and `tests/` (the files covered by `tsconfig.json`). Build tooling written in
 * plain ESM (`scripts/`, root config files) is linted with syntactic rules only
 * to avoid requiring those files in a TypeScript project.
 */
export default tseslint.config(
  {
    ignores: ['dist/', 'dist-types/', 'coverage/', 'node_modules/'],
  },

  // TypeScript sources: full type-aware linting.
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },

  // Test files additionally run in a Node context.
  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Build scripts and root config: syntactic linting only.
  {
    files: ['scripts/**/*.mjs', '*.config.js', 'eslint.config.js'],
    extends: [js.configs.recommended, tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  prettier,
);
