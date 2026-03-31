import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import walletRoutes from './routes/wallet';
import transactionRoutes from './routes/transaction';
import giftCardRoutes from './routes/giftcard';
import adminRoutes from './routes/admin';
import kycRoutes from './routes/kyc';
import notificationRoutes from './routes/notification';
import cryptoRoutes from './routes/crypto';
import bankRoutes from './routes/bank';
import appealRoutes from './routes/appeal';

// Import services
import { BlockchainMonitorService } from './services/blockchainMonitor';
import { CryptoRateService } from './services/cryptoRate';
import { NotificationService } from './services/notification';
import { FraudDetectionService } from './services/fraudDetection';

// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
  }
});

const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(requestLogger);

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve frontend static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/giftcards', giftCardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/crypto', cryptoRoutes);
app.use('/api/bank', bankRoutes);
app.use('/api/appeals', appealRoutes);

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
  socket.on('join_user_room', (userId: string) => {
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
app.use(errorHandler);

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
    res.sendFile(path.join(__dirname, '../dist', 'index.html'));
  });
}

// Initialize services
const blockchainMonitor = new BlockchainMonitorService(io);
const cryptoRateService = new CryptoRateService(io);
const notificationService = new NotificationService(io);
const fraudDetectionService = new FraudDetectionService();

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
  } catch (error) {
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

export { io };
