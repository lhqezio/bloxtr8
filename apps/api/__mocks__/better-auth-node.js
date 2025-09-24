// Mock for better-auth/node module
const mockToNodeHandler = auth => (req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ message: 'Mock node handler' }));
};

const mockFromNodeHeaders = headers => new Headers(headers);

module.exports = {
  toNodeHandler: mockToNodeHandler,
  fromNodeHeaders: mockFromNodeHeaders,
};
