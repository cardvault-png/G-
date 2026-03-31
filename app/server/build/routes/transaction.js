"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../utils/prisma");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const notification_1 = require("../services/notification");
const fraudDetection_1 = require("../services/fraudDetection");
const router = (0, express_1.Router)();
// Get all transactions
router.get('/', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { page = 1, limit = 20, status, type, startDate, endDate, minAmount, maxAmount } = req.query;
    const where = {
        userId: req.user.id
    };
    if (status)
        where.status = status;
    if (type)
        where.type = type;
    if (startDate || endDate) {
        where.createdAt = {};
        if (startDate)
            where.createdAt.gte = new Date(startDate);
        if (endDate)
            where.createdAt.lte = new Date(endDate);
    }
    if (minAmount || maxAmount) {
        where.amount = {};
        if (minAmount)
            where.amount.gte = parseFloat(minAmount);
        if (maxAmount)
            where.amount.lte = parseFloat(maxAmount);
    }
    const [transactions, total] = await Promise.all([
        prisma_1.prisma.transaction.findMany({
            where,
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
// Get transaction by ID
router.get('/:id', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const transaction = await prisma_1.prisma.transaction.findFirst({
        where: {
            id,
            userId: req.user.id
        }
    });
    if (!transaction) {
        throw new errorHandler_1.AppError('Transaction not found', 404);
    }
    res.json({
        success: true,
        data: transaction
    });
}));
// Create withdrawal request
router.post('/withdrawal', auth_1.authenticate, auth_1.requireKyc, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { walletType, amount, bankAccountId } = req.body;
    if (!walletType || !amount || !bankAccountId) {
        throw new errorHandler_1.AppError('Wallet type, amount, and bank account are required', 400);
    }
    const withdrawalAmount = parseFloat(amount);
    if (isNaN(withdrawalAmount) || withdrawalAmount <= 0) {
        throw new errorHandler_1.AppError('Invalid amount', 400);
    }
    // Get wallet
    const wallet = await prisma_1.prisma.wallet.findFirst({
        where: {
            userId: req.user.id,
            type: walletType.toUpperCase()
        }
    });
    if (!wallet) {
        throw new errorHandler_1.AppError('Wallet not found', 404);
    }
    const currentBalance = parseFloat(wallet.balance.toString());
    if (currentBalance < withdrawalAmount) {
        throw new errorHandler_1.AppError('Insufficient balance', 400);
    }
    // Get bank account
    const bankAccount = await prisma_1.prisma.bankAccount.findFirst({
        where: {
            id: bankAccountId,
            userId: req.user.id
        }
    });
    if (!bankAccount) {
        throw new errorHandler_1.AppError('Bank account not found', 404);
    }
    // Fraud detection
    const fraudService = new fraudDetection_1.FraudDetectionService();
    const fraudCheck = await fraudService.checkTransaction({
        userId: req.user.id,
        type: 'WITHDRAWAL',
        amount: withdrawalAmount,
        walletType,
        ipAddress: req.ip || 'unknown',
        deviceFingerprint: req.body.deviceFingerprint
    });
    if (fraudCheck.shouldBlock) {
        throw new errorHandler_1.AppError('Transaction blocked due to security concerns. Please contact support.', 403);
    }
    // Calculate fee (example: 1% fee)
    const fee = withdrawalAmount * 0.01;
    const netAmount = withdrawalAmount - fee;
    // Create transaction
    const transaction = await prisma_1.prisma.$transaction(async (tx) => {
        // Create withdrawal transaction
        const txn = await tx.transaction.create({
            data: {
                userId: req.user.id,
                walletId: wallet.id,
                type: 'WITHDRAWAL',
                status: fraudCheck.riskLevel === 'HIGH' ? 'UNDER_REVIEW' : 'PENDING',
                amount: withdrawalAmount,
                fee,
                netAmount,
                walletType: walletType.toUpperCase(),
                bankName: bankAccount.bankName,
                accountNumber: bankAccount.accountNumber,
                accountName: bankAccount.accountName,
                fraudScore: fraudCheck.score,
                fraudFlags: fraudCheck.flags
            }
        });
        // Freeze the amount
        await tx.wallet.update({
            where: { id: wallet.id },
            data: {
                balance: currentBalance - withdrawalAmount,
                frozenBalance: parseFloat(wallet.frozenBalance.toString()) + withdrawalAmount
            }
        });
        return txn;
    });
    // Send notification
    const notificationService = new notification_1.NotificationService(req.app.get('io'));
    await notificationService.createNotification({
        userId: req.user.id,
        type: 'TRANSACTION',
        title: 'Withdrawal Requested',
        message: `Your withdrawal request of ${withdrawalAmount} ${walletType} is pending approval.`,
        actionUrl: '/wallet/transactions'
    });
    // Notify admins
    await notificationService.sendAdminNotification('New Withdrawal Request', `User ${req.user.id} requested withdrawal of ${withdrawalAmount} ${walletType}`, { transactionId: transaction.id, userId: req.user.id });
    res.status(201).json({
        success: true,
        message: 'Withdrawal request submitted successfully',
        data: transaction
    });
}));
// Dispute transaction
router.post('/:id/dispute', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const { reason, evidence } = req.body;
    const transaction = await prisma_1.prisma.transaction.findFirst({
        where: {
            id,
            userId: req.user.id
        }
    });
    if (!transaction) {
        throw new errorHandler_1.AppError('Transaction not found', 404);
    }
    if (transaction.status === 'COMPLETED' || transaction.status === 'REVERSED') {
        throw new errorHandler_1.AppError('Cannot dispute this transaction', 400);
    }
    const updated = await prisma_1.prisma.transaction.update({
        where: { id },
        data: {
            status: 'UNDER_REVIEW',
            disputeFlag: true,
            adminNotes: `Dispute reason: ${reason}. Evidence: ${evidence || 'None provided'}`
        }
    });
    // Notify admins
    const notificationService = new notification_1.NotificationService(req.app.get('io'));
    await notificationService.sendAdminNotification('Transaction Disputed', `User ${req.user.id} disputed transaction ${id}`, { transactionId: id, reason });
    res.json({
        success: true,
        message: 'Dispute submitted successfully',
        data: updated
    });
}));
exports.default = router;
//# sourceMappingURL=transaction.js.map