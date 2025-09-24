// Mock for better-auth main module
const mockHandler = (req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ message: 'Mock auth handler' }));
};

const mockAuth = {
  handler: mockHandler,
  api: {
    signIn: () => {},
    signUp: () => {},
    signOut: () => {},
    getSession: () => {},
  },
};

const betterAuth = () => mockAuth;

module.exports = {
  betterAuth,
};
