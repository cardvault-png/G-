"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../utils/prisma");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const router = (0, express_1.Router)();
// Get supported banks (Nigeria)
const NIGERIAN_BANKS = [
    { code: '044', name: 'Access Bank' },
    { code: '023', name: 'Citibank Nigeria' },
    { code: '050', name: 'Ecobank Nigeria' },
    { code: '011', name: 'First Bank of Nigeria' },
    { code: '214', name: 'First City Monument Bank' },
    { code: '070', name: 'Fidelity Bank' },
    { code: '058', name: 'Guaranty Trust Bank' },
    { code: '030', name: 'Heritage Bank' },
    { code: '301', name: 'Jaiz Bank' },
    { code: '082', name: 'Keystone Bank' },
    { code: '076', name: 'Polaris Bank' },
    { code: '221', name: 'Stanbic IBTC Bank' },
    { code: '068', name: 'Standard Chartered Bank' },
    { code: '232', name: 'Sterling Bank' },
    { code: '100', name: 'SunTrust Bank' },
    { code: '032', name: 'Union Bank of Nigeria' },
    { code: '033', name: 'United Bank for Africa' },
    { code: '215', name: 'Unity Bank' },
    { code: '035', name: 'Wema Bank' },
    { code: '057', name: 'Zenith Bank' },
    { code: '559', name: 'Opay' },
    { code: '566', name: 'Palmpay' },
    { code: '505', name: 'Kuda Bank' }
];
// Get banks by country
router.get('/banks/:country', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { country } = req.params;
    if (country.toLowerCase() === 'nigeria' || country.toLowerCase() === 'ng') {
        return res.json({
            success: true,
            data: NIGERIAN_BANKS
        });
    }
    // For other countries, return generic list
    res.json({
        success: true,
        data: []
    });
}));
// Verify bank account
router.post('/verify-account', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { bankCode, accountNumber } = req.body;
    if (!bankCode || !accountNumber) {
        throw new errorHandler_1.AppError('Bank code and account number are required', 400);
    }
    // In production, integrate with actual bank verification API
    // For now, simulate verification
    const bank = NIGERIAN_BANKS.find(b => b.code === bankCode);
    if (!bank) {
        throw new errorHandler_1.AppError('Invalid bank code', 400);
    }
    // Simulate account verification
    // In production, this would call the actual bank API
    const simulatedName = `Account Holder ${accountNumber.slice(-4)}`;
    res.json({
        success: true,
        data: {
            accountNumber,
            accountName: simulatedName,
            bankName: bank.name,
            bankCode,
            verified: true
        }
    });
}));
// Get user's bank accounts
router.get('/accounts', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const accounts = await prisma_1.prisma.bankAccount.findMany({
        where: { userId: req.user.id },
        orderBy: { isDefault: 'desc' }
    });
    res.json({
        success: true,
        data: accounts
    });
}));
// Add bank account
router.post('/accounts', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { country, bankName, bankCode, accountNumber, accountName, isDefault } = req.body;
    if (!country || !bankName || !accountNumber || !accountName) {
        throw new errorHandler_1.AppError('Country, bank name, account number, and account name are required', 400);
    }
    // Check if account already exists
    const existing = await prisma_1.prisma.bankAccount.findFirst({
        where: {
            userId: req.user.id,
            accountNumber
        }
    });
    if (existing) {
        throw new errorHandler_1.AppError('Bank account already exists', 409);
    }
    // If setting as default, unset other defaults
    if (isDefault) {
        await prisma_1.prisma.bankAccount.updateMany({
            where: { userId: req.user.id },
            data: { isDefault: false }
        });
    }
    const account = await prisma_1.prisma.bankAccount.create({
        data: {
            userId: req.user.id,
            country,
            bankName,
            bankCode,
            accountNumber,
            accountName,
            isVerified: true, // In production, verify first
            isDefault: isDefault || false
        }
    });
    res.status(201).json({
        success: true,
        message: 'Bank account added successfully',
        data: account
    });
}));
// Update bank account
router.patch('/accounts/:id', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const { isDefault } = req.body;
    const account = await prisma_1.prisma.bankAccount.findFirst({
        where: { id, userId: req.user.id }
    });
    if (!account) {
        throw new errorHandler_1.AppError('Bank account not found', 404);
    }
    if (isDefault) {
        await prisma_1.prisma.bankAccount.updateMany({
            where: { userId: req.user.id },
            data: { isDefault: false }
        });
    }
    const updated = await prisma_1.prisma.bankAccount.update({
        where: { id },
        data: { isDefault }
    });
    res.json({
        success: true,
        message: 'Bank account updated',
        data: updated
    });
}));
// Delete bank account
router.delete('/accounts/:id', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const account = await prisma_1.prisma.bankAccount.findFirst({
        where: { id, userId: req.user.id }
    });
    if (!account) {
        throw new errorHandler_1.AppError('Bank account not found', 404);
    }
    await prisma_1.prisma.bankAccount.delete({
        where: { id }
    });
    res.json({
        success: true,
        message: 'Bank account deleted'
    });
}));
exports.default = router;
//# sourceMappingURL=bank.js.map