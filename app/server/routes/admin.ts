import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { prisma } from '../utils/prisma';
import { authenticate, requireAdmin } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { NotificationService } from '../services/notification';

const router = Router();

// Admin JWT token generation
const generateAdminToken = (adminId: string, email: string, role: string) => {
  return jwt.sign(
    { userId: adminId, email, role, isAdmin: true },
    process.env.JWT_SECRET!,
    { expiresIn: '2h' as any }
  );
};

// Track failed login attempts
const failedAttempts = new Map<string, { count: number; lockedUntil: number | null }>();

// Check if account is locked
const isAccountLocked = (identifier: string): boolean => {
  const attempt = failedAttempts.get(identifier);
  if (attempt && attempt.lockedUntil && Date.now() < attempt.lockedUntil) {
    return true;
  }
  return false;
};

// Record failed attempt
const recordFailedAttempt = (identifier: string) => {
  const attempt = failedAttempts.get(identifier) || { count: 0, lockedUntil: null };
  attempt.count++;
  
  if (attempt.count >= 3) {
    attempt.lockedUntil = Date.now() + 5 * 60 * 1000; // 5 minutes
  }
  
  failedAttempts.set(identifier, attempt);
};

// Clear failed attempts
const clearFailedAttempts = (identifier: string) => {
  failedAttempts.delete(identifier);
};

// Admin Login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password, adminCode, twoFactorCode, deviceFingerprint } = req.body;

  // Validate required fields
  if (!email || !password || !adminCode) {
    throw new AppError('Email, password, and admin code are required', 400);
  }

  // Verify admin access code
  if (adminCode !== process.env.ADMIN_ACCESS_CODE) {
    throw new AppError('Invalid admin access code', 403);
  }

  // Check if account is locked
  if (isAccountLocked(email)) {
    const attempt = failedAttempts.get(email);
    const remainingTime = Math.ceil(((attempt?.lockedUntil || 0) - Date.now()) / 60000);
    throw new AppError(`Account locked. Try again in ${remainingTime} minutes`, 423);
  }

  // Find admin user
  const admin = await prisma.user.findFirst({
    where: {
      email,
      role: { in: ['ADMIN', 'SUPER_ADMIN'] }
    }
  });

  if (!admin) {
    recordFailedAttempt(email);
    throw new AppError('Invalid credentials', 401);
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, admin.passwordHash);
  
  if (!isValidPassword) {
    recordFailedAttempt(email);
    
    // Log failed attempt
    await prisma.loginAttempt.create({
      data: {
        userId: admin.id,
        email: admin.email,
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
  if (admin.twoFactorEnabled) {
    if (!twoFactorCode) {
      return res.json({
        success: true,
        requiresTwoFactor: true,
        adminId: admin.id
      });
    }

    const verified = speakeasy.totp.verify({
      secret: admin.twoFactorSecret!,
      encoding: 'base32',
      token: twoFactorCode,
      window: 1
    });

    if (!verified) {
      throw new AppError('Invalid 2FA code', 401);
    }
  }

  // Clear failed attempts
  clearFailedAttempts(email);

  // Update last login
  await prisma.user.update({
    where: { id: admin.id },
    data: {
      lastLoginAt: new Date(),
      lastLoginIp: req.ip || 'unknown',
      deviceFingerprint
    }
  });

  // Log successful login
  await prisma.loginAttempt.create({
    data: {
      userId: admin.id,
      email: admin.email,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      deviceFingerprint,
      success: true
    }
  });

  // Generate token
  const token = generateAdminToken(admin.id, admin.email || '', admin.role);

  res.json({
    success: true,
    message: 'Admin login successful',
    data: {
      admin: {
        id: admin.id,
        email: admin.email,
        fullName: admin.fullName,
        role: admin.role,
        twoFactorEnabled: admin.twoFactorEnabled
      },
      token
    }
  });
}));

// Setup 2FA for admin
router.post('/2fa/setup', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const adminId = req.user!.id;

  const secret = speakeasy.generateSecret({
    name: `GiftCard Pro Admin (${req.user!.email})`
  });

  await prisma.user.update({
    where: { id: adminId },
    data: { twoFactorSecret: secret.base32 }
  });

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
router.post('/2fa/verify', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { code } = req.body;
  const adminId = req.user!.id;

  const admin = await prisma.user.findUnique({
    where: { id: adminId },
    select: { twoFactorSecret: true }
  });

  if (!admin?.twoFactorSecret) {
    throw new AppError('2FA not set up', 400);
  }

  const verified = speakeasy.totp.verify({
    secret: admin.twoFactorSecret,
    encoding: 'base32',
    token: code,
    window: 1
  });

  if (!verified) {
    throw new AppError('Invalid code', 400);
  }

  await prisma.user.update({
    where: { id: adminId },
    data: { twoFactorEnabled: true }
  });

  res.json({
    success: true,
    message: '2FA enabled successfully'
  });
}));

