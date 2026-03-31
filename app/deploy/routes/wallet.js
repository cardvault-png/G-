"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../utils/prisma");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const blockchainMonitor_1 = require("../services/blockchainMonitor");
const router = (0, express_1.Router)();
// Get all wallets
router.get('/', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const wallets = await prisma_1.prisma.wallet.findMany({
        where: { userId: req.user.id },
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
router.get('/:type', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { type } = req.params;
    const wallet = await prisma_1.prisma.wallet.findFirst({
        where: {
            userId: req.user.id,
            type: type.toUpperCase()
        }
    });
    if (!wallet) {
        throw new errorHandler_1.AppError('Wallet not found', 404);
    }
    res.json({
        success: true,
        data: wallet
    });
}));
// Get deposit address
router.get('/:type/deposit-address', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { type } = req.params;
    const wallet = await prisma_1.prisma.wallet.findFirst({
        where: {
            userId: req.user.id,
            type: type.toUpperCase()
        }
    });
    if (!wallet) {
        throw new errorHandler_1.AppError('Wallet not found', 404);
    }
    // For USDT, generate TRC20 address if not exists
    if (type.toUpperCase() === 'USDT' && !wallet.address) {
        const blockchainService = new blockchainMonitor_1.BlockchainMonitorService(req.app.get('io'));
        const address = await blockchainService.generateDepositAddress();
        await prisma_1.prisma.wallet.update({
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
router.get('/:type/transactions', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { type } = req.params;
    const { page = 1, limit = 20, status } = req.query;
    const wallet = await prisma_1.prisma.wallet.findFirst({
        where: {
            userId: req.user.id,
            type: type.toUpperCase()
        }
    });
    if (!wallet) {
        throw new errorHandler_1.AppError('Wallet not found', 404);
    }
    const where = {
        walletId: wallet.id
    };
    if (status) {
        where.status = status;
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
// Get ledger entries
router.get('/:type/ledger', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { type } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const wallet = await prisma_1.prisma.wallet.findFirst({
        where: {
            userId: req.user.id,
            type: type.toUpperCase()
        }
    });
    if (!wallet) {
        throw new errorHandler_1.AppError('Wallet not found', 404);
    }
    const [entries, total] = await Promise.all([
        prisma_1.prisma.ledger.findMany({
            where: { walletId: wallet.id },
            orderBy: { createdAt: 'desc' },
            skip: (Number(page) - 1) * Number(limit),
            take: Number(limit)
        }),
        prisma_1.prisma.ledger.count({ where: { walletId: wallet.id } })
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
exports.default = router;
//# sourceMappingURL=wallet.js.map