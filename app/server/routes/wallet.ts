import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { authenticate, requireKyc } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { BlockchainMonitorService } from '../services/blockchainMonitor';

const router = Router();

// Get all wallets
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const wallets = await prisma.wallet.findMany({
    where: { userId: req.user!.id },
    select: {
      id: true,
      type: true,
      balance: true,
      frozenBalance: true,
      address: true
    }
  });

  res.json({
    success: true,
    data: wallets
  });
}));

// Get wallet by type
router.get('/:type', authenticate, asyncHandler(async (req, res) => {
  const { type } = req.params;

  const wallet = await prisma.wallet.findFirst({
    where: {
      userId: req.user!.id,
      type: type.toUpperCase()
    }
  });

  if (!wallet) {
    throw new AppError('Wallet not found', 404);
  }

  res.json({
    success: true,
    data: wallet
  });
}));

// Get deposit address
router.get('/:type/deposit-address', authenticate, asyncHandler(async (req, res) => {
  const { type } = req.params;

  const wallet = await prisma.wallet.findFirst({
    where: {
      userId: req.user!.id,
      type: type.toUpperCase()
    }
  });

  if (!wallet) {
    throw new AppError('Wallet not found', 404);
  }

  // For USDT, generate TRC20 address if not exists
  if (type.toUpperCase() === 'USDT' && !wallet.address) {
    const blockchainService = new BlockchainMonitorService(req.app.get('io'));
    const address = await blockchainService.generateDepositAddress();
    
    await prisma.wallet.update({
      where: { id: wallet.id },
      data: { address }
    });

    wallet.address = address;
  }

  res.json({
    success: true,
    data: {
      address: wallet.address,
      network: type.toUpperCase() === 'USDT' ? 'TRC20' : null,
      memo: null // Some networks require memo
    }
  });
}));

// Get wallet transactions
router.get('/:type/transactions', authenticate, asyncHandler(async (req, res) => {
  const { type } = req.params;
  const { page = 1, limit = 20, status } = req.query;

  const wallet = await prisma.wallet.findFirst({
    where: {
      userId: req.user!.id,
      type: type.toUpperCase()
    }
  });

  if (!wallet) {
    throw new AppError('Wallet not found', 404);
  }

  const where: any = {
    walletId: wallet.id
  };

  if (status) {
    where.status = status;
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

// Get ledger entries
router.get('/:type/ledger', authenticate, asyncHandler(async (req, res) => {
  const { type } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const wallet = await prisma.wallet.findFirst({
    where: {
      userId: req.user!.id,
      type: type.toUpperCase()
    }
  });

  if (!wallet) {
    throw new AppError('Wallet not found', 404);
  }

  const [entries, total] = await Promise.all([
    prisma.ledger.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit)
    }),
    prisma.ledger.count({ where: { walletId: wallet.id } })
  ]);

  res.json({
    success: true,
    data: {
      entries,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    }
  });
}));

export default router;