// Get admin dashboard stats
router.get('/dashboard/stats', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const [
    totalUsers,
    activeUsers,
    totalTransactions,
    pendingTransactions,
    totalGiftCards,
    pendingGiftCards,
    totalDeposits,
    totalWithdrawals,
    adminWallet
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { lastLoginAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }),
    prisma.transaction.count(),
    prisma.transaction.count({ where: { status: 'PENDING' } }),
    prisma.giftCard.count(),
    prisma.giftCard.count({ where: { status: 'PENDING' } }),
    prisma.transaction.aggregate({
      where: { type: 'DEPOSIT', status: 'COMPLETED' },
      _sum: { amount: true }
    }),
    prisma.transaction.aggregate({
      where: { type: 'WITHDRAWAL', status: 'COMPLETED' },
      _sum: { amount: true }
    }),
    prisma.adminWallet.findFirst({
      where: { adminId: req.user!.id }
    })
  ]);

  // Get recent activity
  const recentActivity = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      user: {
        select: { fullName: true, email: true }
      }
    }
  });

  res.json({
    success: true,
    data: {
      stats: {
        totalUsers,
        activeUsers,
        totalTransactions,
        pendingTransactions,
        totalGiftCards,
        pendingGiftCards,
        totalDeposits: totalDeposits._sum.amount || 0,
        totalWithdrawals: totalWithdrawals._sum.amount || 0,
        adminBalance: adminWallet?.balance || 0
      },
      recentActivity
    }
  });
}));

// Get all users with filters
router.get('/users', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { 
    page = '1', 
    limit = '20', 
    search, 
    role, 
    kycStatus, 
    isBanned,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const where: any = {};
  
  if (search) {
    where.OR = [
      { email: { contains: search as string, mode: 'insensitive' } },
      { username: { contains: search as string, mode: 'insensitive' } },
      { fullName: { contains: search as string, mode: 'insensitive' } }
    ];
  }
  
  if (role) where.role = role;
  if (kycStatus) where.kycStatus = kycStatus;
  if (isBanned !== undefined) where.isBanned = isBanned === 'true';

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        phone: true,
        fullName: true,
        username: true,
        role: true,
        kycStatus: true,
        isBanned: true,
        twoFactorEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        _count: {
          select: {
            transactions: true,
            giftCards: true
          }
        }
      },
      orderBy: { [sortBy as string]: sortOrder },
      skip,
      take: limitNum
    }),
    prisma.user.count({ where })
  ]);

  res.json({
    success: true,
    data: {
      users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    }
  });
}));

// Get single user details
router.get('/users/:id', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      wallets: true,
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 10
      },
      giftCards: {
        orderBy: { createdAt: 'desc' },
        take: 10
      },
      kycDocuments: true,
      loginAttempts: {
        orderBy: { createdAt: 'desc' },
        take: 10
      }
    }
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  res.json({
    success: true,
    data: { user }
  });
}));

// Ban/Unban user
router.post('/users/:id/ban', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isBanned, reason } = req.body;

  const user = await prisma.user.findUnique({ where: { id } });
  
  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (user.role === 'SUPER_ADMIN') {
    throw new AppError('Cannot ban super admin', 403);
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: { 
      isBanned, 
      banReason: isBanned ? reason : null 
    }
  });

  // Log admin action
  await prisma.adminAction.create({
    data: {
      adminId: req.user!.id,
      actionType: isBanned ? 'BAN' : 'UNBAN',
      targetType: 'USER',
      targetId: id,
      oldValue: JSON.stringify({ isBanned: user.isBanned }),
      newValue: JSON.stringify({ isBanned, reason }),
      reason,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    }
  });

  // Notify user
  await NotificationService.sendNotification({
    userId: id,
    type: 'SECURITY',
    title: isBanned ? 'Account Suspended' : 'Account Restored',
    message: isBanned 
      ? `Your account has been suspended. Reason: ${reason}` 
      : 'Your account has been restored. You can now access the platform.',
  });

  res.json({
    success: true,
    message: `User ${isBanned ? 'banned' : 'unbanned'} successfully`,
    data: { user: updatedUser }
  });
}));

