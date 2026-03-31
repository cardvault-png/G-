"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../utils/prisma");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const upload_1 = require("../middleware/upload");
const notification_1 = require("../services/notification");
const fraudDetection_1 = require("../services/fraudDetection");
const router = (0, express_1.Router)();
// Get gift card rates
router.get('/rates', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { brand, country } = req.query;
    const where = { isActive: true };
    if (brand)
        where.brand = brand;
    if (country)
        where.country = country;
    const rates = await prisma_1.prisma.giftCardRate.findMany({
        where,
        orderBy: { brand: 'asc' }
    });
    res.json({
        success: true,
        data: rates
    });
}));
// Get user's gift cards
router.get('/my-cards', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { page = 1, limit = 20, status } = req.query;
    const where = { userId: req.user.id };
    if (status)
        where.status = status;
    const [cards, total] = await Promise.all([
        prisma_1.prisma.giftCard.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (Number(page) - 1) * Number(limit),
            take: Number(limit)
        }),
        prisma_1.prisma.giftCard.count({ where })
    ]);
    res.json({
        success: true,
        data: {
            cards,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / Number(limit))
            }
        }
    });
}));
// Submit gift card
router.post('/submit', auth_1.authenticate, auth_1.requireKyc, upload_1.uploadGiftCardImages, upload_1.handleUploadError, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { brand, country, cardValue, currency, pinCode, rate } = req.body;
    if (!brand || !country || !cardValue || !pinCode) {
        throw new errorHandler_1.AppError('Brand, country, card value, and PIN are required', 400);
    }
    const files = req.files;
    if (!files?.imageFront || !files?.imageBack) {
        throw new errorHandler_1.AppError('Front and back images are required', 400);
    }
    // Simulate OCR extraction (in production, use actual OCR service)
    const ocrResult = pinCode;
    const ocrConfidence = 0.95; // Simulated confidence
    // Calculate payout
    const cardAmount = parseFloat(cardValue);
    const payoutRate = parseFloat(rate || '0.85');
    const payoutAmount = cardAmount * payoutRate;
    // Fraud detection
    const fraudService = new fraudDetection_1.FraudDetectionService();
    const fraudCheck = await fraudService.checkGiftCard({
        userId: req.user.id,
        brand,
        cardValue: cardAmount,
        pinCode,
        ocrConfidence,
        imageFront: files.imageFront[0].path,
        imageBack: files.imageBack[0].path,
        ipAddress: req.ip || 'unknown',
        deviceFingerprint: req.body.deviceFingerprint
    });
    // Determine status based on fraud check
    let status = 'AI_PROCESSING';
    let reviewCategory = null;
    if (fraudCheck.score >= 60) {
        status = 'ADMIN_REVIEW';
        reviewCategory = fraudCheck.flags[0];
    }
    else if (ocrConfidence >= 0.95) {
        status = 'AI_APPROVED';
    }
    // Create gift card record
    const giftCard = await prisma_1.prisma.giftCard.create({
        data: {
            userId: req.user.id,
            brand,
            country,
            cardValue: cardAmount,
            currency: currency || 'USD',
            pinCode, // In production, encrypt this
            ocrResult,
            ocrConfidence,
            fraudScore: fraudCheck.score,
            fraudFlags: fraudCheck.flags,
            reviewCategory,
            status: status,
            imageFront: files.imageFront[0].path,
            imageBack: files.imageBack[0].path,
            imageScratched: files.imageScratched?.[0]?.path,
            rate: payoutRate,
            payoutAmount
        }
    });
    // If auto-approved, process payment
    if (status === 'AI_APPROVED') {
        await processGiftCardApproval(giftCard.id, req.app.get('io'));
    }
    // Send notification
    const notificationService = new notification_1.NotificationService(req.app.get('io'));
    await notificationService.createNotification({
        userId: req.user.id,
        type: 'TRANSACTION',
        title: 'Gift Card Submitted',
        message: `Your ${brand} gift card of $${cardValue} has been submitted for review.`,
        actionUrl: '/gift-cards/my-cards'
    });
    // Notify admins if review needed
    if (status === 'ADMIN_REVIEW') {
        await notificationService.sendAdminNotification('Gift Card Needs Review', `User ${req.user.id} submitted a gift card requiring manual review`, { giftCardId: giftCard.id, fraudScore: fraudCheck.score });
    }
    res.status(201).json({
        success: true,
        message: 'Gift card submitted successfully',
        data: giftCard
    });
}));
// Process gift card approval (internal function)
async function processGiftCardApproval(giftCardId, io) {
    try {
        const giftCard = await prisma_1.prisma.giftCard.findUnique({
            where: { id: giftCardId },
            include: { user: true }
        });
        if (!giftCard)
            return;
        // Update gift card status
        await prisma_1.prisma.giftCard.update({
            where: { id: giftCardId },
            data: {
                status: 'COMPLETED',
                processedAt: new Date()
            }
        });
        // Credit user's wallet
        const wallet = await prisma_1.prisma.wallet.findFirst({
            where: {
                userId: giftCard.userId,
                type: 'USD'
            }
        });
        if (wallet) {
            const currentBalance = parseFloat(wallet.balance.toString());
            const newBalance = currentBalance + parseFloat(giftCard.payoutAmount.toString());
            await prisma_1.prisma.$transaction(async (tx) => {
                // Update wallet
                await tx.wallet.update({
                    where: { id: wallet.id },
                    data: { balance: newBalance }
                });
                // Create transaction
                const transaction = await tx.transaction.create({
                    data: {
                        userId: giftCard.userId,
                        walletId: wallet.id,
                        type: 'GIFT_CARD_SALE',
                        status: 'COMPLETED',
                        amount: parseFloat(giftCard.payoutAmount.toString()),
                        fee: 0,
                        netAmount: parseFloat(giftCard.payoutAmount.toString()),
                        walletType: 'USD',
                        completedAt: new Date()
                    }
                });
                // Create ledger entry
                await tx.ledger.create({
                    data: {
                        userId: giftCard.userId,
                        walletId: wallet.id,
                        transactionId: transaction.id,
                        credit: parseFloat(giftCard.payoutAmount.toString()),
                        balanceAfter: newBalance,
                        description: `Gift card sale - ${giftCard.brand} $${giftCard.cardValue}`
                    }
                });
            });
            // Send notification
            const notificationService = new notification_1.NotificationService(io);
            await notificationService.createNotification({
                userId: giftCard.userId,
                type: 'TRANSACTION',
                title: 'Gift Card Approved',
                message: `Your ${giftCard.brand} gift card has been approved. $${giftCard.payoutAmount} has been credited to your wallet.`,
                actionUrl: '/wallet'
            });
        }
    }
    catch (error) {
        console.error('Error processing gift card approval:', error);
    }
}
// Get gift card by ID
router.get('/:id', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const giftCard = await prisma_1.prisma.giftCard.findFirst({
        where: {
            id,
            userId: req.user.id
        }
    });
    if (!giftCard) {
        throw new errorHandler_1.AppError('Gift card not found', 404);
    }
    res.json({
        success: true,
        data: giftCard
    });
}));
exports.default = router;
//# sourceMappingURL=giftcard.js.map