import { base } from '@bloxtr8/eslint-config';

export default [
  ...base,
  {
    ignores: ['dist/**', 'node_modules/**', 'prisma/migrations/**'],
    rules: {
      'no-console': 'off',  // ✅ allow console statements for the database package
    },
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
  },
];
