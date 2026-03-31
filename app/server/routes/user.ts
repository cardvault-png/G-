import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma';
import { authenticate, requireKyc } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';

const router = Router();

// Get user profile
router.get('/profile', authenticate, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: {
      wallets: true,
      _count: {
        select: {
          transactions: true,
          giftCards: true,
          notifications: {
            where: { isRead: false }
          }
        }
      }
    }
  });

  res.json({
    success: true,
    data: user
  });
}));

// Update profile
router.patch('/profile', authenticate, asyncHandler(async (req, res) => {
  const { fullName, phone } = req.body;

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      fullName,
      phone
    }
  });

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: user
  });
}));

// Change password
router.post('/change-password', authenticate, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await prisma.user.findUnique({
    where: { id: req.user!.id }
  });

  const isValid = await bcrypt.compare(currentPassword, user!.passwordHash);
  if (!isValid) {
    throw new AppError('Current password is incorrect', 400);
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { passwordHash: newHash }
  });

  res.json({
    success: true,
    message: 'Password changed successfully'
  });
}));

// Get user statistics
router.get('/stats', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user!.id;

  const [
    totalTransactions,
    totalDeposits,
    totalWithdrawals,
    totalGiftCards,
    pendingGiftCards
  ] = await Promise.all([
    prisma.transaction.count({ where: { userId } }),
    prisma.transaction.aggregate({
      where: { userId, type: 'DEPOSIT', status: 'COMPLETED' },
      _sum: { amount: true }
    }),
    prisma.transaction.aggregate({
      where: { userId, type: 'WITHDRAWAL', status: 'COMPLETED' },
      _sum: { amount: true }
    }),
    prisma.giftCard.count({ where: { userId } }),
    prisma.giftCard.count({ where: { userId, status: { in: ['PENDING', 'ADMIN_REVIEW'] } } })
  ]);

  res.json({
    success: true,
    data: {
      totalTransactions,
      totalDeposits: totalDeposits._sum.amount || 0,
      totalWithdrawals: totalWithdrawals._sum.amount || 0,
      totalGiftCards,
      pendingGiftCards
    }
  });
}));

// Get referral info
router.get('/referral', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user!.id;

  const [referrals, referralEarnings] = await Promise.all([
    prisma.user.findMany({
      where: { referredBy: userId },
      select: {
        id: true,
        username: true,
        createdAt: true
      }
    }),
    prisma.transaction.aggregate({
      where: { userId, type: 'TRANSFER_RECEIVE' },
      _sum: { amount: true }
    })
  ]);

  res.json({
    success: true,
    data: {
      referralCode: req.user!.id, // This would be the actual referral code
      totalReferrals: referrals.length,
      referrals,
      earnings: referralEarnings._sum.amount || 0
    }
  });
}));

export default router;
