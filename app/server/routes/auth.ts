import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { prisma } from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { loginRateLimiter, recordFailedLogin, clearLoginAttempts } from '../middleware/rateLimiter';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { NotificationService } from '../services/notification';

const router = Router();

// Generate JWT tokens
const generateTokens = (userId: string, email: string, role: string) => {
  const expiresIn = (process.env.JWT_EXPIRES_IN as any) || '7d';
  const accessToken = jwt.sign(
    { userId, email, role },
    process.env.JWT_SECRET!,
    { expiresIn }
  );

  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: '30d' as any }
  );

  return { accessToken, refreshToken };
};

// Generate OTP code
const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Register
router.post('/register', asyncHandler(async (req, res) => {
  const {
    email,
    phone,
    password,
    fullName,
    username,
    referralCode,
    termsAccepted
  } = req.body;

  // Validation
  if (!email && !phone) {
    throw new AppError('Email or phone number is required', 400);
  }

  if (!password || password.length < 8) {
    throw new AppError('Password must be at least 8 characters', 400);
  }

  if (!fullName || !username) {
    throw new AppError('Full name and username are required', 400);
  }

  if (!termsAccepted) {
    throw new AppError('You must accept the terms and conditions', 400);
  }

  // Check if email exists
  if (email) {
    const existingEmail = await prisma.user.findUnique({
      where: { email }
    });
    if (existingEmail) {
      throw new AppError('Email already registered', 409);
    }
  }

  // Check if phone exists
  if (phone) {
    const existingPhone = await prisma.user.findUnique({
      where: { phone }
    });
    if (existingPhone) {
      throw new AppError('Phone number already registered', 409);
    }
  }

  // Check if username exists
  const existingUsername = await prisma.user.findUnique({
    where: { username }
  });
  if (existingUsername) {
    throw new AppError('Username already taken', 409);
  }

  // Validate referral code if provided
  let referredBy = null;
  if (referralCode) {
    const referrer = await prisma.user.findFirst({
      where: { referralCode }
    });
    if (referrer) {
      referredBy = referrer.id;
    }
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 12);

  // Generate unique referral code for new user
  const userReferralCode = `GC${Date.now().toString(36).toUpperCase()}`;

  // Create user
  const user = await prisma.user.create({
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
  await prisma.wallet.createMany({
    data: [
      { userId: user.id, type: 'USD', balance: 0 },
      { userId: user.id, type: 'USDT', balance: 0 }
    ]
  });

  // Generate and send OTP
  const otpCode = generateOTP();
  await prisma.otpCode.create({
    data: {
      identifier: email || phone!,
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
router.post('/verify-otp', asyncHandler(async (req, res) => {
  const { identifier, code, type } = req.body;

  if (!identifier || !code) {
    throw new AppError('Identifier and code are required', 400);
  }

  const otpRecord = await prisma.otpCode.findFirst({
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
    throw new AppError('Invalid or expired code', 400);
  }

  // Mark OTP as used
  await prisma.otpCode.update({
    where: { id: otpRecord.id },
    data: { usedAt: new Date() }
  });

  // Activate user account
  const user = await prisma.user.update({
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
router.post('/resend-otp', asyncHandler(async (req, res) => {
  const { identifier, type } = req.body;

  if (!identifier) {
    throw new AppError('Identifier is required', 400);
  }

  // Invalidate old OTPs
  await prisma.otpCode.updateMany({
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
  await prisma.otpCode.create({
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
router.post('/login', loginRateLimiter, asyncHandler(async (req, res) => {
  const { email, phone, password, twoFactorCode, deviceFingerprint } = req.body;

  if ((!email && !phone) || !password) {
    throw new AppError('Email/Phone and password are required', 400);
  }

  // Find user
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: email || undefined },
        { phone: phone || undefined }
      ]
    }
  });

  if (!user) {
    recordFailedLogin(email || phone || req.ip!);
    throw new AppError('Invalid credentials', 401);
  }

  // Check password
  const isValidPassword = await bcrypt.compare(password, user.passwordHash);

  if (!isValidPassword) {
    recordFailedLogin(user.email || user.phone || req.ip!);
    
    // Log failed attempt
    await prisma.loginAttempt.create({
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

    throw new AppError('Invalid credentials', 401);
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

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret!,
      encoding: 'base32',
      token: twoFactorCode,
      window: 1
    });

    if (!verified) {
      throw new AppError('Invalid 2FA code', 401);
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
  clearLoginAttempts(user.email || user.phone || req.ip!);

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      lastLoginIp: req.ip || 'unknown',
      deviceFingerprint
    }
  });

  // Log successful login
  await prisma.loginAttempt.create({
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
router.post('/2fa/setup', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user!.id;

  const secret = speakeasy.generateSecret({
    name: `${process.env.TOTP_SERVICE_NAME} (${req.user!.email})`
  });

  // Save secret temporarily (will be confirmed after verification)
  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorSecret: secret.base32
    }
  });

  // Generate QR code
  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

  res.json({
    success: true,
    data: {
      secret: secret.base32,
      qrCode: qrCodeUrl
    }
  });
}));

// Verify and enable 2FA
router.post('/2fa/verify', authenticate, asyncHandler(async (req, res) => {
  const { code } = req.body;
  const userId = req.user!.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorSecret: true }
  });

  if (!user?.twoFactorSecret) {
    throw new AppError('2FA not set up', 400);
  }

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token: code,
    window: 1
  });

  if (!verified) {
    throw new AppError('Invalid code', 400);
  }

  // Enable 2FA
  await prisma.user.update({
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
router.post('/2fa/disable', authenticate, asyncHandler(async (req, res) => {
  const { code } = req.body;
  const userId = req.user!.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorSecret: true, twoFactorEnabled: true }
  });

  if (!user?.twoFactorEnabled) {
    throw new AppError('2FA is not enabled', 400);
  }

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret!,
    encoding: 'base32',
    token: code,
    window: 1
  });

  if (!verified) {
    throw new AppError('Invalid code', 400);
  }

  await prisma.user.update({
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
router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw new AppError('Refresh token required', 400);
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as any;

    if (decoded.type !== 'refresh') {
      throw new AppError('Invalid token type', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });

    if (!user || user.isBanned) {
      throw new AppError('User not found or banned', 401);
    }

    const tokens = generateTokens(user.id, user.email || '', user.role);

    res.json({
      success: true,
      data: tokens
    });
  } catch (error) {
    throw new AppError('Invalid refresh token', 401);
  }
}));

// Forgot password
router.post('/forgot-password', asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new AppError('Email is required', 400);
  }

  const user = await prisma.user.findUnique({
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
  await prisma.otpCode.create({
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
router.post('/reset-password', asyncHandler(async (req, res) => {
  const { email, code, newPassword } = req.body;

  if (!email || !code || !newPassword) {
    throw new AppError('Email, code, and new password are required', 400);
  }

  if (newPassword.length < 8) {
    throw new AppError('Password must be at least 8 characters', 400);
  }

  // Verify OTP
  const otpRecord = await prisma.otpCode.findFirst({
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
    throw new AppError('Invalid or expired code', 400);
  }

  // Mark OTP as used
  await prisma.otpCode.update({
    where: { id: otpRecord.id },
    data: { usedAt: new Date() }
  });

  // Update password
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { email },
    data: { passwordHash }
  });

  res.json({
    success: true,
    message: 'Password reset successfully'
  });
}));

// Get current user
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
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
    throw new AppError('User not found', 404);
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
router.post('/logout', authenticate, asyncHandler(async (req, res) => {
  // In a more complex setup, you might blacklist the token
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
}));

export default router;