// Adjust user balance
router.post('/users/:id/balance', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { walletType, amount, reason, operation } = req.body;

  if (!walletType || amount === undefined || !reason || !operation) {
    throw new AppError('Wallet type, amount, reason, and operation are required', 400);
  }

  const user = await prisma.user.findUnique({ where: { id } });
  
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const wallet = await prisma.wallet.findFirst({
    where: { userId: id, type: walletType as any }
  });

  if (!wallet) {
    throw new AppError('Wallet not found', 404);
  }

  const oldBalance = parseFloat(wallet.balance.toString());
  const adjustmentAmount = parseFloat(amount);
  const newBalance = operation === 'ADD' 
    ? oldBalance + adjustmentAmount 
    : oldBalance - adjustmentAmount;

  if (operation === 'SUBTRACT' && newBalance < 0) {
    throw new AppError('Insufficient balance for subtraction', 400);
  }

  // Update wallet
  const updatedWallet = await prisma.wallet.update({
    where: { id: wallet.id },
    data: { balance: newBalance }
  });

  // Create transaction record
  const transaction = await prisma.transaction.create({
    data: {
      userId: id,
      walletId: wallet.id,
      type: operation === 'ADD' ? 'ADMIN_ADJUSTMENT' : 'ADMIN_DEDUCTION',
      status: 'COMPLETED',
      amount: adjustmentAmount,
      fee: 0,
      netAmount: adjustmentAmount,
      walletType: walletType as any,
      adminNotes: reason,
      approvedBy: req.user!.id,
      completedAt: new Date()
    }
  });

  // Log admin action
  await prisma.adminAction.create({
    data: {
      adminId: req.user!.id,
      actionType: 'BALANCE_ADJUSTMENT',
      targetType: 'USER',
      targetId: id,
      oldValue: JSON.stringify({ balance: oldBalance }),
      newValue: JSON.stringify({ balance: newBalance }),
      reason,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    }
  });

  // Notify user
  await NotificationService.sendNotification({
    userId: id,
    type: 'TRANSACTION',
    title: operation === 'ADD' ? 'Balance Credited' : 'Balance Debited',
    message: `Your ${walletType} balance has been ${operation === 'ADD' ? 'credited' : 'debited'} by ${adjustmentAmount}. Reason: ${reason}`,
  });

  res.json({
    success: true,
    message: 'Balance adjusted successfully',
    data: { wallet: updatedWallet, transaction }
  });
}));

// Get all transactions with filters
router.get('/transactions', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const {
    page = '1',
    limit = '20',
    status,
    type,
    userId,
    startDate,
    endDate,
    minAmount,
    maxAmount,
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const where: any = {};

  if (status) where.status = status;
  if (type) where.type = type;
  if (userId) where.userId = userId;
  if (minAmount) where.amount = { gte: parseFloat(minAmount as string) };
  if (maxAmount) where.amount = { ...where.amount, lte: parseFloat(maxAmount as string) };
  
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate as string);
    if (endDate) where.createdAt.lte = new Date(endDate as string);
  }

  if (search) {
    where.OR = [
      { referenceCode: { contains: search as string, mode: 'insensitive' } },
      { blockchainHash: { contains: search as string, mode: 'insensitive' } },
      { bankReference: { contains: search as string, mode: 'insensitive' } }
    ];
  }

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        user: {
          select: { fullName: true, email: true, username: true }
        },
        wallet: {
          select: { type: true }
        }
      },
      orderBy: { [sortBy as string]: sortOrder },
      skip,
      take: limitNum
    }),
    prisma.transaction.count({ where })
  ]);

  res.json({
    success: true,
    data: {
      transactions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    }
  });
}));

