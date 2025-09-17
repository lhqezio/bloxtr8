import { base } from '@bloxtr8/eslint-config';

export default [
  ...base,
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
];
