const { node } = require('@bloxtr8/eslint-config');

module.exports = [
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
