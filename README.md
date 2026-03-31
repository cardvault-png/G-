# GiftCard Pro - Fintech Trading Platform

A comprehensive, production-ready gift card trading platform with full backend integration, real-time notifications, AI-powered verification, and advanced admin controls.

## 🚀 Live Demo
**Frontend URL:** https://cardvault-png.github.io/cardvault/

## ✨ Features Implemented

### 🔐 Authentication & Security
- JWT-based authentication with refresh tokens
- Two-Factor Authentication (2FA) with TOTP
- Email/Phone OTP verification
- Rate limiting and account lock protection
- Password reset functionality
- Admin access code: **1122**

### 👤 User Features
- Dashboard with real-time wallet balances
- Transaction history with filtering
- Gift card submission with image upload
- KYC verification flow
- Bank account management
- Withdrawal requests
- Real-time notifications

### 🎁 Gift Card System
- Submit gift cards with front/back images
- AI-powered OCR for PIN extraction
- Fraud detection scoring
- Admin review workflow
- Automatic payout on approval

### 💰 Wallet System
- USD and USDT (TRC20) wallets
- Deposit addresses with QR codes
- Withdrawal to bank accounts
- Transaction ledger for audit trail

### 👑 Admin Control Center
- Dashboard with system statistics
- User management (ban/unban, balance adjustment)
- Transaction approval/rejection
- Gift card verification
- KYC approval workflow
- Admin wallet with fund transfers
- **Error Reporting Dashboard** with auto-fix capabilities
- Broadcast messaging

### 🛡️ Security Features
- Fraud detection with scoring algorithm
- IP and device fingerprint tracking
- KYC verification required for withdrawals
- Account suspension and appeals
- Comprehensive audit logging
- Error boundary with user-friendly error pages

### 📱 UI/UX
- Responsive design (mobile + desktop)
- Dark/Light mode toggle
- Collapsible sidebar
- **Splash animation on load** (no white screen)
- 300ms smooth transitions
- **No AI watermarks or callbacks**

### 📄 Legal Pages
- Terms of Service
- Privacy Policy
- Rules & Regulations
- About Page

## 🏗️ Technical Architecture

### Frontend
- **React 19** + **TypeScript**
- **Vite** for build tooling
- **Tailwind CSS** + **shadcn/ui** components
- **React Query** for data fetching
- **Socket.io** for real-time updates
- **Error Reporting Service** with dashboard

### Backend
- **Node.js** + **Express**
- **Prisma ORM** with PostgreSQL
- **JWT** authentication
- **Multer** for file uploads
- **TRON Web** for blockchain integration
- **SendGrid** for email notifications

### Database Schema
- Users, Wallets, Transactions
- Gift Cards, KYC Documents
- Notifications, Audit Logs
- Admin Actions, Appeals
- Blockchain Monitoring

## 🔧 Environment Configuration

Create a `.env.production` file with:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/giftcard_platform"

# JWT
JWT_SECRET="your-super-secret-jwt-key"
JWT_REFRESH_SECRET="your-refresh-secret-key"

# Server
PORT=5000
NODE_ENV="production"
FRONTEND_URL="https://your-domain.com"

# Email (SendGrid)
SENDGRID_API_KEY="your-sendgrid-api-key"
EMAIL_FROM="noreply@giftcardpro.com"

# TRON Blockchain
TRON_API_KEY="your-tron-api-key"
USDT_TRC20_CONTRACT="TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"

# OPAY
OPAY_MERCHANT_ID="your-merchant-id"
OPAY_API_KEY="your-api-key"
OPAY_API_SECRET="your-api-secret"

# OpenAI
OPENAI_API_KEY="your-openai-api-key"

# Admin
ADMIN_ACCESS_CODE="1122"
DEFAULT_ADMIN_EMAIL="admin@giftcardpro.com"
DEFAULT_ADMIN_PASSWORD="Admin@SecurePass2024!"
```

## 🐳 Docker Deployment

```bash
# Build and start all services
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## 📦 Manual Deployment

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Redis 7+

### Setup
```bash
# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Run database migrations
npm run db:migrate

# Setup default data
npm run db:setup

# Build frontend
npm run build

# Build backend
npm run server:build

# Start server
npm run server:start
```

## 🔍 Error Reporting System

The platform includes a comprehensive error reporting system:

- **Automatic Error Capture**: Catches unhandled errors, promise rejections, and console errors
- **Error Dashboard**: Admin panel to view, analyze, and fix errors
- **Suggested Fixes**: Provides actionable prompts for common errors
- **Auto-Fix Capability**: Can automatically fix certain error types (with admin approval)
- **Local Storage**: Errors stored locally for review
- **No External Callbacks**: Completely independent system

### Error Types Tracked
- Network errors
- Authentication failures
- Database errors
- Validation errors
- JavaScript runtime errors

## 📝 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/verify-otp` - OTP verification
- `POST /api/auth/refresh` - Refresh token

### User
- `GET /api/user/profile` - Get profile
- `PATCH /api/user/profile` - Update profile

### Wallet
- `GET /api/wallet` - Get wallets
- `GET /api/wallet/:type/deposit-address` - Get deposit address

### Transactions
- `GET /api/transactions` - Get transactions
- `POST /api/transactions/withdrawal` - Create withdrawal

### Gift Cards
- `GET /api/giftcards/rates` - Get rates
- `POST /api/giftcards/submit` - Submit gift card

### Admin
- `POST /admin/login` - Admin login
- `GET /admin/dashboard` - Dashboard stats
- `GET /admin/users` - List users
- `POST /admin/users/:id/ban` - Ban/unban user
- `GET /admin/errors` - Error reports (new!)

## 🧪 Testing

```bash
# Run linting
npm run lint

# Preview production build
npm run preview
```

## 📄 License

Proprietary - All rights reserved.

## 🤝 Support

For support, contact admin@giftcardpro.com or use the appeals system in the admin panel.

---

**Note**: This platform was built as a production-ready foundation. To fully activate all features, configure the environment variables with your actual API keys and deploy the backend server.
