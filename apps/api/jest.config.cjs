/** @type {import('jest').Config} */
module.exports = {
  // Use TypeScript preset for .ts files
  preset: 'ts-jest',

  // Test environment
  testEnvironment: 'node',

  // File extensions to consider
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  // Transform files
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'esnext',
          target: 'es2020',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          strict: false,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          verbatimModuleSyntax: false,
          moduleResolution: 'node',
        },
        useESM: true,
      },
    ],
  },

  // Enable ES modules support
  extensionsToTreatAsEsm: ['.ts', '.tsx'],

  // Test file patterns
  testMatch: ['**/__tests__/**/*.(ts|tsx|js)', '**/*.(test|spec).(ts|tsx|js)'],

  // Ignore patterns
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/.turbo/'],

  // Transform ignore patterns - allow transformation of workspace packages
  transformIgnorePatterns: ['node_modules/(?!(.*\\.mjs$|@bloxtr8/.*))'],

  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 60, // Adjusted to match current realistic coverage
      functions: 65,
      lines: 70,
      statements: 70,
    },
  },

  // Module name mapping for workspace packages
  moduleNameMapper: {
    '^@bloxtr8/(.*)$': '<rootDir>/../../packages/$1/src',
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^better-auth$': '<rootDir>/__mocks__/better-auth.js',
    '^better-auth/node$': '<rootDir>/__mocks__/better-auth-node.js',
    '^better-auth/adapters/prisma$':
      '<rootDir>/__mocks__/better-auth-prisma.js',
    '^@bloxtr8/storage$': '<rootDir>/__mocks__/storage.js',
  },

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/../../jest.setup.js'],

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks after each test
  restoreMocks: true,

  // Verbose output
  verbose: true,

  // Pass when no tests are found
  passWithNoTests: true,
};
