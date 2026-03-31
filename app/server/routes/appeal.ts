import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { authenticate, requireAdmin } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { NotificationService } from '../services/notification';

const router = Router();

// Submit appeal (for banned users)
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const { subject, message, evidence } = req.body;

  if (!subject || !message) {
    throw new AppError('Subject and message are required', 400);
  }

  // Check if user is banned
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { isBanned: true }
  });

  if (!user?.isBanned) {
    throw new AppError('Only banned users can submit appeals', 400);
  }

  // Check for existing pending appeal
  const existing = await prisma.appeal.findFirst({
    where: {
      userId: req.user!.id,
      status: 'PENDING'
    }
  });

  if (existing) {
    throw new AppError('You already have a pending appeal', 400);
  }

  const appeal = await prisma.appeal.create({
    data: {
      userId: req.user!.id,
      subject,
      message,
      evidence
    }
  });

  // Notify admins
  const notificationService = new NotificationService({} as any);
  await notificationService.sendAdminNotification(
    'New Appeal Submitted',
    `User ${req.user!.id} has submitted an appeal: ${subject}`,
    { appealId: appeal.id, userId: req.user!.id }
  );

  res.status(201).json({
    success: true,
    message: 'Appeal submitted successfully',
    data: appeal
  });
}));

// Get user's appeals
router.get('/my-appeals', authenticate, asyncHandler(async (req, res) => {
  const appeals = await prisma.appeal.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' }
  });

  res.json({
    success: true,
    data: appeals
  });
}));

// Admin: Get all appeals
router.get('/', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;

  const where: any = {};
  if (status) where.status = status;

  const [appeals, total] = await Promise.all([
    prisma.appeal.findMany({
      where,
      include: {
        user: {
          select: { fullName: true, email: true, username: true, banReason: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit)
    }),
    prisma.appeal.count({ where })
  ]);

  res.json({
    success: true,
    data: {
      appeals,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    }
  });
}));

// Admin: Review appeal
router.post('/:id/review', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { approve, adminNotes } = req.body;

  const appeal = await prisma.appeal.findUnique({
    where: { id },
    include: { user: true }
  });

  if (!appeal) {
    throw new AppError('Appeal not found', 404);
  }

  if (appeal.status !== 'PENDING') {
    throw new AppError('Appeal has already been reviewed', 400);
  }

  await prisma.$transaction(async (tx) => {
    // Update appeal
    await tx.appeal.update({
      where: { id },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        reviewedBy: req.user!.id,
        adminNotes,
        reviewedAt: new Date()
      }
    });

    // If approved, unban user
    if (approve) {
      await tx.user.update({
        where: { id: appeal.userId },
        data: {
          isBanned: false,
          banReason: null
        }
      });
    }
  });

  // Send notification
  const notificationService = new NotificationService({} as any);
  await notificationService.createNotification({
    userId: appeal.userId,
    type: 'SECURITY',
    title: approve ? 'Appeal Approved' : 'Appeal Rejected',
    message: approve 
      ? 'Your appeal has been approved and your account has been restored.' 
      : `Your appeal has been rejected. Notes: ${adminNotes}`,
    actionUrl: '/support'
  });

  res.json({
    success: true,
    message: approve ? 'Appeal approved and user unbanned' : 'Appeal rejected'
  });
}));

export default router;
