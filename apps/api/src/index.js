"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
// Middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Basic health check route
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Bloxtr8 API is running',
        timestamp: new Date().toISOString()
    });
});
// Start server
app.listen(port, () => {
    console.log(`🚀 Bloxtr8 API running on http://localhost:${port}`);
    console.log(`📊 Health check available at http://localhost:${port}/health`);
});
//# sourceMappingURL=index.js.map