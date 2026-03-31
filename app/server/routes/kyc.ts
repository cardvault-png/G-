import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { uploadKycDocuments, handleUploadError } from '../middleware/upload';
import { NotificationService } from '../services/notification';

const router = Router();

// Get KYC status
router.get('/status', authenticate, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      kycStatus: true,
      kycSubmittedAt: true,
      kycApprovedAt: true,
      kycRejectedAt: true,
      kycRejectionReason: true
    }
  });

  const documents = await prisma.kycDocument.findMany({
    where: { userId: req.user!.id }
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
router.post('/submit',
  authenticate,
  uploadKycDocuments,
  handleUploadError,
  asyncHandler(async (req, res) => {
    const { documentType, documentNumber } = req.body;

    if (!documentType) {
      throw new AppError('Document type is required', 400);
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!files?.frontImage || !files?.selfieImage) {
      throw new AppError('Front image and selfie are required', 400);
    }

    // Check if already submitted
    const existing = await prisma.kycDocument.findFirst({
      where: { userId: req.user!.id }
    });

    if (existing) {
      throw new AppError('KYC already submitted', 400);
    }

    // Create KYC document
    const kycDoc = await prisma.kycDocument.create({
      data: {
        userId: req.user!.id,
        documentType,
        documentNumber,
        frontImage: files.frontImage[0].path,
        backImage: files.backImage?.[0]?.path,
        selfieImage: files.selfieImage[0].path
      }
    });

    // Update user KYC status
    await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        kycStatus: 'PENDING',
        kycSubmittedAt: new Date()
      }
    });

    // Notify admins
    const notificationService = new NotificationService(req.app.get('io'));
    await notificationService.sendAdminNotification(
      'New KYC Submission',
      `User ${req.user!.id} has submitted KYC documents for review`,
      { userId: req.user!.id, documentType }
    );

    res.status(201).json({
      success: true,
      message: 'KYC submitted successfully',
      data: kycDoc
    });
  })
);

// Resubmit KYC (if rejected)
router.post('/resubmit',
  authenticate,
  uploadKycDocuments,
  handleUploadError,
  asyncHandler(async (req, res) => {
    const { documentType, documentNumber } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { kycStatus: true }
    });

    if (user?.kycStatus !== 'REJECTED') {
      throw new AppError('Can only resubmit if previously rejected', 400);
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    // Delete old documents
    await prisma.kycDocument.deleteMany({
      where: { userId: req.user!.id }
    });

    // Create new KYC document
    const kycDoc = await prisma.kycDocument.create({
      data: {
        userId: req.user!.id,
        documentType,
        documentNumber,
        frontImage: files.frontImage[0].path,
        backImage: files.backImage?.[0]?.path,
        selfieImage: files.selfieImage[0].path
      }
    });

    // Update user KYC status
    await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        kycStatus: 'PENDING',
        kycSubmittedAt: new Date(),
        kycRejectedAt: null,
        kycRejectionReason: null
      }
    });

    // Notify admins
    const notificationService = new NotificationService(req.app.get('io'));
    await notificationService.sendAdminNotification(
      'KYC Resubmitted',
      `User ${req.user!.id} has resubmitted KYC documents`,
      { userId: req.user!.id, documentType }
    );

    res.status(201).json({
      success: true,
      message: 'KYC resubmitted successfully',
      data: kycDoc
    });
  })
);

export default router;
