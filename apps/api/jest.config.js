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
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },

  // Test file patterns
  testMatch: ['**/__tests__/**/*.(ts|tsx|js)', '**/*.(test|spec).(ts|tsx|js)'],

  // Ignore patterns
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/.turbo/'],

  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },

  // Module name mapping for workspace packages
  moduleNameMapper: {
    '^@bloxtr8/(.*)$': '<rootDir>/../../packages/$1/src',
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

  // TypeScript configuration for Jest
  globals: {
    'ts-jest': {
      tsconfig: {
        module: 'commonjs',
        target: 'es2020',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
      },
    },
  },
};
