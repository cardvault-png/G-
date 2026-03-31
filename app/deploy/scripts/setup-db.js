"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function setupDatabase() {
    console.log('Setting up database...');
    try {
        // Create admin user if not exists
        const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@giftcardpro.com';
        const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123456';
        const existingAdmin = await prisma.user.findUnique({
            where: { email: adminEmail },
        });
        if (!existingAdmin) {
            console.log('Creating default admin user...');
            const passwordHash = await bcryptjs_1.default.hash(adminPassword, 12);
            const admin = await prisma.user.create({
                data: {
                    email: adminEmail,
                    passwordHash,
                    fullName: 'System Administrator',
                    username: 'admin',
                    role: 'SUPER_ADMIN',
                    termsAccepted: true,
                    termsAcceptedAt: new Date(),
                    kycStatus: 'APPROVED',
                    kycApprovedAt: new Date(),
                },
            });
            // Create admin wallet
            await prisma.adminWallet.create({
                data: {
                    adminId: admin.id,
                    balance: 15000,
                    workEmail: adminEmail,
                },
            });
            // Create USD and USDT wallets for admin
            await prisma.wallet.createMany({
                data: [
                    { userId: admin.id, type: 'USD', balance: 0 },
                    { userId: admin.id, type: 'USDT', balance: 0 },
                ],
            });
            console.log('Default admin user created successfully');
            console.log(`Email: ${adminEmail}`);
            console.log(`Access Code: ${process.env.ADMIN_ACCESS_CODE || '1122'}`);
        }
        else {
            console.log('Admin user already exists');
        }
        // Create default gift card rates
        const defaultRates = [
            { brand: 'Amazon', country: 'US', currency: 'USD', rate: 85.00, minAmount: 10, maxAmount: 2000 },
            { brand: 'Apple', country: 'US', currency: 'USD', rate: 88.00, minAmount: 10, maxAmount: 500 },
            { brand: 'Google Play', country: 'US', currency: 'USD', rate: 82.00, minAmount: 10, maxAmount: 500 },
            { brand: 'Steam', country: 'US', currency: 'USD', rate: 80.00, minAmount: 5, maxAmount: 1000 },
            { brand: 'Xbox', country: 'US', currency: 'USD', rate: 83.00, minAmount: 10, maxAmount: 500 },
            { brand: 'PlayStation', country: 'US', currency: 'USD', rate: 83.00, minAmount: 10, maxAmount: 500 },
            { brand: 'Netflix', country: 'US', currency: 'USD', rate: 87.00, minAmount: 15, maxAmount: 200 },
            { brand: 'Spotify', country: 'US', currency: 'USD', rate: 86.00, minAmount: 10, maxAmount: 120 },
        ];
        for (const rate of defaultRates) {
            await prisma.giftCardRate.upsert({
                where: {
                    brand_country_currency: {
                        brand: rate.brand,
                        country: rate.country,
                        currency: rate.currency,
                    },
                },
                update: rate,
                create: rate,
            });
        }
        console.log('Default gift card rates created/updated');
        // Create system settings
        const defaultSettings = [
            { key: 'MAINTENANCE_MODE', value: 'false', description: 'Enable/disable maintenance mode' },
            { key: 'REGISTRATION_ENABLED', value: 'true', description: 'Enable/disable new user registration' },
            { key: 'WITHDRAWAL_ENABLED', value: 'true', description: 'Enable/disable withdrawals' },
            { key: 'MIN_WITHDRAWAL', value: '10', description: 'Minimum withdrawal amount' },
            { key: 'MAX_WITHDRAWAL', value: '10000', description: 'Maximum withdrawal amount per day' },
            { key: 'GIFT_CARD_FEE', value: '1', description: 'Gift card processing fee percentage' },
            { key: 'WITHDRAWAL_FEE', value: '1', description: 'Withdrawal fee percentage' },
        ];
        for (const setting of defaultSettings) {
            await prisma.systemSetting.upsert({
                where: { key: setting.key },
                update: setting,
                create: setting,
            });
        }
        console.log('System settings created/updated');
        console.log('Database setup completed successfully!');
    }
    catch (error) {
        console.error('Database setup failed:', error);
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
setupDatabase();
//# sourceMappingURL=setup-db.js.map