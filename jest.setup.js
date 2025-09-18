// Jest setup file for global test configuration

// Set test timeout to 30 seconds
jest.setTimeout(30000);

// Mock console methods in tests to reduce noise
global.console = {
  ...console,
  // Uncomment to suppress console.log in tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Global test utilities
global.testUtils = {
  // Add any global test utilities here
  createMockUser: () => ({
    id: 'test-user-id',
    username: 'testuser',
    email: 'test@example.com',
  }),

  createMockContract: () => ({
    id: 'test-contract-id',
    title: 'Test Contract',
    description: 'Test contract description',
    price: 100,
  }),
};

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
