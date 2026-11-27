import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/generated/**',
      '**/.wrangler/**',
      '**/.astro/**',
      '**/.gstack/**',
      '**/worker-configuration.d.ts',
      'apps/demo-store/vercel/api/**',
      // Proyecto independiente (TaskFlow) con su propio tooling; no forma parte del monorepo.
      'version-2/**',
      'docs/presentacion/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Scripts CommonJS de Node que generan la presentación.
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        __dirname: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // Regla de dependencias del ADR-001: domain no importa nada y application solo importa domain.
    files: ['packages/domain/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@notifyhub/*', '@prisma/*', 'pg', 'hono', 'hono/*', 'cloudflare:*', 'zod'] },
      ],
    },
  },
  {
    files: ['packages/application/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@notifyhub/persistence',
            '@notifyhub/shared',
            '@prisma/*',
            'pg',
            'hono',
            'hono/*',
            'cloudflare:*',
          ],
        },
      ],
    },
  },
);
