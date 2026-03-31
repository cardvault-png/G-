"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = require("../utils/prisma");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const router = (0, express_1.Router)();
// Get user profile
router.get('/profile', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: req.user.id },
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
router.patch('/profile', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { fullName, phone } = req.body;
    const user = await prisma_1.prisma.user.update({
        where: { id: req.user.id },
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
router.post('/change-password', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: req.user.id }
    });
    const isValid = await bcryptjs_1.default.compare(currentPassword, user.passwordHash);
    if (!isValid) {
        throw new errorHandler_1.AppError('Current password is incorrect', 400);
    }
    const newHash = await bcryptjs_1.default.hash(newPassword, 12);
    await prisma_1.prisma.user.update({
        where: { id: req.user.id },
        data: { passwordHash: newHash }
    });
    res.json({
        success: true,
        message: 'Password changed successfully'
    });
}));
// Get user statistics
router.get('/stats', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const [totalTransactions, totalDeposits, totalWithdrawals, totalGiftCards, pendingGiftCards] = await Promise.all([
        prisma_1.prisma.transaction.count({ where: { userId } }),
        prisma_1.prisma.transaction.aggregate({
            where: { userId, type: 'DEPOSIT', status: 'COMPLETED' },
            _sum: { amount: true }
        }),
        prisma_1.prisma.transaction.aggregate({
            where: { userId, type: 'WITHDRAWAL', status: 'COMPLETED' },
            _sum: { amount: true }
        }),
        prisma_1.prisma.giftCard.count({ where: { userId } }),
        prisma_1.prisma.giftCard.count({ where: { userId, status: { in: ['PENDING', 'ADMIN_REVIEW'] } } })
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
router.get('/referral', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const [referrals, referralEarnings] = await Promise.all([
        prisma_1.prisma.user.findMany({
            where: { referredBy: userId },
            select: {
                id: true,
                username: true,
                createdAt: true
            }
        }),
        prisma_1.prisma.transaction.aggregate({
            where: { userId, type: 'TRANSFER_RECEIVE' },
            _sum: { amount: true }
        })
    ]);
    res.json({
        success: true,
        data: {
            referralCode: req.user.id, // This would be the actual referral code
            totalReferrals: referrals.length,
            referrals,
            earnings: referralEarnings._sum.amount || 0
        }
    });
}));
exports.default = router;
//# sourceMappingURL=user.js.map