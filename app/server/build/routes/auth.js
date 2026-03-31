"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const speakeasy_1 = __importDefault(require("speakeasy"));
const qrcode_1 = __importDefault(require("qrcode"));
const prisma_1 = require("../utils/prisma");
const auth_1 = require("../middleware/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
const errorHandler_1 = require("../middleware/errorHandler");
const router = (0, express_1.Router)();
// Generate JWT tokens
const generateTokens = (userId, email, role) => {
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    const accessToken = jsonwebtoken_1.default.sign({ userId, email, role }, process.env.JWT_SECRET, { expiresIn });
    const refreshToken = jsonwebtoken_1.default.sign({ userId, type: 'refresh' }, process.env.JWT_REFRESH_SECRET, { expiresIn: '30d' });
    return { accessToken, refreshToken };
};
// Generate OTP code
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};
// Register
router.post('/register', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { email, phone, password, fullName, username, referralCode, termsAccepted } = req.body;
    // Validation
    if (!email && !phone) {
        throw new errorHandler_1.AppError('Email or phone number is required', 400);
    }
    if (!password || password.length < 8) {
        throw new errorHandler_1.AppError('Password must be at least 8 characters', 400);
    }
    if (!fullName || !username) {
        throw new errorHandler_1.AppError('Full name and username are required', 400);
    }
    if (!termsAccepted) {
        throw new errorHandler_1.AppError('You must accept the terms and conditions', 400);
    }
    // Check if email exists
    if (email) {
        const existingEmail = await prisma_1.prisma.user.findUnique({
            where: { email }
        });
        if (existingEmail) {
            throw new errorHandler_1.AppError('Email already registered', 409);
        }
    }
    // Check if phone exists
    if (phone) {
        const existingPhone = await prisma_1.prisma.user.findUnique({
            where: { phone }
        });
        if (existingPhone) {
            throw new errorHandler_1.AppError('Phone number already registered', 409);
        }
    }
    // Check if username exists
    const existingUsername = await prisma_1.prisma.user.findUnique({
        where: { username }
    });
    if (existingUsername) {
        throw new errorHandler_1.AppError('Username already taken', 409);
    }
    // Validate referral code if provided
    let referredBy = null;
    if (referralCode) {
        const referrer = await prisma_1.prisma.user.findFirst({
            where: { referralCode }
        });
        if (referrer) {
            referredBy = referrer.id;
        }
    }
    // Hash password
    const passwordHash = await bcryptjs_1.default.hash(password, 12);
    // Generate unique referral code for new user
    const userReferralCode = `GC${Date.now().toString(36).toUpperCase()}`;
    // Create user
    const user = await prisma_1.prisma.user.create({
        data: {
            email,
            phone,
            passwordHash,
            fullName,
            username,
            referralCode: userReferralCode,
            referredBy,
            termsAccepted: true,
            termsAcceptedAt: new Date()
        }
    });
    // Create wallets
    await prisma_1.prisma.wallet.createMany({
        data: [
            { userId: user.id, type: 'USD', balance: 0 },
            { userId: user.id, type: 'USDT', balance: 0 }
        ]
    });
    // Generate and send OTP
    const otpCode = generateOTP();
    await prisma_1.prisma.otpCode.create({
        data: {
            identifier: email || phone,
            code: otpCode,
            type: email ? 'EMAIL_VERIFICATION' : 'PHONE_VERIFICATION',
            expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
        }
    });
    // Send OTP (in production, integrate with email/SMS service)
    console.log(`OTP for ${email || phone}: ${otpCode}`);
    res.status(201).json({
        success: true,
        message: 'Registration successful. Please verify your account.',
        data: {
            userId: user.id,
            requiresVerification: true,
            identifier: email || phone
        }
    });
}));
// Verify OTP
router.post('/verify-otp', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { identifier, code, type } = req.body;
    if (!identifier || !code) {
        throw new errorHandler_1.AppError('Identifier and code are required', 400);
    }
    const otpRecord = await prisma_1.prisma.otpCode.findFirst({
        where: {
            identifier,
            code,
            type,
            usedAt: null,
            expiresAt: {
                gt: new Date()
            }
        }
    });
    if (!otpRecord) {
        throw new errorHandler_1.AppError('Invalid or expired code', 400);
    }
    // Mark OTP as used
    await prisma_1.prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { usedAt: new Date() }
    });
    // Activate user account
    const user = await prisma_1.prisma.user.update({
        where: {
            email: identifier
        },
        data: {
        // Account is now verified
        }
    });
    // Generate tokens
    const tokens = generateTokens(user.id, user.email || '', user.role);
    res.json({
        success: true,
        message: 'Account verified successfully',
        data: {
            user: {
                id: user.id,
                email: user.email,
                phone: user.phone,
                fullName: user.fullName,
                username: user.username,
                role: user.role,
                kycStatus: user.kycStatus
            },
            ...tokens
        }
    });
}));
// Resend OTP
router.post('/resend-otp', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { identifier, type } = req.body;
    if (!identifier) {
        throw new errorHandler_1.AppError('Identifier is required', 400);
    }
    // Invalidate old OTPs
    await prisma_1.prisma.otpCode.updateMany({
        where: {
            identifier,
            usedAt: null
        },
        data: {
            usedAt: new Date()
        }
    });
    // Generate new OTP
    const otpCode = generateOTP();
    await prisma_1.prisma.otpCode.create({
        data: {
            identifier,
            code: otpCode,
            type: type || 'EMAIL_VERIFICATION',
            expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        }
    });
    console.log(`New OTP for ${identifier}: ${otpCode}`);
    res.json({
        success: true,
        message: 'Verification code sent'
    });
}));
// Login
router.post('/login', rateLimiter_1.loginRateLimiter, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { email, phone, password, twoFactorCode, deviceFingerprint } = req.body;
    if ((!email && !phone) || !password) {
        throw new errorHandler_1.AppError('Email/Phone and password are required', 400);
    }
    // Find user
    const user = await prisma_1.prisma.user.findFirst({
        where: {
            OR: [
                { email: email || undefined },
                { phone: phone || undefined }
            ]
        }
    });
    if (!user) {
        (0, rateLimiter_1.recordFailedLogin)(email || phone || req.ip);
        throw new errorHandler_1.AppError('Invalid credentials', 401);
    }
    // Check password
    const isValidPassword = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!isValidPassword) {
        (0, rateLimiter_1.recordFailedLogin)(user.email || user.phone || req.ip);
        // Log failed attempt
        await prisma_1.prisma.loginAttempt.create({
            data: {
                userId: user.id,
                email: user.email,
                ipAddress: req.ip || 'unknown',
                userAgent: req.headers['user-agent'] || 'unknown',
                deviceFingerprint,
                success: false,
                failureReason: 'Invalid password'
            }
        });
        throw new errorHandler_1.AppError('Invalid credentials', 401);
    }
    // Check if 2FA is enabled
    if (user.twoFactorEnabled) {
        if (!twoFactorCode) {
            return res.json({
                success: true,
                requiresTwoFactor: true,
                userId: user.id
            });
        }
        const verified = speakeasy_1.default.totp.verify({
            secret: user.twoFactorSecret,
            encoding: 'base32',
            token: twoFactorCode,
            window: 1
        });
        if (!verified) {
            throw new errorHandler_1.AppError('Invalid 2FA code', 401);
        }
    }
    // Check if terms are accepted
    if (!user.termsAccepted) {
        return res.status(403).json({
            success: false,
            message: 'Terms and conditions must be accepted',
            code: 'TERMS_REQUIRED',
            requiresTerms: true
        });
    }
    // Clear failed login attempts
    (0, rateLimiter_1.clearLoginAttempts)(user.email || user.phone || req.ip);
    // Update last login
    await prisma_1.prisma.user.update({
        where: { id: user.id },
        data: {
            lastLoginAt: new Date(),
            lastLoginIp: req.ip || 'unknown',
            deviceFingerprint
        }
    });
    // Log successful login
    await prisma_1.prisma.loginAttempt.create({
        data: {
            userId: user.id,
            email: user.email,
            ipAddress: req.ip || 'unknown',
            userAgent: req.headers['user-agent'] || 'unknown',
            deviceFingerprint,
            success: true
        }
    });
    // Generate tokens
    const tokens = generateTokens(user.id, user.email || '', user.role);
    res.json({
        success: true,
        message: 'Login successful',
        data: {
            user: {
                id: user.id,
                email: user.email,
                phone: user.phone,
                fullName: user.fullName,
                username: user.username,
                role: user.role,
                kycStatus: user.kycStatus,
                twoFactorEnabled: user.twoFactorEnabled
            },
            ...tokens
        }
    });
}));
// Setup 2FA
router.post('/2fa/setup', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const secret = speakeasy_1.default.generateSecret({
        name: `${process.env.TOTP_SERVICE_NAME} (${req.user.email})`
    });
    // Save secret temporarily (will be confirmed after verification)
    await prisma_1.prisma.user.update({
        where: { id: userId },
        data: {
            twoFactorSecret: secret.base32
        }
    });
    // Generate QR code
    const qrCodeUrl = await qrcode_1.default.toDataURL(secret.otpauth_url);
    res.json({
        success: true,
        data: {
            secret: secret.base32,
            qrCode: qrCodeUrl
        }
    });
}));
// Verify and enable 2FA
router.post('/2fa/verify', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { code } = req.body;
    const userId = req.user.id;
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: userId },
        select: { twoFactorSecret: true }
    });
    if (!user?.twoFactorSecret) {
        throw new errorHandler_1.AppError('2FA not set up', 400);
    }
    const verified = speakeasy_1.default.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: code,
        window: 1
    });
    if (!verified) {
        throw new errorHandler_1.AppError('Invalid code', 400);
    }
    // Enable 2FA
    await prisma_1.prisma.user.update({
        where: { id: userId },
        data: {
            twoFactorEnabled: true
        }
    });
    res.json({
        success: true,
        message: '2FA enabled successfully'
    });
}));
// Disable 2FA
router.post('/2fa/disable', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { code } = req.body;
    const userId = req.user.id;
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: userId },
        select: { twoFactorSecret: true, twoFactorEnabled: true }
    });
    if (!user?.twoFactorEnabled) {
        throw new errorHandler_1.AppError('2FA is not enabled', 400);
    }
    const verified = speakeasy_1.default.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: code,
        window: 1
    });
    if (!verified) {
        throw new errorHandler_1.AppError('Invalid code', 400);
    }
    await prisma_1.prisma.user.update({
        where: { id: userId },
        data: {
            twoFactorEnabled: false,
            twoFactorSecret: null
        }
    });
    res.json({
        success: true,
        message: '2FA disabled successfully'
    });
}));
// Refresh token
router.post('/refresh', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
        throw new errorHandler_1.AppError('Refresh token required', 400);
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        if (decoded.type !== 'refresh') {
            throw new errorHandler_1.AppError('Invalid token type', 401);
        }
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: decoded.userId }
        });
        if (!user || user.isBanned) {
            throw new errorHandler_1.AppError('User not found or banned', 401);
        }
        const tokens = generateTokens(user.id, user.email || '', user.role);
        res.json({
            success: true,
            data: tokens
        });
    }
    catch (error) {
        throw new errorHandler_1.AppError('Invalid refresh token', 401);
    }
}));
// Forgot password
router.post('/forgot-password', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { email } = req.body;
    if (!email) {
        throw new errorHandler_1.AppError('Email is required', 400);
    }
    const user = await prisma_1.prisma.user.findUnique({
        where: { email }
    });
    if (!user) {
        // Don't reveal if email exists
        return res.json({
            success: true,
            message: 'If an account exists, a reset code has been sent'
        });
    }
    // Generate OTP
    const otpCode = generateOTP();
    await prisma_1.prisma.otpCode.create({
        data: {
            identifier: email,
            code: otpCode,
            type: 'PASSWORD_RESET',
            expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        }
    });
    // Send email (in production)
    console.log(`Password reset OTP for ${email}: ${otpCode}`);
    res.json({
        success: true,
        message: 'If an account exists, a reset code has been sent'
    });
}));
// Reset password
router.post('/reset-password', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
        throw new errorHandler_1.AppError('Email, code, and new password are required', 400);
    }
    if (newPassword.length < 8) {
        throw new errorHandler_1.AppError('Password must be at least 8 characters', 400);
    }
    // Verify OTP
    const otpRecord = await prisma_1.prisma.otpCode.findFirst({
        where: {
            identifier: email,
            code,
            type: 'PASSWORD_RESET',
            usedAt: null,
            expiresAt: {
                gt: new Date()
            }
        }
    });
    if (!otpRecord) {
        throw new errorHandler_1.AppError('Invalid or expired code', 400);
    }
    // Mark OTP as used
    await prisma_1.prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { usedAt: new Date() }
    });
    // Update password
    const passwordHash = await bcryptjs_1.default.hash(newPassword, 12);
    await prisma_1.prisma.user.update({
        where: { email },
        data: { passwordHash }
    });
    res.json({
        success: true,
        message: 'Password reset successfully'
    });
}));
// Get current user
router.get('/me', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: req.user.id },
        include: {
            wallets: {
                select: {
                    id: true,
                    type: true,
                    balance: true,
                    frozenBalance: true,
                    address: true
                }
            }
        }
    });
    if (!user) {
        throw new errorHandler_1.AppError('User not found', 404);
    }
    res.json({
        success: true,
        data: {
            id: user.id,
            email: user.email,
            phone: user.phone,
            fullName: user.fullName,
            username: user.username,
            role: user.role,
            kycStatus: user.kycStatus,
            twoFactorEnabled: user.twoFactorEnabled,
            termsAccepted: user.termsAccepted,
            wallets: user.wallets,
            createdAt: user.createdAt
        }
    });
}));
// Logout
router.post('/logout', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    // In a more complex setup, you might blacklist the token
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
}));
exports.default = router;
//# sourceMappingURL=auth.js.map