// Approve/Reject transaction
router.post('/transactions/:id/approve', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;

  if (!['COMPLETED', 'REJECTED'].includes(status)) {
    throw new AppError('Invalid status', 400);
  }

  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: { wallet: true }
  });

  if (!transaction) {
    throw new AppError('Transaction not found', 404);
  }

  if (transaction.status !== 'PENDING' && transaction.status !== 'PROCESSING') {
    throw new AppError('Transaction cannot be modified', 400);
  }

  const oldStatus = transaction.status;

  // Update transaction
  const updatedTransaction = await prisma.transaction.update({
    where: { id },
    data: {
      status: status as any,
      adminNotes: notes,
      approvedBy: req.user!.id,
      completedAt: status === 'COMPLETED' ? new Date() : null
    }
  });

  // If completing, update wallet balance
  if (status === 'COMPLETED' && transaction.type === 'DEPOSIT') {
    const currentBalance = parseFloat(transaction.wallet.balance.toString());
    await prisma.wallet.update({
      where: { id: transaction.walletId },
      data: { balance: currentBalance + parseFloat(transaction.netAmount.toString()) }
    });
  }

  // Log admin action
  await prisma.adminAction.create({
    data: {
      adminId: req.user!.id,
      actionType: status === 'COMPLETED' ? 'APPROVE_TRANSACTION' : 'REJECT_TRANSACTION',
      targetType: 'TRANSACTION',
      targetId: id,
      oldValue: JSON.stringify({ status: oldStatus }),
      newValue: JSON.stringify({ status, notes }),
      reason: notes,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    }
  });

  // Notify user
  await NotificationService.sendNotification({
    userId: transaction.userId,
    type: 'TRANSACTION',
    title: status === 'COMPLETED' ? 'Transaction Approved' : 'Transaction Rejected',
    message: `Your ${transaction.type} of ${transaction.amount} has been ${status.toLowerCase()}. ${notes || ''}`,
  });

  res.json({
    success: true,
    message: `Transaction ${status.toLowerCase()} successfully`,
    data: { transaction: updatedTransaction }
  });
}));

// Reverse transaction
router.post('/transactions/:id/reverse', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason) {
    throw new AppError('Reason is required for reversal', 400);
  }

  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: { wallet: true }
  });

  if (!transaction) {
    throw new AppError('Transaction not found', 404);
  }

  if (transaction.status !== 'COMPLETED') {
    throw new AppError('Only completed transactions can be reversed', 400);
  }

  // Reverse the transaction
  const updatedTransaction = await prisma.transaction.update({
    where: { id },
    data: {
      status: 'REVERSED',
      adminNotes: reason,
      reversedAt: new Date()
    }
  });

  // Reverse wallet balance
  const currentBalance = parseFloat(transaction.wallet.balance.toString());
  const reversalAmount = parseFloat(transaction.netAmount.toString());
  await prisma.wallet.update({
    where: { id: transaction.walletId },
    data: { balance: currentBalance - reversalAmount }
  });

  // Create reversal transaction record
  await prisma.transaction.create({
    data: {
      userId: transaction.userId,
      walletId: transaction.walletId,
      type: 'REVERSAL',
      status: 'COMPLETED',
      amount: reversalAmount,
      fee: 0,
      netAmount: reversalAmount,
      walletType: transaction.walletType,
      adminNotes: `Reversal of transaction ${id}. Reason: ${reason}`,
      approvedBy: req.user!.id,
      completedAt: new Date()
    }
  });

  // Log admin action
  await prisma.adminAction.create({
    data: {
      adminId: req.user!.id,
      actionType: 'REVERSE_TRANSACTION',
      targetType: 'TRANSACTION',
      targetId: id,
      oldValue: JSON.stringify({ status: 'COMPLETED', balance: currentBalance }),
      newValue: JSON.stringify({ status: 'REVERSED', balance: currentBalance - reversalAmount }),
      reason,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    }
  });

  // Notify user
  await NotificationService.sendNotification({
    userId: transaction.userId,
    type: 'TRANSACTION',
    title: 'Transaction Reversed',
    message: `Your transaction of ${transaction.amount} has been reversed. Reason: ${reason}`,
  });

  res.json({
    success: true,
    message: 'Transaction reversed successfully',
    data: { transaction: updatedTransaction }
  });
}));

