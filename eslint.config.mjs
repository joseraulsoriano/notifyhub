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
      'apps/api/worker-configuration.d.ts',
      'apps/dispatcher/worker-configuration.d.ts',
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
