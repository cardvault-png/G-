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
const notification_1 = require("../services/notification");
const router = (0, express_1.Router)();
// Admin login with access code
router.post('/login', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { email, password, accessCode } = req.body;
    if (!email || !password || !accessCode) {
        throw new errorHandler_1.AppError('Email, password, and access code are required', 400);
    }
    if (accessCode !== process.env.ADMIN_ACCESS_CODE) {
        throw new errorHandler_1.AppError('Invalid access code', 401);
    }
    const user = await prisma_1.prisma.user.findUnique({
        where: { email }
    });
    if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
        throw new errorHandler_1.AppError('Invalid credentials', 401);
    }
    const isValid = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!isValid) {
        throw new errorHandler_1.AppError('Invalid credentials', 401);
    }
    // Generate tokens
    const jwt = require('jsonwebtoken');
    const accessToken = jwt.sign({ userId: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({
        success: true,
        data: {
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                role: user.role
            },
            accessToken
        }
    });
}));
// Get dashboard stats
router.get('/dashboard', auth_1.authenticate, auth_1.requireAdmin, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const [totalUsers, activeUsers, totalTransactions, totalDeposits, totalWithdrawals, pendingWithdrawals, totalGiftCards, pendingGiftCards, pendingKyc, pendingVerifications, systemRevenue] = await Promise.all([
        prisma_1.prisma.user.count(),
        prisma_1.prisma.user.count({ where: { lastLoginAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
        prisma_1.prisma.transaction.count(),
        prisma_1.prisma.transaction.aggregate({
            where: { type: 'DEPOSIT', status: 'COMPLETED' },
            _sum: { amount: true }
        }),
        prisma_1.prisma.transaction.aggregate({
            where: { type: 'WITHDRAWAL', status: 'COMPLETED' },
            _sum: { amount: true }
        }),
        prisma_1.prisma.transaction.count({ where: { type: 'WITHDRAWAL', status: 'PENDING' } }),
        prisma_1.prisma.giftCard.count(),
        prisma_1.prisma.giftCard.count({ where: { status: { in: ['PENDING', 'AI_PROCESSING', 'ADMIN_REVIEW'] } } }),
        prisma_1.prisma.user.count({ where: { kycStatus: 'PENDING' } }),
        prisma_1.prisma.giftCard.count({ where: { status: 'ADMIN_REVIEW' } }),
        prisma_1.prisma.transaction.aggregate({
            where: { status: 'COMPLETED' },
            _sum: { fee: true }
        })
    ]);
    // Get admin wallet
    const adminWallet = await prisma_1.prisma.adminWallet.findFirst({
        where: { adminId: req.user.id }
    });
    // Get recent activity
    const recentActivity = await prisma_1.prisma.auditLog.findMany({
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
                totalDeposits: totalDeposits._sum.amount || 0,
                totalWithdrawals: totalWithdrawals._sum.amount || 0,
                pendingWithdrawals,
                totalGiftCards,
                pendingGiftCards,
                pendingKyc,
                pendingVerifications,
                systemRevenue: systemRevenue._sum.fee || 0,
                adminBalance: adminWallet?.balance || 0
            },
            recentActivity
        }
    });
}));
// Get all users
router.get('/users', auth_1.authenticate, auth_1.requireAdmin, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { page = 1, limit = 20, search, status, kycStatus } = req.query;
    const where = {};
    if (search) {
        where.OR = [
            { email: { contains: search, mode: 'insensitive' } },
            { username: { contains: search, mode: 'insensitive' } },
            { fullName: { contains: search, mode: 'insensitive' } }
        ];
    }
    if (status === 'banned')
        where.isBanned = true;
    if (status === 'active')
        where.isBanned = false;
    if (kycStatus)
        where.kycStatus = kycStatus;
    const [users, total] = await Promise.all([
        prisma_1.prisma.user.findMany({
            where,
            select: {
                id: true,
                email: true,
                phone: true,
                fullName: true,
                username: true,
                role: true,
                isBanned: true,
                kycStatus: true,
                createdAt: true,
                lastLoginAt: true,
                wallets: {
                    select: { type: true, balance: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            skip: (Number(page) - 1) * Number(limit),
            take: Number(limit)
        }),
        prisma_1.prisma.user.count({ where })
    ]);
    res.json({
        success: true,
        data: {
            users,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / Number(limit))
            }
        }
    });
}));
// Get user details
router.get('/users/:id', auth_1.authenticate, auth_1.requireAdmin, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const user = await prisma_1.prisma.user.findUnique({
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
        throw new errorHandler_1.AppError('User not found', 404);
    }
    res.json({
        success: true,
        data: user
    });
}));
// Ban/unban user
router.post('/users/:id/ban', auth_1.authenticate, auth_1.requireAdmin, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const { ban, reason } = req.body;
    const user = await prisma_1.prisma.user.update({
        where: { id },
        data: {
            isBanned: ban,
            banReason: ban ? reason : null
        }
    });
    // Log admin action
    await prisma_1.prisma.adminAction.create({
        data: {
            adminId: req.user.id,
            actionType: ban ? 'BAN_USER' : 'UNBAN_USER',
            targetType: 'USER',
            targetId: id,
            reason,
            ipAddress: req.ip || 'unknown',
            userAgent: req.headers['user-agent'] || 'unknown'
        }
    });
    // Send notification
    const notificationService = new notification_1.NotificationService(req.app.get('io'));
    await notificationService.createNotification({
        userId: id,
        type: 'SECURITY',
        title: ban ? 'Account Suspended' : 'Account Restored',
        message: ban
            ? `Your account has been suspended. Reason: ${reason}`
            : 'Your account has been restored.',
        actionUrl: '/support'
    });
    res.json({
        success: true,
        message: ban ? 'User banned successfully' : 'User unbanned successfully',
        data: user
    });
}));
// Adjust user balance
router.post('/users/:id/adjust-balance', auth_1.authenticate, auth_1.requireAdmin, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const { walletType, amount, reason } = req.body;
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum === 0) {
        throw new errorHandler_1.AppError('Invalid amount', 400);
    }
    const wallet = await prisma_1.prisma.wallet.findFirst({
        where: { userId: id, type: walletType.toUpperCase() }
    });
    if (!wallet) {
        throw new errorHandler_1.AppError('Wallet not found', 404);
    }
    const oldBalance = parseFloat(wallet.balance.toString());
    const newBalance = oldBalance + amountNum;
    if (newBalance < 0) {
        throw new errorHandler_1.AppError('Adjustment would result in negative balance', 400);
    }
    const result = await prisma_1.prisma.$transaction(async (tx) => {
        // Update wallet
        const updated = await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: newBalance }
        });
        // Create transaction
        const transaction = await tx.transaction.create({
            data: {
                userId: id,
                walletId: wallet.id,
                type: 'ADMIN_ADJUSTMENT',
                status: 'COMPLETED',
                amount: Math.abs(amountNum),
                fee: 0,
                netAmount: amountNum,
                walletType: walletType.toUpperCase(),
                adminNotes: reason,
                approvedBy: req.user.id,
                completedAt: new Date()
            }
        });
        // Create ledger entry
        await tx.ledger.create({
            data: {
                userId: id,
                walletId: wallet.id,
                transactionId: transaction.id,
                [amountNum > 0 ? 'credit' : 'debit']: Math.abs(amountNum),
                balanceAfter: newBalance,
                description: `Admin adjustment: ${reason}`
            }
        });
        return { wallet: updated, transaction };
    });
    // Log admin action
    await prisma_1.prisma.adminAction.create({
        data: {
            adminId: req.user.id,
            actionType: 'ADJUST_BALANCE',
            targetType: 'WALLET',
            targetId: wallet.id,
            oldValue: oldBalance.toString(),
            newValue: newBalance.toString(),
            reason,
            ipAddress: req.ip || 'unknown',
            userAgent: req.headers['user-agent'] || 'unknown'
        }
    });
    // Send notification
    const notificationService = new notification_1.NotificationService(req.app.get('io'));
    await notificationService.createNotification({
        userId: id,
        type: 'TRANSACTION',
        title: amountNum > 0 ? 'Balance Credited' : 'Balance Debited',
        message: `Your ${walletType} wallet has been ${amountNum > 0 ? 'credited' : 'debited'} by $${Math.abs(amountNum)}.`,
        actionUrl: '/wallet'
    });
    res.json({
        success: true,
        message: 'Balance adjusted successfully',
        data: result
    });
}));
// Get pending transactions
router.get('/transactions/pending', auth_1.authenticate, auth_1.requireAdmin, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { page = 1, limit = 20, type } = req.query;
    const where = {
        status: { in: ['PENDING', 'UNDER_REVIEW'] }
    };
    if (type)
        where.type = type;
    const [transactions, total] = await Promise.all([
        prisma_1.prisma.transaction.findMany({
            where,
            include: {
                user: {
                    select: { fullName: true, email: true, username: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            skip: (Number(page) - 1) * Number(limit),
            take: Number(limit)
        }),
        prisma_1.prisma.transaction.count({ where })
    ]);
    res.json({
        success: true,
        data: {
            transactions,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / Number(limit))
            }
        }
    });
}));
// Approve/reject transaction
router.post('/transactions/:id/approve', auth_1.authenticate, auth_1.requireAdmin, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const { approve, reason } = req.body;
    const transaction = await prisma_1.prisma.transaction.findUnique({
        where: { id },
        include: { wallet: true }
    });
    if (!transaction) {
        throw new errorHandler_1.AppError('Transaction not found', 404);
    }
    if (transaction.status !== 'PENDING' && transaction.status !== 'UNDER_REVIEW') {
        throw new errorHandler_1.AppError('Transaction cannot be modified', 400);
    }
    if (approve) {
        // Approve transaction
        await prisma_1.prisma.$transaction(async (tx) => {
            // Update transaction
            await tx.transaction.update({
                where: { id },
                data: {
                    status: 'COMPLETED',
                    approvedBy: req.user.id,
                    adminNotes: reason,
                    completedAt: new Date()
                }
            });
            // For withdrawals, unfreeze and deduct
            if (transaction.type === 'WITHDRAWAL') {
                const wallet = await tx.wallet.findUnique({
                    where: { id: transaction.walletId }
                });
                const frozen = parseFloat(wallet.frozenBalance.toString());
                await tx.wallet.update({
                    where: { id: transaction.walletId },
                    data: {
                        frozenBalance: frozen - parseFloat(transaction.amount.toString())
                    }
                });
            }
        });
        // Send notification
        const notificationService = new notification_1.NotificationService(req.app.get('io'));
        await notificationService.createNotification({
            userId: transaction.userId,
            type: 'TRANSACTION',
            title: 'Transaction Approved',
            message: `Your ${transaction.type.toLowerCase()} of $${transaction.amount} has been approved.`,
            actionUrl: '/wallet/transactions'
        });
    }
    else {
        // Reject transaction
        await prisma_1.prisma.$transaction(async (tx) => {
            // Update transaction
            await tx.transaction.update({
                where: { id },
                data: {
                    status: 'REJECTED',
                    approvedBy: req.user.id,
                    adminNotes: reason
                }
            });
            // For withdrawals, return funds
            if (transaction.type === 'WITHDRAWAL') {
                const wallet = await tx.wallet.findUnique({
                    where: { id: transaction.walletId }
                });
                const balance = parseFloat(wallet.balance.toString());
                const frozen = parseFloat(wallet.frozenBalance.toString());
                await tx.wallet.update({
                    where: { id: transaction.walletId },
                    data: {
                        balance: balance + parseFloat(transaction.amount.toString()),
                        frozenBalance: frozen - parseFloat(transaction.amount.toString())
                    }
                });
            }
        });
        // Send notification
        const notificationService = new notification_1.NotificationService(req.app.get('io'));
        await notificationService.createNotification({
            userId: transaction.userId,
            type: 'TRANSACTION',
            title: 'Transaction Rejected',
            message: `Your ${transaction.type.toLowerCase()} of $${transaction.amount} has been rejected. Reason: ${reason}`,
            actionUrl: '/wallet/transactions'
        });
    }
    res.json({
        success: true,
        message: approve ? 'Transaction approved' : 'Transaction rejected'
    });
}));
// Get pending gift cards
router.get('/giftcards/pending', auth_1.authenticate, auth_1.requireAdmin, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { page = 1, limit = 20, category } = req.query;
    const where = {
        status: { in: ['PENDING', 'AI_PROCESSING', 'AI_APPROVED', 'ADMIN_REVIEW'] }
    };
    if (category)
        where.reviewCategory = category;
    const [cards, total] = await Promise.all([
        prisma_1.prisma.giftCard.findMany({
            where,
            include: {
                user: {
                    select: { fullName: true, email: true, username: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            skip: (Number(page) - 1) * Number(limit),
            take: Number(limit)
        }),
        prisma_1.prisma.giftCard.count({ where })
    ]);
    res.json({
        success: true,
        data: {
            cards,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / Number(limit))
            }
        }
    });
}));
// Approve/reject gift card
router.post('/giftcards/:id/approve', auth_1.authenticate, auth_1.requireAdmin, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const { approve, reason } = req.body;
    const giftCard = await prisma_1.prisma.giftCard.findUnique({
        where: { id }
    });
    if (!giftCard) {
        throw new errorHandler_1.AppError('Gift card not found', 404);
    }
    if (approve) {
        // Process approval
        await prisma_1.prisma.$transaction(async (tx) => {
            // Update gift card
            await tx.giftCard.update({
                where: { id },
                data: {
                    status: 'COMPLETED',
                    reviewedBy: req.user.id,
                    adminNotes: reason,
                    processedAt: new Date()
                }
            });
            // Credit user wallet
            const wallet = await tx.wallet.findFirst({
                where: { userId: giftCard.userId, type: 'USD' }
            });
            if (wallet) {
                const currentBalance = parseFloat(wallet.balance.toString());
                const newBalance = currentBalance + parseFloat(giftCard.payoutAmount.toString());
                await tx.wallet.update({
                    where: { id: wallet.id },
                    data: { balance: newBalance }
                });
                // Create transaction
                const transaction = await tx.transaction.create({
                    data: {
                        userId: giftCard.userId,
                        walletId: wallet.id,
                        type: 'GIFT_CARD_SALE',
                        status: 'COMPLETED',
                        amount: parseFloat(giftCard.payoutAmount.toString()),
                        fee: 0,
                        netAmount: parseFloat(giftCard.payoutAmount.toString()),
                        walletType: 'USD',
                        approvedBy: req.user.id,
                        completedAt: new Date()
                    }
                });
                // Create ledger entry
                await tx.ledger.create({
                    data: {
                        userId: giftCard.userId,
                        walletId: wallet.id,
                        transactionId: transaction.id,
                        credit: parseFloat(giftCard.payoutAmount.toString()),
                        balanceAfter: newBalance,
                        description: `Gift card sale approved - ${giftCard.brand}`
                    }
                });
            }
        });
        // Send notification
        const notificationService = new notification_1.NotificationService(req.app.get('io'));
        await notificationService.createNotification({
            userId: giftCard.userId,
            type: 'TRANSACTION',
            title: 'Gift Card Approved',
            message: `Your ${giftCard.brand} gift card has been approved. $${giftCard.payoutAmount} credited to your wallet.`,
            actionUrl: '/wallet'
        });
    }
    else {
        // Reject gift card
        await prisma_1.prisma.giftCard.update({
            where: { id },
            data: {
                status: 'REJECTED',
                reviewedBy: req.user.id,
                adminNotes: reason
            }
        });
        // Send notification
        const notificationService = new notification_1.NotificationService(req.app.get('io'));
        await notificationService.createNotification({
            userId: giftCard.userId,
            type: 'TRANSACTION',
            title: 'Gift Card Rejected',
            message: `Your ${giftCard.brand} gift card has been rejected. Reason: ${reason}`,
            actionUrl: '/gift-cards/my-cards'
        });
    }
    res.json({
        success: true,
        message: approve ? 'Gift card approved' : 'Gift card rejected'
    });
}));
// Get pending KYC
router.get('/kyc/pending', auth_1.authenticate, auth_1.requireAdmin, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const [users, total] = await Promise.all([
        prisma_1.prisma.user.findMany({
            where: { kycStatus: 'PENDING' },
            include: {
                kycDocuments: true
            },
            orderBy: { kycSubmittedAt: 'asc' },
            skip: (Number(page) - 1) * Number(limit),
            take: Number(limit)
        }),
        prisma_1.prisma.user.count({ where: { kycStatus: 'PENDING' } })
    ]);
    res.json({
        success: true,
        data: {
            users,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / Number(limit))
            }
        }
    });
}));
// Approve/reject KYC
router.post('/kyc/:id/approve', auth_1.authenticate, auth_1.requireAdmin, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const { approve, reason } = req.body;
    const user = await prisma_1.prisma.user.update({
        where: { id },
        data: {
            kycStatus: approve ? 'APPROVED' : 'REJECTED',
            kycApprovedAt: approve ? new Date() : null,
            kycRejectedAt: approve ? null : new Date(),
            kycRejectionReason: approve ? null : reason
        }
    });
    // Send notification
    const notificationService = new notification_1.NotificationService(req.app.get('io'));
    await notificationService.createNotification({
        userId: id,
        type: 'VERIFICATION',
        title: approve ? 'KYC Approved' : 'KYC Rejected',
        message: approve
            ? 'Your KYC verification has been approved.'
            : `Your KYC verification has been rejected. Reason: ${reason}`,
        actionUrl: '/profile/kyc'
    });
    res.json({
        success: true,
        message: approve ? 'KYC approved' : 'KYC rejected',
        data: user
    });
}));
// Get admin wallet
router.get('/wallet', auth_1.authenticate, auth_1.requireAdmin, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const adminWallet = await prisma_1.prisma.adminWallet.findFirst({
        where: { adminId: req.user.id }
    });
    if (!adminWallet) {
        // Create admin wallet if not exists
        const newWallet = await prisma_1.prisma.adminWallet.create({
            data: {
                adminId: req.user.id,
                balance: 15000
            }
        });
        return res.json({
            success: true,
            data: newWallet
        });
    }
    res.json({
        success: true,
        data: adminWallet
    });
}));
// Send funds to user
router.post('/send-funds', auth_1.authenticate, auth_1.requireAdmin, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { userId, walletType, amount, reason } = req.body;
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
        throw new errorHandler_1.AppError('Invalid amount', 400);
    }
    // Check admin wallet
    const adminWallet = await prisma_1.prisma.adminWallet.findFirst({
        where: { adminId: req.user.id }
    });
    if (!adminWallet || parseFloat(adminWallet.balance.toString()) < amountNum) {
        throw new errorHandler_1.AppError('Insufficient admin balance', 400);
    }
    // Get user wallet
    const userWallet = await prisma_1.prisma.wallet.findFirst({
        where: { userId, type: walletType.toUpperCase() }
    });
    if (!userWallet) {
        throw new errorHandler_1.AppError('User wallet not found', 404);
    }
    await prisma_1.prisma.$transaction(async (tx) => {
        // Deduct from admin wallet
        await tx.adminWallet.update({
            where: { id: adminWallet.id },
            data: {
                balance: parseFloat(adminWallet.balance.toString()) - amountNum
            }
        });
        // Credit user wallet
        const newBalance = parseFloat(userWallet.balance.toString()) + amountNum;
        await tx.wallet.update({
            where: { id: userWallet.id },
            data: { balance: newBalance }
        });
        // Create transaction
        const transaction = await tx.transaction.create({
            data: {
                userId,
                walletId: userWallet.id,
                type: 'TRANSFER_RECEIVE',
                status: 'COMPLETED',
                amount: amountNum,
                fee: 0,
                netAmount: amountNum,
                walletType: walletType.toUpperCase(),
                adminNotes: reason,
                approvedBy: req.user.id,
                completedAt: new Date()
            }
        });
        // Create ledger entry
        await tx.ledger.create({
            data: {
                userId,
                walletId: userWallet.id,
                transactionId: transaction.id,
                credit: amountNum,
                balanceAfter: newBalance,
                description: `Admin transfer: ${reason}`
            }
        });
    });
    // Send notification
    const notificationService = new notification_1.NotificationService(req.app.get('io'));
    await notificationService.createNotification({
        userId,
        type: 'TRANSACTION',
        title: 'Funds Received',
        message: `You have received $${amountNum} ${walletType} from admin.`,
        actionUrl: '/wallet'
    });
    res.json({
        success: true,
        message: 'Funds sent successfully'
    });
}));
// Broadcast message
router.post('/broadcast', auth_1.authenticate, auth_1.requireAdmin, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { title, message, actionUrl } = req.body;
    const notificationService = new notification_1.NotificationService(req.app.get('io'));
    await notificationService.sendBroadcast(title, message, actionUrl);
    res.json({
        success: true,
        message: 'Broadcast sent successfully'
    });
}));
exports.default = router;
//# sourceMappingURL=admin.js.map