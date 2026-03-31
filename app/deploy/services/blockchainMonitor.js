"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlockchainMonitorService = void 0;
const prisma_1 = require("../utils/prisma");
const TronWeb = require('tronweb');
class BlockchainMonitorService {
    io;
    tronWeb;
    isRunning = false;
    monitorInterval = null;
    USDT_CONTRACT = process.env.USDT_TRC20_CONTRACT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
    REQUIRED_CONFIRMATIONS = parseInt(process.env.TRC20_CONFIRMATIONS || '19');
    constructor(io) {
        this.io = io;
        this.tronWeb = new TronWeb({
            fullHost: process.env.TRON_FULL_NODE || 'https://api.trongrid.io',
            headers: process.env.TRON_API_KEY ? { 'TRON-PRO-API-KEY': process.env.TRON_API_KEY } : undefined
        });
    }
    async start() {
        if (this.isRunning)
            return;
        this.isRunning = true;
        console.log('Starting blockchain monitor service...');
        // Start monitoring loop
        this.monitorInterval = setInterval(() => {
            this.checkPendingDeposits();
        }, 30000); // Check every 30 seconds
        // Initial check
        await this.checkPendingDeposits();
    }
    stop() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
        this.isRunning = false;
        console.log('Blockchain monitor service stopped');
    }
    async checkPendingDeposits() {
        try {
            // Get all pending blockchain monitors
            const pendingMonitors = await prisma_1.prisma.blockchainMonitor.findMany({
                where: {
                    status: 'PENDING',
                    network: 'TRON'
                }
            });
            for (const monitor of pendingMonitors) {
                try {
                    await this.checkTransaction(monitor);
                }
                catch (error) {
                    console.error(`Error checking transaction ${monitor.txHash}:`, error);
                }
            }
        }
        catch (error) {
            console.error('Error in checkPendingDeposits:', error);
        }
    }
    async checkTransaction(monitor) {
        try {
            // Get transaction info from TRON
            const txInfo = await this.tronWeb.trx.getTransactionInfo(monitor.txHash);
            if (!txInfo) {
                console.log(`Transaction ${monitor.txHash} not found yet`);
                return;
            }
            // Check if transaction is confirmed
            const currentBlock = await this.tronWeb.trx.getCurrentBlock();
            const txBlock = txInfo.blockNumber;
            if (!txBlock || !currentBlock) {
                return;
            }
            const confirmations = currentBlock.block_header.raw_data.number - txBlock;
            // Update monitor with confirmation count
            await prisma_1.prisma.blockchainMonitor.update({
                where: { id: monitor.id },
                data: {
                    confirmations: Math.max(0, confirmations),
                    updatedAt: new Date()
                }
            });
            // Check if we have enough confirmations
            if (confirmations >= this.REQUIRED_CONFIRMATIONS) {
                await this.confirmDeposit(monitor, txInfo);
            }
        }
        catch (error) {
            console.error(`Error checking transaction ${monitor.txHash}:`, error);
        }
    }
    async confirmDeposit(monitor, txInfo) {
        try {
            // Start transaction
            await prisma_1.prisma.$transaction(async (tx) => {
                // Update monitor status
                await tx.blockchainMonitor.update({
                    where: { id: monitor.id },
                    data: {
                        status: 'CONFIRMED',
                        confirmedAt: new Date(),
                        updatedAt: new Date()
                    }
                });
                // Update transaction status
                const transaction = await tx.transaction.update({
                    where: { id: monitor.transactionId },
                    data: {
                        status: 'COMPLETED',
                        confirmations: this.REQUIRED_CONFIRMATIONS,
                        completedAt: new Date()
                    }
                });
                // Update wallet balance
                const wallet = await tx.wallet.findUnique({
                    where: { id: monitor.walletId }
                });
                if (!wallet) {
                    throw new Error('Wallet not found');
                }
                const currentBalance = parseFloat(wallet.balance.toString());
                const newBalance = currentBalance + parseFloat(monitor.amount.toString());
                await tx.wallet.update({
                    where: { id: monitor.walletId },
                    data: { balance: newBalance }
                });
                // Create ledger entry
                await tx.ledger.create({
                    data: {
                        userId: monitor.userId,
                        walletId: monitor.walletId,
                        transactionId: monitor.transactionId,
                        credit: monitor.amount,
                        balanceAfter: newBalance,
                        description: `USDT TRC20 deposit confirmed - ${monitor.txHash}`
                    }
                });
                // Create notification
                await tx.notification.create({
                    data: {
                        userId: monitor.userId,
                        type: 'TRANSACTION',
                        title: 'Deposit Confirmed',
                        message: `Your USDT deposit of ${monitor.amount} has been confirmed and credited to your wallet.`,
                        actionUrl: '/wallet/transactions'
                    }
                });
            });
            // Emit real-time update
            this.io.to(`user_${monitor.userId}`).emit('deposit_confirmed', {
                transactionId: monitor.transactionId,
                amount: monitor.amount,
                txHash: monitor.txHash
            });
            // Emit to admin room
            this.io.to('admin_room').emit('deposit_confirmed_admin', {
                userId: monitor.userId,
                amount: monitor.amount,
                txHash: monitor.txHash
            });
            console.log(`Deposit confirmed: ${monitor.txHash}`);
        }
        catch (error) {
            console.error(`Error confirming deposit ${monitor.txHash}:`, error);
        }
    }
    // Create a new deposit monitor
    async createDepositMonitor(data) {
        return prisma_1.prisma.blockchainMonitor.create({
            data: {
                ...data,
                amount: data.amount,
                status: 'PENDING',
                confirmations: 0,
                requiredConfirmations: this.REQUIRED_CONFIRMATIONS
            }
        });
    }
    // Verify a transaction exists on blockchain
    async verifyTransaction(txHash) {
        try {
            const txInfo = await this.tronWeb.trx.getTransactionInfo(txHash);
            return !!txInfo && txInfo.id === txHash;
        }
        catch (error) {
            return false;
        }
    }
    // Get transaction details
    async getTransactionDetails(txHash) {
        try {
            const txInfo = await this.tronWeb.trx.getTransactionInfo(txHash);
            const tx = await this.tronWeb.trx.getTransaction(txHash);
            return {
                txHash,
                blockNumber: txInfo.blockNumber,
                timestamp: txInfo.blockTimeStamp,
                confirmations: txInfo.confirmations,
                contractResult: txInfo.contractResult,
                rawData: tx.raw_data
            };
        }
        catch (error) {
            console.error('Error getting transaction details:', error);
            return null;
        }
    }
    // Generate new deposit address for user
    async generateDepositAddress() {
        try {
            const account = await this.tronWeb.createAccount();
            return account.address.base58;
        }
        catch (error) {
            console.error('Error generating deposit address:', error);
            throw new Error('Failed to generate deposit address');
        }
    }
    // Validate TRON address
    isValidAddress(address) {
        return this.tronWeb.isAddress(address);
    }
}
exports.BlockchainMonitorService = BlockchainMonitorService;
//# sourceMappingURL=blockchainMonitor.js.map