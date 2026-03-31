"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.getUserById = getUserById;
exports.getUserByEmail = getUserByEmail;
exports.getUserByUsername = getUserByUsername;
exports.getUserWallet = getUserWallet;
exports.createWallet = createWallet;
exports.updateWalletBalance = updateWalletBalance;
exports.createTransaction = createTransaction;
exports.createLedgerEntry = createLedgerEntry;
exports.logAdminAction = logAdminAction;
exports.logAudit = logAudit;
exports.createNotification = createNotification;
exports.getSystemSetting = getSystemSetting;
exports.setSystemSetting = setSystemSetting;
const client_1 = require("@prisma/client");
const mockPrisma_1 = __importStar(require("./mockPrisma"));
const globalForPrisma = globalThis;
// Check if we should use mock Prisma (set when real Prisma fails to connect)
const shouldUseMock = globalForPrisma.useMockPrisma === true || process.env.USE_MOCK_DB === 'true';
let prismaInstance;
if (shouldUseMock) {
    console.log('[Prisma] Using mock Prisma client');
    prismaInstance = mockPrisma_1.default;
    // Seed default data
    (0, mockPrisma_1.seedDefaultData)().catch(console.error);
}
else {
    try {
        prismaInstance = globalForPrisma.prisma ?? new client_1.PrismaClient({
            log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
        });
        if (process.env.NODE_ENV !== 'production')
            globalForPrisma.prisma = prismaInstance;
        // Test connection
        prismaInstance.$connect().then(() => {
            console.log('[Prisma] Connected to database successfully');
        }).catch((err) => {
            console.warn('[Prisma] Failed to connect to database, switching to mock:', err.message);
            globalForPrisma.useMockPrisma = true;
            // Restart required to use mock
        });
    }
    catch (err) {
        console.warn('[Prisma] Error initializing Prisma, using mock:', err.message);
        prismaInstance = mockPrisma_1.default;
        (0, mockPrisma_1.seedDefaultData)().catch(console.error);
    }
}
exports.prisma = prismaInstance;
// Helper functions for common operations
async function getUserById(id) {
    return exports.prisma.user.findUnique({
        where: { id },
        include: {
            wallets: true,
        },
    });
}
async function getUserByEmail(email) {
    return exports.prisma.user.findUnique({
        where: { email },
    });
}
async function getUserByUsername(username) {
    return exports.prisma.user.findUnique({
        where: { username },
    });
}
async function getUserWallet(userId, type) {
    return exports.prisma.wallet.findFirst({
        where: { userId, type: type },
    });
}
async function createWallet(userId, type, address) {
    return exports.prisma.wallet.create({
        data: {
            userId,
            type: type,
            address,
            balance: 0,
            frozenBalance: 0,
        },
    });
}
async function updateWalletBalance(walletId, amount, isCredit) {
    const wallet = await exports.prisma.wallet.findUnique({
        where: { id: walletId },
    });
    if (!wallet)
        throw new Error('Wallet not found');
    const currentBalance = parseFloat(wallet.balance.toString());
    const newBalance = isCredit ? currentBalance + amount : currentBalance - amount;
    if (!isCredit && newBalance < 0) {
        throw new Error('Insufficient balance');
    }
    return exports.prisma.wallet.update({
        where: { id: walletId },
        data: { balance: newBalance },
    });
}
async function createTransaction(data) {
    return exports.prisma.transaction.create({
        data: {
            ...data,
            type: data.type,
            status: data.status,
            walletType: data.walletType,
        },
    });
}
async function createLedgerEntry(data) {
    return exports.prisma.ledger.create({
        data: data,
    });
}
async function logAdminAction(data) {
    return exports.prisma.adminAction.create({
        data: data,
    });
}
async function logAudit(data) {
    return exports.prisma.auditLog.create({
        data: data,
    });
}
async function createNotification(data) {
    return exports.prisma.notification.create({
        data: {
            ...data,
            type: data.type,
        },
    });
}
async function getSystemSetting(key) {
    const setting = await exports.prisma.systemSetting.findUnique({
        where: { key },
    });
    return setting?.value;
}
async function setSystemSetting(key, value, updatedBy) {
    return exports.prisma.systemSetting.upsert({
        where: { key },
        update: { value, updatedBy },
        create: { key, value, updatedBy },
    });
}
exports.default = exports.prisma;
//# sourceMappingURL=prisma.js.map