// Get all gift cards with filters
router.get('/giftcards', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const {
    page = '1',
    limit = '20',
    status,
    userId,
    brand,
    minFraudScore,
    reviewCategory,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const where: any = {};

  if (status) where.status = status;
  if (userId) where.userId = userId;
  if (brand) where.brand = brand;
  if (reviewCategory) where.reviewCategory = reviewCategory;
  if (minFraudScore) where.fraudScore = { gte: parseInt(minFraudScore as string) };

  const [giftCards, total] = await Promise.all([
    prisma.giftCard.findMany({
      where,
      include: {
        user: {
          select: { fullName: true, email: true, username: true }
        }
      },
      orderBy: { [sortBy as string]: sortOrder },
      skip,
      take: limitNum
    }),
    prisma.giftCard.count({ where })
  ]);

  res.json({
    success: true,
    data: {
      giftCards,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    }
  });
}));

// Get single gift card details
router.get('/giftcards/:id', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const giftCard = await prisma.giftCard.findUnique({
    where: { id },
    include: {
      user: {
        select: { 
          fullName: true, 
          email: true, 
          username: true,
          lastLoginIp: true,
          deviceFingerprint: true
        }
      }
    }
  });

  if (!giftCard) {
    throw new AppError('Gift card not found', 404);
  }

  res.json({
    success: true,
    data: { giftCard }
  });
}));

// Approve/Reject gift card
router.post('/giftcards/:id/review', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, notes, reviewCategory } = req.body;

  if (!['APPROVED', 'REJECTED'].includes(status)) {
    throw new AppError('Invalid status', 400);
  }

  const giftCard = await prisma.giftCard.findUnique({
    where: { id },
    include: { user: { include: { wallets: true } } }
  });

  if (!giftCard) {
    throw new AppError('Gift card not found', 404);
  }

  if (giftCard.status === 'COMPLETED' || giftCard.status === 'REJECTED') {
    throw new AppError('Gift card has already been processed', 400);
  }

  const oldStatus = giftCard.status;

  // Update gift card
  const updatedGiftCard = await prisma.giftCard.update({
    where: { id },
    data: {
      status: status as any,
      adminNotes: notes,
      reviewedBy: req.user!.id,
      reviewCategory: reviewCategory || giftCard.reviewCategory,
      processedAt: new Date()
    }
  });

  // If approved, credit user wallet
  if (status === 'APPROVED') {
    const usdtWallet = giftCard.user.wallets.find(w => w.type === 'USDT');
    if (usdtWallet) {
      const currentBalance = parseFloat(usdtWallet.balance.toString());
      await prisma.wallet.update({
        where: { id: usdtWallet.id },
        data: { balance: currentBalance + parseFloat(giftCard.payoutAmount.toString()) }
      });

      // Create transaction record
      await prisma.transaction.create({
        data: {
          userId: giftCard.userId,
          walletId: usdtWallet.id,
          type: 'GIFT_CARD_SALE',
          status: 'COMPLETED',
          amount: parseFloat(giftCard.payoutAmount.toString()),
          fee: 0,
          netAmount: parseFloat(giftCard.payoutAmount.toString()),
          walletType: 'USDT',
          adminNotes: `Gift card sale: ${giftCard.brand} ${giftCard.cardValue}`,
          approvedBy: req.user!.id,
          completedAt: new Date()
        }
      });
    }
  }

  // Log admin action
  await prisma.adminAction.create({
    data: {
      adminId: req.user!.id,
      actionType: status === 'APPROVED' ? 'APPROVE_GIFT_CARD' : 'REJECT_GIFT_CARD',
      targetType: 'GIFT_CARD',
      targetId: id,
      oldValue: JSON.stringify({ status: oldStatus }),
      newValue: JSON.stringify({ status, notes, reviewCategory }),
      reason: notes,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    }
  });

  // Notify user
  await NotificationService.sendNotification({
    userId: giftCard.userId,
    type: 'TRANSACTION',
    title: status === 'APPROVED' ? 'Gift Card Approved' : 'Gift Card Rejected',
    message: `Your ${giftCard.brand} gift card of $${giftCard.cardValue} has been ${status.toLowerCase()}. ${notes || ''}`,
  });

  res.json({
    success: true,
    message: `Gift card ${status.toLowerCase()} successfully`,
    data: { giftCard: updatedGiftCard }
  });
}));

