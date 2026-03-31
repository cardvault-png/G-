"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../utils/prisma");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const upload_1 = require("../middleware/upload");
const notification_1 = require("../services/notification");
const router = (0, express_1.Router)();
// Get KYC status
router.get('/status', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
            kycStatus: true,
            kycSubmittedAt: true,
            kycApprovedAt: true,
            kycRejectedAt: true,
            kycRejectionReason: true
        }
    });
    const documents = await prisma_1.prisma.kycDocument.findMany({
        where: { userId: req.user.id }
    });
    res.json({
        success: true,
        data: {
            ...user,
            documents
        }
    });
}));
// Submit KYC
router.post('/submit', auth_1.authenticate, upload_1.uploadKycDocuments, upload_1.handleUploadError, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { documentType, documentNumber } = req.body;
    if (!documentType) {
        throw new errorHandler_1.AppError('Document type is required', 400);
    }
    const files = req.files;
    if (!files?.frontImage || !files?.selfieImage) {
        throw new errorHandler_1.AppError('Front image and selfie are required', 400);
    }
    // Check if already submitted
    const existing = await prisma_1.prisma.kycDocument.findFirst({
        where: { userId: req.user.id }
    });
    if (existing) {
        throw new errorHandler_1.AppError('KYC already submitted', 400);
    }
    // Create KYC document
    const kycDoc = await prisma_1.prisma.kycDocument.create({
        data: {
            userId: req.user.id,
            documentType,
            documentNumber,
            frontImage: files.frontImage[0].path,
            backImage: files.backImage?.[0]?.path,
            selfieImage: files.selfieImage[0].path
        }
    });
    // Update user KYC status
    await prisma_1.prisma.user.update({
        where: { id: req.user.id },
        data: {
            kycStatus: 'PENDING',
            kycSubmittedAt: new Date()
        }
    });
    // Notify admins
    const notificationService = new notification_1.NotificationService(req.app.get('io'));
    await notificationService.sendAdminNotification('New KYC Submission', `User ${req.user.id} has submitted KYC documents for review`, { userId: req.user.id, documentType });
    res.status(201).json({
        success: true,
        message: 'KYC submitted successfully',
        data: kycDoc
    });
}));
// Resubmit KYC (if rejected)
router.post('/resubmit', auth_1.authenticate, upload_1.uploadKycDocuments, upload_1.handleUploadError, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { documentType, documentNumber } = req.body;
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: req.user.id },
        select: { kycStatus: true }
    });
    if (user?.kycStatus !== 'REJECTED') {
        throw new errorHandler_1.AppError('Can only resubmit if previously rejected', 400);
    }
    const files = req.files;
    // Delete old documents
    await prisma_1.prisma.kycDocument.deleteMany({
        where: { userId: req.user.id }
    });
    // Create new KYC document
    const kycDoc = await prisma_1.prisma.kycDocument.create({
        data: {
            userId: req.user.id,
            documentType,
            documentNumber,
            frontImage: files.frontImage[0].path,
            backImage: files.backImage?.[0]?.path,
            selfieImage: files.selfieImage[0].path
        }
    });
    // Update user KYC status
    await prisma_1.prisma.user.update({
        where: { id: req.user.id },
        data: {
            kycStatus: 'PENDING',
            kycSubmittedAt: new Date(),
            kycRejectedAt: null,
            kycRejectionReason: null
        }
    });
    // Notify admins
    const notificationService = new notification_1.NotificationService(req.app.get('io'));
    await notificationService.sendAdminNotification('KYC Resubmitted', `User ${req.user.id} has resubmitted KYC documents`, { userId: req.user.id, documentType });
    res.status(201).json({
        success: true,
        message: 'KYC resubmitted successfully',
        data: kycDoc
    });
}));
exports.default = router;
//# sourceMappingURL=kyc.js.map