"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load environment variables
dotenv_1.default.config();
// Import routes
const auth_1 = __importDefault(require("./routes/auth"));
const user_1 = __importDefault(require("./routes/user"));
const wallet_1 = __importDefault(require("./routes/wallet"));
const transaction_1 = __importDefault(require("./routes/transaction"));
const giftcard_1 = __importDefault(require("./routes/giftcard"));
const admin_1 = __importDefault(require("./routes/admin"));
const kyc_1 = __importDefault(require("./routes/kyc"));
const notification_1 = __importDefault(require("./routes/notification"));
const crypto_1 = __importDefault(require("./routes/crypto"));
const bank_1 = __importDefault(require("./routes/bank"));
const appeal_1 = __importDefault(require("./routes/appeal"));
// Import services
const blockchainMonitor_1 = require("./services/blockchainMonitor");
const cryptoRate_1 = require("./services/cryptoRate");
const notification_2 = require("./services/notification");
const fraudDetection_1 = require("./services/fraudDetection");
// Import middleware
const errorHandler_1 = require("./middleware/errorHandler");
const requestLogger_1 = require("./middleware/requestLogger");
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:5173',
        credentials: true
    }
});
exports.io = io;
const PORT = process.env.PORT || 5000;
// Security middleware
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Request logging
app.use(requestLogger_1.requestLogger);
// Static files for uploads
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
// Serve frontend static files in production
if (process.env.NODE_ENV === 'production') {
    app.use(express_1.default.static(path_1.default.join(__dirname, 'dist')));
}
// API Routes
app.use('/api/auth', auth_1.default);
app.use('/api/user', user_1.default);
app.use('/api/wallet', wallet_1.default);
app.use('/api/transactions', transaction_1.default);
app.use('/api/giftcards', giftcard_1.default);
app.use('/api/admin', admin_1.default);
app.use('/api/kyc', kyc_1.default);
app.use('/api/notifications', notification_1.default);
app.use('/api/crypto', crypto_1.default);
app.use('/api/bank', bank_1.default);
app.use('/api/appeals', appeal_1.default);
// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV
    });
});
// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    // Join user-specific room for private notifications
    socket.on('join_user_room', (userId) => {
        socket.join(`user_${userId}`);
        console.log(`Socket ${socket.id} joined room user_${userId}`);
    });
    // Join admin room
    socket.on('join_admin_room', () => {
        socket.join('admin_room');
        console.log(`Socket ${socket.id} joined admin room`);
    });
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});
// Make io accessible to routes
app.set('io', io);
// Error handling
app.use(errorHandler_1.errorHandler);
// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});
// Serve frontend for all other routes in production
if (process.env.NODE_ENV === 'production') {
    app.get('*', (req, res) => {
        res.sendFile(path_1.default.join(__dirname, 'dist', 'index.html'));
    });
}
// Initialize services
const blockchainMonitor = new blockchainMonitor_1.BlockchainMonitorService(io);
const cryptoRateService = new cryptoRate_1.CryptoRateService(io);
const notificationService = new notification_2.NotificationService(io);
const fraudDetectionService = new fraudDetection_1.FraudDetectionService();
// Start services
async function startServices() {
    try {
        // Start blockchain monitoring
        await blockchainMonitor.start();
        console.log('Blockchain monitoring service started');
        // Start crypto rate updates
        await cryptoRateService.start();
        console.log('Crypto rate service started');
        console.log('All services initialized successfully');
    }
    catch (error) {
        console.error('Error starting services:', error);
    }
}
// Start server
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    startServices();
});
// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    httpServer.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    httpServer.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
//# sourceMappingURL=index.js.map