import { node } from '@bloxtr8/eslint-config';

export default [
  ...node,
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
];
