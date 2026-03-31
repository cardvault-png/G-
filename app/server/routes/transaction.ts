import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { authenticate, requireKyc } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { NotificationService } from '../services/notification';
import { FraudDetectionService } from '../services/fraudDetection';

const router = Router();

// Get all transactions
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    limit = 20, 
    status, 
    type, 
    startDate, 
    endDate,
    minAmount,
    maxAmount
  } = req.query;

  const where: any = {
    userId: req.user!.id
  };

  if (status) where.status = status;
  if (type) where.type = type;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate as string);
    if (endDate) where.createdAt.lte = new Date(endDate as string);
  }
  if (minAmount || maxAmount) {
    where.amount = {};
    if (minAmount) where.amount.gte = parseFloat(minAmount as string);
    if (maxAmount) where.amount.lte = parseFloat(maxAmount as string);
  }

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit)
    }),
    prisma.transaction.count({ where })
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
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const transaction = await prisma.transaction.findFirst({
    where: {
      id,
      userId: req.user!.id
    }
  });

  if (!transaction) {
    throw new AppError('Transaction not found', 404);
  }

  res.json({
    success: true,
    data: transaction
  });
}));

// Create withdrawal request
router.post('/withdrawal', authenticate, requireKyc, asyncHandler(async (req, res) => {
  const { walletType, amount, bankAccountId } = req.body;

  if (!walletType || !amount || !bankAccountId) {
    throw new AppError('Wallet type, amount, and bank account are required', 400);
  }

  const withdrawalAmount = parseFloat(amount);
  if (isNaN(withdrawalAmount) || withdrawalAmount <= 0) {
    throw new AppError('Invalid amount', 400);
  }

  // Get wallet
  const wallet = await prisma.wallet.findFirst({
    where: {
      userId: req.user!.id,
      type: walletType.toUpperCase()
    }
  });

  if (!wallet) {
    throw new AppError('Wallet not found', 404);
  }

  const currentBalance = parseFloat(wallet.balance.toString());
  if (currentBalance < withdrawalAmount) {
    throw new AppError('Insufficient balance', 400);
  }

  // Get bank account
  const bankAccount = await prisma.bankAccount.findFirst({
    where: {
      id: bankAccountId,
      userId: req.user!.id
    }
  });

  if (!bankAccount) {
    throw new AppError('Bank account not found', 404);
  }

  // Fraud detection
  const fraudService = new FraudDetectionService();
  const fraudCheck = await fraudService.checkTransaction({
    userId: req.user!.id,
    type: 'WITHDRAWAL',
    amount: withdrawalAmount,
    walletType,
    ipAddress: req.ip || 'unknown',
    deviceFingerprint: req.body.deviceFingerprint
  });

  if (fraudCheck.shouldBlock) {
    throw new AppError('Transaction blocked due to security concerns. Please contact support.', 403);
  }

  // Calculate fee (example: 1% fee)
  const fee = withdrawalAmount * 0.01;
  const netAmount = withdrawalAmount - fee;

  // Create transaction
  const transaction = await prisma.$transaction(async (tx) => {
    // Create withdrawal transaction
    const txn = await tx.transaction.create({
      data: {
        userId: req.user!.id,
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
  const notificationService = new NotificationService(req.app.get('io'));
  await notificationService.createNotification({
    userId: req.user!.id,
    type: 'TRANSACTION',
    title: 'Withdrawal Requested',
    message: `Your withdrawal request of ${withdrawalAmount} ${walletType} is pending approval.`,
    actionUrl: '/wallet/transactions'
  });

  // Notify admins
  await notificationService.sendAdminNotification(
    'New Withdrawal Request',
    `User ${req.user!.id} requested withdrawal of ${withdrawalAmount} ${walletType}`,
    { transactionId: transaction.id, userId: req.user!.id }
  );

  res.status(201).json({
    success: true,
    message: 'Withdrawal request submitted successfully',
    data: transaction
  });
}));

// Dispute transaction
router.post('/:id/dispute', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason, evidence } = req.body;

  const transaction = await prisma.transaction.findFirst({
    where: {
      id,
      userId: req.user!.id
    }
  });

  if (!transaction) {
    throw new AppError('Transaction not found', 404);
  }

  if (transaction.status === 'COMPLETED' || transaction.status === 'REVERSED') {
    throw new AppError('Cannot dispute this transaction', 400);
  }

  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      status: 'UNDER_REVIEW',
      disputeFlag: true,
      adminNotes: `Dispute reason: ${reason}. Evidence: ${evidence || 'None provided'}`
    }
  });

  // Notify admins
  const notificationService = new NotificationService(req.app.get('io'));
  await notificationService.sendAdminNotification(
    'Transaction Disputed',
    `User ${req.user!.id} disputed transaction ${id}`,
    { transactionId: id, reason }
  );

  res.json({
    success: true,
    message: 'Dispute submitted successfully',
    data: updated
  });
}));

export default router;
