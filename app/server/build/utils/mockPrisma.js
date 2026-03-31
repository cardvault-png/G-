"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedDefaultData = exports.mockPrisma = void 0;
// Mock Prisma client for development when database is not available
const uuid_1 = require("uuid");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
// In-memory storage
const db = {
    users: new Map(),
    wallets: new Map(),
    transactions: new Map(),
    otpCodes: new Map(),
    loginAttempts: new Map(),
    giftCards: new Map(),
    notifications: new Map(),
    kycDocuments: new Map(),
    cryptoRates: new Map(),
    adminWallets: new Map(),
    bankAccounts: new Map(),
    giftCardRates: new Map(),
    blockchainMonitors: new Map(),
    ledger: new Map(),
    adminActions: new Map(),
    auditLogs: new Map(),
    appeals: new Map(),
    systemSettings: new Map(),
};
// Helper to generate UUID
const generateId = () => (0, uuid_1.v4)();
// Helper to get current timestamp
const now = () => new Date();
// Mock Prisma client
exports.mockPrisma = {
    user: {
        findUnique: async ({ where }) => {
            if (where.id)
                return db.users.get(where.id) || null;
            if (where.email) {
                for (const user of db.users.values()) {
                    if (user.email === where.email)
                        return user;
                }
                return null;
            }
            if (where.phone) {
                for (const user of db.users.values()) {
                    if (user.phone === where.phone)
                        return user;
                }
                return null;
            }
            if (where.username) {
                for (const user of db.users.values()) {
                    if (user.username === where.username)
                        return user;
                }
                return null;
            }
            return null;
        },
        findFirst: async ({ where }) => {
            if (where.referralCode) {
                for (const user of db.users.values()) {
                    if (user.referralCode === where.referralCode)
                        return user;
                }
                return null;
            }
            return null;
        },
        findMany: async ({ where, orderBy, take } = {}) => {
            let results = Array.from(db.users.values());
            if (where?.role)
                results = results.filter(u => u.role === where.role);
            if (where?.kycStatus)
                results = results.filter(u => u.kycStatus === where.kycStatus);
            if (where?.isBanned !== undefined)
                results = results.filter(u => u.isBanned === where.isBanned);
            if (orderBy?.createdAt === 'desc')
                results.sort((a, b) => b.createdAt - a.createdAt);
            if (take)
                results = results.slice(0, take);
            return results;
        },
        create: async ({ data }) => {
            const id = generateId();
            const user = {
                id,
                ...data,
                role: data.role || 'USER',
                kycStatus: data.kycStatus || 'NOT_SUBMITTED',
                isBanned: data.isBanned || false,
                twoFactorEnabled: data.twoFactorEnabled || false,
                termsAccepted: data.termsAccepted || false,
                createdAt: now(),
                updatedAt: now(),
            };
            db.users.set(id, user);
            return user;
        },
        update: async ({ where, data }) => {
            const user = await exports.mockPrisma.user.findUnique({ where });
            if (!user)
                throw new Error('User not found');
            const updated = { ...user, ...data, updatedAt: now() };
            db.users.set(user.id, updated);
            return updated;
        },
        count: async ({ where } = {}) => {
            let count = db.users.size;
            if (where?.role)
                count = Array.from(db.users.values()).filter(u => u.role === where.role).length;
            return count;
        },
    },
    wallet: {
        findUnique: async ({ where }) => {
            if (where.id)
                return db.wallets.get(where.id) || null;
            return null;
        },
        findFirst: async ({ where }) => {
            for (const wallet of db.wallets.values()) {
                if (wallet.userId === where.userId && wallet.type === where.type)
                    return wallet;
            }
            return null;
        },
        findMany: async ({ where } = {}) => {
            let results = Array.from(db.wallets.values());
            if (where?.userId)
                results = results.filter(w => w.userId === where.userId);
            return results;
        },
        create: async ({ data }) => {
            const id = generateId();
            const wallet = {
                id,
                ...data,
                balance: data.balance || 0,
                frozenBalance: data.frozenBalance || 0,
                createdAt: now(),
                updatedAt: now(),
            };
            db.wallets.set(id, wallet);
            return wallet;
        },
        createMany: async ({ data }) => {
            for (const item of data) {
                await exports.mockPrisma.wallet.create({ data: item });
            }
            return { count: data.length };
        },
        update: async ({ where, data }) => {
            const wallet = await exports.mockPrisma.wallet.findUnique({ where });
            if (!wallet)
                throw new Error('Wallet not found');
            const updated = { ...wallet, ...data, updatedAt: now() };
            db.wallets.set(wallet.id, updated);
            return updated;
        },
    },
    otpCode: {
        findFirst: async ({ where }) => {
            for (const otp of db.otpCodes.values()) {
                if (otp.identifier === where.identifier &&
                    otp.code === where.code &&
                    otp.type === where.type &&
                    !otp.usedAt &&
                    otp.expiresAt > now()) {
                    return otp;
                }
            }
            return null;
        },
        findMany: async ({ where } = {}) => {
            let results = Array.from(db.otpCodes.values());
            if (where?.identifier)
                results = results.filter(o => o.identifier === where.identifier);
            if (where?.usedAt === null)
                results = results.filter(o => !o.usedAt);
            return results;
        },
        create: async ({ data }) => {
            const id = generateId();
            const otp = {
                id,
                ...data,
                attempts: 0,
                maxAttempts: 3,
                createdAt: now(),
            };
            db.otpCodes.set(id, otp);
            return otp;
        },
        update: async ({ where, data }) => {
            const otp = db.otpCodes.get(where.id);
            if (!otp)
                throw new Error('OTP not found');
            const updated = { ...otp, ...data };
            db.otpCodes.set(where.id, updated);
            return updated;
        },
        updateMany: async ({ where, data }) => {
            let count = 0;
            for (const [id, otp] of db.otpCodes) {
                if (otp.identifier === where.identifier && !otp.usedAt) {
                    db.otpCodes.set(id, { ...otp, ...data });
                    count++;
                }
            }
            return { count };
        },
    },
    loginAttempt: {
        create: async ({ data }) => {
            const id = generateId();
            const attempt = {
                id,
                ...data,
                createdAt: now(),
            };
            db.loginAttempts.set(id, attempt);
            return attempt;
        },
        findMany: async ({ where, orderBy, take } = {}) => {
            let results = Array.from(db.loginAttempts.values());
            if (where?.userId)
                results = results.filter(a => a.userId === where.userId);
            if (where?.ipAddress)
                results = results.filter(a => a.ipAddress === where.ipAddress);
            if (where?.success === false)
                results = results.filter(a => !a.success);
            if (orderBy?.createdAt === 'desc')
                results.sort((a, b) => b.createdAt - a.createdAt);
            if (take)
                results = results.slice(0, take);
            return results;
        },
        count: async ({ where } = {}) => {
            let results = Array.from(db.loginAttempts.values());
            if (where?.ipAddress)
                results = results.filter(a => a.ipAddress === where.ipAddress);
            if (where?.success === false)
                results = results.filter(a => !a.success);
            if (where?.createdAt?.gte)
                results = results.filter(a => a.createdAt >= where.createdAt.gte);
            return results.length;
        },
    },
    transaction: {
        findUnique: async ({ where }) => {
            if (where.id)
                return db.transactions.get(where.id) || null;
            return null;
        },
        findMany: async ({ where, orderBy, take, skip } = {}) => {
            let results = Array.from(db.transactions.values());
            if (where?.userId)
                results = results.filter(t => t.userId === where.userId);
            if (where?.walletId)
                results = results.filter(t => t.walletId === where.walletId);
            if (where?.status)
                results = results.filter(t => t.status === where.status);
            if (where?.type)
                results = results.filter(t => t.type === where.type);
            if (orderBy?.createdAt === 'desc')
                results.sort((a, b) => b.createdAt - a.createdAt);
            if (skip)
                results = results.slice(skip);
            if (take)
                results = results.slice(0, take);
            return results;
        },
        create: async ({ data }) => {
            const id = generateId();
            const transaction = {
                id,
                ...data,
                status: data.status || 'PENDING',
                confirmations: 0,
                fraudScore: 0,
                disputeFlag: false,
                createdAt: now(),
                updatedAt: now(),
            };
            db.transactions.set(id, transaction);
            return transaction;
        },
        update: async ({ where, data }) => {
            const transaction = await exports.mockPrisma.transaction.findUnique({ where });
            if (!transaction)
                throw new Error('Transaction not found');
            const updated = { ...transaction, ...data, updatedAt: now() };
            db.transactions.set(transaction.id, updated);
            return updated;
        },
        count: async ({ where } = {}) => {
            let count = db.transactions.size;
            if (where?.status)
                count = Array.from(db.transactions.values()).filter(t => t.status === where.status).length;
            if (where?.userId)
                count = Array.from(db.transactions.values()).filter(t => t.userId === where.userId).length;
            return count;
        },
    },
    giftCard: {
        findUnique: async ({ where }) => {
            if (where.id)
                return db.giftCards.get(where.id) || null;
            return null;
        },
        findMany: async ({ where, orderBy, take } = {}) => {
            let results = Array.from(db.giftCards.values());
            if (where?.userId)
                results = results.filter(g => g.userId === where.userId);
            if (where?.status)
                results = results.filter(g => g.status === where.status);
            if (orderBy?.createdAt === 'desc')
                results.sort((a, b) => b.createdAt - a.createdAt);
            if (take)
                results = results.slice(0, take);
            return results;
        },
        create: async ({ data }) => {
            const id = generateId();
            const giftCard = {
                id,
                ...data,
                status: data.status || 'PENDING',
                fraudScore: 0,
                ocrConfidence: 0,
                createdAt: now(),
                updatedAt: now(),
            };
            db.giftCards.set(id, giftCard);
            return giftCard;
        },
        update: async ({ where, data }) => {
            const giftCard = await exports.mockPrisma.giftCard.findUnique({ where });
            if (!giftCard)
                throw new Error('Gift card not found');
            const updated = { ...giftCard, ...data, updatedAt: now() };
            db.giftCards.set(giftCard.id, updated);
            return updated;
        },
        count: async ({ where } = {}) => {
            let count = db.giftCards.size;
            if (where?.status)
                count = Array.from(db.giftCards.values()).filter(g => g.status === where.status).length;
            return count;
        },
    },
    notification: {
        findMany: async ({ where, orderBy, take } = {}) => {
            let results = Array.from(db.notifications.values());
            if (where?.userId)
                results = results.filter(n => n.userId === where.userId);
            if (where?.isRead === false)
                results = results.filter(n => !n.isRead);
            if (orderBy?.createdAt === 'desc')
                results.sort((a, b) => b.createdAt - a.createdAt);
            if (take)
                results = results.slice(0, take);
            return results;
        },
        create: async ({ data }) => {
            const id = generateId();
            const notification = {
                id,
                ...data,
                isRead: false,
                emailSent: false,
                createdAt: now(),
            };
            db.notifications.set(id, notification);
            return notification;
        },
        update: async ({ where, data }) => {
            const notification = db.notifications.get(where.id);
            if (!notification)
                throw new Error('Notification not found');
            const updated = { ...notification, ...data };
            db.notifications.set(where.id, updated);
            return updated;
        },
        updateMany: async ({ where, data }) => {
            let count = 0;
            for (const [id, notification] of db.notifications) {
                if (notification.userId === where.userId && notification.isRead === where.isRead) {
                    db.notifications.set(id, { ...notification, ...data });
                    count++;
                }
            }
            return { count };
        },
        count: async ({ where } = {}) => {
            let count = db.notifications.size;
            if (where?.userId)
                count = Array.from(db.notifications.values()).filter(n => n.userId === where.userId).length;
            if (where?.isRead === false)
                count = Array.from(db.notifications.values()).filter(n => !n.isRead).length;
            return count;
        },
    },
    cryptoRate: {
        findUnique: async ({ where }) => {
            if (where.symbol)
                return db.cryptoRates.get(where.symbol) || null;
            return null;
        },
        findMany: async () => {
            return Array.from(db.cryptoRates.values());
        },
        upsert: async ({ where, create, update }) => {
            const existing = await exports.mockPrisma.cryptoRate.findUnique({ where });
            if (existing) {
                const updated = { ...existing, ...update, lastUpdated: now() };
                db.cryptoRates.set(where.symbol, updated);
                return updated;
            }
            else {
                const created = {
                    id: generateId(),
                    ...create,
                    lastUpdated: now(),
                };
                db.cryptoRates.set(where.symbol, created);
                return created;
            }
        },
    },
    adminWallet: {
        findUnique: async ({ where }) => {
            if (where.adminId) {
                for (const wallet of db.adminWallets.values()) {
                    if (wallet.adminId === where.adminId)
                        return wallet;
                }
            }
            return null;
        },
        create: async ({ data }) => {
            const id = generateId();
            const wallet = {
                id,
                ...data,
                balance: data.balance || 15000,
                autoRefillEnabled: data.autoRefillEnabled !== false,
                autoRefillAmount: data.autoRefillAmount || 200,
                createdAt: now(),
                updatedAt: now(),
            };
            db.adminWallets.set(id, wallet);
            return wallet;
        },
        update: async ({ where, data }) => {
            for (const [id, wallet] of db.adminWallets) {
                if (wallet.adminId === where.adminId) {
                    const updated = { ...wallet, ...data, updatedAt: now() };
                    db.adminWallets.set(id, updated);
                    return updated;
                }
            }
            throw new Error('Admin wallet not found');
        },
    },
    // Add transaction support
    $transaction: async (operations) => {
        const results = [];
        for (const op of operations) {
            if (typeof op === 'function') {
                results.push(await op(exports.mockPrisma));
            }
            else {
                results.push(await op);
            }
        }
        return results;
    },
    // Clear all data (useful for testing)
    $clear: () => {
        for (const key of Object.keys(db)) {
            db[key].clear();
        }
    },
    // Get database stats
    $stats: () => {
        const stats = {};
        for (const [key, value] of Object.entries(db)) {
            stats[key] = value.size;
        }
        return stats;
    },
};
// Seed default admin user
const seedDefaultData = async () => {
    // Check if admin exists
    let admin = null;
    for (const user of db.users.values()) {
        if (user.email === 'admin@giftcardpro.com') {
            admin = user;
            break;
        }
    }
    if (!admin) {
        const passwordHash = await bcryptjs_1.default.hash('Admin@123456', 12);
        admin = await exports.mockPrisma.user.create({
            data: {
                email: 'admin@giftcardpro.com',
                username: 'admin',
                fullName: 'System Administrator',
                passwordHash,
                role: 'SUPER_ADMIN',
                termsAccepted: true,
                termsAcceptedAt: now(),
                referralCode: 'ADMIN001',
            },
        });
        console.log('[MockDB] Created default admin user:', admin.email);
        // Create admin wallet
        await exports.mockPrisma.adminWallet.create({
            data: {
                adminId: admin.id,
                balance: 15000,
                workEmail: 'admin@giftcardpro.com',
            },
        });
    }
    // Seed default crypto rates
    const defaultRates = [
        { symbol: 'BTC', name: 'Bitcoin', priceUsd: 65000, change24h: 2.5, volume24h: 30000000000, marketCap: 1200000000000 },
        { symbol: 'ETH', name: 'Ethereum', priceUsd: 3500, change24h: 1.8, volume24h: 15000000000, marketCap: 400000000000 },
        { symbol: 'USDT', name: 'Tether', priceUsd: 1, change24h: 0.01, volume24h: 50000000000, marketCap: 100000000000 },
        { symbol: 'BNB', name: 'BNB', priceUsd: 600, change24h: -0.5, volume24h: 2000000000, marketCap: 90000000000 },
    ];
    for (const rate of defaultRates) {
        const existing = await exports.mockPrisma.cryptoRate.findUnique({ where: { symbol: rate.symbol } });
        if (!existing) {
            await exports.mockPrisma.cryptoRate.upsert({
                where: { symbol: rate.symbol },
                create: rate,
                update: rate,
            });
        }
    }
    return { admin };
};
exports.seedDefaultData = seedDefaultData;
exports.default = exports.mockPrisma;
//# sourceMappingURL=mockPrisma.js.map