// Override AI decision
router.post('/giftcards/:id/override', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { newStatus, reason } = req.body;

  if (!['APPROVED', 'REJECTED', 'ADMIN_REVIEW'].includes(newStatus)) {
    throw new AppError('Invalid status', 400);
  }

  const giftCard = await prisma.giftCard.findUnique({ where: { id } });

  if (!giftCard) {
    throw new AppError('Gift card not found', 404);
  }

  const oldStatus = giftCard.status;

  const updatedGiftCard = await prisma.giftCard.update({
    where: { id },
    data: {
      status: newStatus as any,
      adminNotes: `AI override: ${reason}`,
      reviewedBy: req.user!.id
    }
  });

  // Log admin action
  await prisma.adminAction.create({
    data: {
      adminId: req.user!.id,
      actionType: 'OVERRIDE_AI_DECISION',
      targetType: 'GIFT_CARD',
      targetId: id,
      oldValue: JSON.stringify({ status: oldStatus }),
      newValue: JSON.stringify({ status: newStatus }),
      reason,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    }
  });

  res.json({
    success: true,
    message: 'AI decision overridden successfully',
    data: { giftCard: updatedGiftCard }
  });
}));

// Get admin action logs
router.get('/audit-logs', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const {
    page = '1',
    limit = '20',
    adminId,
    actionType,
    targetType,
    startDate,
    endDate
  } = req.query;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const where: any = {};

  if (adminId) where.adminId = adminId;
  if (actionType) where.actionType = actionType;
  if (targetType) where.targetType = targetType;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate as string);
    if (endDate) where.createdAt.lte = new Date(endDate as string);
  }

  const [logs, total] = await Promise.all([
    prisma.adminAction.findMany({
      where,
      include: {
        admin: {
          select: { fullName: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum
    }),
    prisma.adminAction.count({ where })
  ]);

  res.json({
    success: true,
    data: {
      logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    }
  });
}));

// Get admin wallet info
router.get('/wallet', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const adminWallet = await prisma.adminWallet.findFirst({
    where: { adminId: req.user!.id }
  });

  if (!adminWallet) {
    // Create default admin wallet
    const newWallet = await prisma.adminWallet.create({
      data: {
        adminId: req.user!.id,
        balance: 15000,
        autoRefillEnabled: true,
        autoRefillAmount: 200
      }
    });
    
    return res.json({
      success: true,
      data: { wallet: newWallet }
    });
  }

  res.json({
    success: true,
    data: { wallet: adminWallet }
  });
}));

// Send funds to user (from admin wallet)
router.post('/send-funds', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { userId, walletType, amount, reason, fromWallet = 'main' } = req.body;

  if (!userId || !walletType || !amount || !reason) {
    throw new AppError('User ID, wallet type, amount, and reason are required', 400);
  }

  const sendAmount = parseFloat(amount);
  if (isNaN(sendAmount) || sendAmount <= 0) {
    throw new AppError('Invalid amount', 400);
  }

  // Get admin wallet
  const adminWallet = await prisma.adminWallet.findFirst({
    where: { adminId: req.user!.id }
  });

  if (!adminWallet) {
    throw new AppError('Admin wallet not found', 404);
  }

  const adminBalance = parseFloat(adminWallet.balance.toString());
  if (adminBalance < sendAmount) {
    throw new AppError('Insufficient admin wallet balance', 400);
  }

  // Get user wallet
  const userWallet = await prisma.wallet.findFirst({
    where: { userId, type: walletType as any }
  });

  if (!userWallet) {
    throw new AppError('User wallet not found', 404);
  }

  // Deduct from admin wallet
  await prisma.adminWallet.update({
    where: { id: adminWallet.id },
    data: { balance: adminBalance - sendAmount }
  });

  // Credit user wallet
  const userBalance = parseFloat(userWallet.balance.toString());
  await prisma.wallet.update({
    where: { id: userWallet.id },
    data: { balance: userBalance + sendAmount }
  });

  // Create transaction record
  const transaction = await prisma.transaction.create({
    data: {
      userId,
      walletId: userWallet.id,
      type: 'ADMIN_ADJUSTMENT',
      status: 'COMPLETED',
      amount: sendAmount,
      fee: 0,
      netAmount: sendAmount,
      walletType: walletType as any,
      adminNotes: `Admin gift: ${reason}`,
      approvedBy: req.user!.id,
      completedAt: new Date()
    }
  });

  // Log admin action
  await prisma.adminAction.create({
    data: {
      adminId: req.user!.id,
      actionType: 'SEND_FUNDS',
      targetType: 'USER',
      targetId: userId,
      oldValue: JSON.stringify({ userBalance, adminBalance }),
      newValue: JSON.stringify({ 
        userBalance: userBalance + sendAmount, 
        adminBalance: adminBalance - sendAmount 
      }),
      reason,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    }
  });

  // Notify user
  await NotificationService.sendNotification({
    userId,
    type: 'TRANSACTION',
    title: 'Funds Received',
    message: `You have received ${sendAmount} ${walletType}. Reason: ${reason}`,
  });

  res.json({
    success: true,
    message: 'Funds sent successfully',
    data: { transaction }
  });
}));

