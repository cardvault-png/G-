import { PrismaClient } from '@prisma/client';
import mockPrisma, { seedDefaultData } from './mockPrisma';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  useMockPrisma: boolean | undefined;
};

// Check if we should use mock Prisma (set when real Prisma fails to connect)
const shouldUseMock = globalForPrisma.useMockPrisma === true || process.env.USE_MOCK_DB === 'true';

let prismaInstance: PrismaClient;

if (shouldUseMock) {
  console.log('[Prisma] Using mock Prisma client');
  prismaInstance = mockPrisma as any;
  // Seed default data
  seedDefaultData().catch(console.error);
} else {
  try {
    prismaInstance = globalForPrisma.prisma ?? new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
    
    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prismaInstance;
    
    // Test connection
    prismaInstance.$connect().then(() => {
      console.log('[Prisma] Connected to database successfully');
    }).catch((err) => {
      console.warn('[Prisma] Failed to connect to database, switching to mock:', err.message);
      globalForPrisma.useMockPrisma = true;
      // Restart required to use mock
    });
  } catch (err: any) {
    console.warn('[Prisma] Error initializing Prisma, using mock:', err.message);
    prismaInstance = mockPrisma as any;
    seedDefaultData().catch(console.error);
  }
}

export const prisma = prismaInstance;

// Helper functions for common operations

export async function getUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: {
      wallets: true,
    },
  });
}

export async function getUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
  });
}

export async function getUserByUsername(username: string) {
  return prisma.user.findUnique({
    where: { username },
  });
}

export async function getUserWallet(userId: string, type: string) {
  return prisma.wallet.findFirst({
    where: { userId, type: type as any },
  });
}

export async function createWallet(userId: string, type: string, address?: string) {
  return prisma.wallet.create({
    data: {
      userId,
      type: type as any,
      address,
      balance: 0,
      frozenBalance: 0,
    },
  });
}

export async function updateWalletBalance(walletId: string, amount: number, isCredit: boolean) {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
  });

  if (!wallet) throw new Error('Wallet not found');

  const currentBalance = parseFloat(wallet.balance.toString());
  const newBalance = isCredit ? currentBalance + amount : currentBalance - amount;

  if (!isCredit && newBalance < 0) {
    throw new Error('Insufficient balance');
  }

  return prisma.wallet.update({
    where: { id: walletId },
    data: { balance: newBalance },
  });
}

export async function createTransaction(data: {
  userId: string;
  walletId: string;
  type: string;
  status: string;
  amount: number;
  fee?: number;
  netAmount: number;
  walletType: string;
  referenceCode?: string;
  blockchainHash?: string;
  networkType?: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  fraudScore?: number;
}) {
  return prisma.transaction.create({
    data: {
      ...data,
      type: data.type as any,
      status: data.status as any,
      walletType: data.walletType as any,
    },
  });
}

export async function createLedgerEntry(data: {
  userId: string;
  walletId: string;
  transactionId: string;
  debit?: number;
  credit?: number;
  balanceAfter: number;
  description?: string;
}) {
  return prisma.ledger.create({
    data: data as any,
  });
}

export async function logAdminAction(data: {
  adminId: string;
  actionType: string;
  targetType: string;
  targetId: string;
  oldValue?: string;
  newValue?: string;
  reason?: string;
  ipAddress: string;
  userAgent?: string;
}) {
  return prisma.adminAction.create({
    data: data as any,
  });
}

export async function logAudit(data: {
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldData?: any;
  newData?: any;
  ipAddress: string;
  userAgent?: string;
}) {
  return prisma.auditLog.create({
    data: data as any,
  });
}

export async function createNotification(data: {
  userId: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
}) {
  return prisma.notification.create({
    data: {
      ...data,
      type: data.type as any,
    },
  });
}

export async function getSystemSetting(key: string) {
  const setting = await prisma.systemSetting.findUnique({
    where: { key },
  });
  return setting?.value;
}

export async function setSystemSetting(key: string, value: string, updatedBy?: string) {
  return prisma.systemSetting.upsert({
    where: { key },
    update: { value, updatedBy },
    create: { key, value, updatedBy },
  });
}

export default prisma;
