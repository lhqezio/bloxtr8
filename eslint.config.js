import { node } from '@bloxtr8/eslint-config';

export default [
  ...node,
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/coverage/**',
      '**/*.min.js',
      '**/pnpm-lock.yaml',
      '**/turbo.json',
    ],
  },
];