// Get system settings
router.get('/settings', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const settings = await prisma.systemSetting.findMany();
  
  res.json({
    success: true,
    data: { settings }
  });
}));

// Update system setting
router.post('/settings', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { key, value, description } = req.body;

  if (!key || value === undefined) {
    throw new AppError('Key and value are required', 400);
  }

  const oldSetting = await prisma.systemSetting.findUnique({ where: { key } });

  const setting = await prisma.systemSetting.upsert({
    where: { key },
    update: { value, updatedBy: req.user!.id },
    create: { key, value, description, updatedBy: req.user!.id }
  });

  // Log admin action
  await prisma.adminAction.create({
    data: {
      adminId: req.user!.id,
      actionType: 'UPDATE_SETTING',
      targetType: 'SYSTEM',
      targetId: key,
      oldValue: JSON.stringify({ value: oldSetting?.value }),
      newValue: JSON.stringify({ value }),
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    }
  });

  res.json({
    success: true,
    message: 'Setting updated successfully',
    data: { setting }
  });
}));

// Get pending appeals
router.get('/appeals', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { status = 'PENDING', page = '1', limit = '20' } = req.query;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const [appeals, total] = await Promise.all([
    prisma.appeal.findMany({
      where: { status: status as string },
      include: {
        user: {
          select: { fullName: true, email: true, username: true, isBanned: true, banReason: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum
    }),
    prisma.appeal.count({ where: { status: status as string } })
  ]);

  res.json({
    success: true,
    data: {
      appeals,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    }
  });
}));

// Review appeal
router.post('/appeals/:id/review', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;

  if (!['APPROVED', 'REJECTED'].includes(status)) {
    throw new AppError('Invalid status', 400);
  }

  const appeal = await prisma.appeal.findUnique({
    where: { id },
    include: { user: true }
  });

  if (!appeal) {
    throw new AppError('Appeal not found', 404);
  }

  if (appeal.status !== 'PENDING') {
    throw new AppError('Appeal has already been reviewed', 400);
  }

  // Update appeal
  const updatedAppeal = await prisma.appeal.update({
    where: { id },
    data: {
      status: status as string,
      adminNotes: notes,
      reviewedBy: req.user!.id,
      reviewedAt: new Date()
    }
  });

  // If approved, unban user
  if (status === 'APPROVED') {
    await prisma.user.update({
      where: { id: appeal.userId },
      data: { isBanned: false, banReason: null }
    });
  }

  // Log admin action
  await prisma.adminAction.create({
    data: {
      adminId: req.user!.id,
      actionType: status === 'APPROVED' ? 'APPROVE_APPEAL' : 'REJECT_APPEAL',
      targetType: 'APPEAL',
      targetId: id,
      oldValue: JSON.stringify({ status: 'PENDING' }),
      newValue: JSON.stringify({ status, notes }),
      reason: notes,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    }
  });

  // Notify user
  await NotificationService.sendNotification({
    userId: appeal.userId,
    type: 'SECURITY',
    title: status === 'APPROVED' ? 'Appeal Approved' : 'Appeal Rejected',
    message: status === 'APPROVED' 
      ? 'Your appeal has been approved. Your account has been restored.' 
      : `Your appeal has been rejected. ${notes || ''}`,
  });

  res.json({
    success: true,
    message: `Appeal ${status.toLowerCase()} successfully`,
    data: { appeal: updatedAppeal }
  });
}));

export default router;
