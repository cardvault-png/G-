import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { NotificationService } from '../services/notification';

const router = Router();

// Get user notifications
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, unreadOnly } = req.query;

  const where: any = { userId: req.user!.id };
  if (unreadOnly === 'true') {
    where.isRead = false;
  }

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit)
    }),
    prisma.notification.count({ where: { userId: req.user!.id } }),
    prisma.notification.count({
      where: { userId: req.user!.id, isRead: false }
    })
  ]);

  res.json({
    success: true,
    data: {
      notifications,
      unreadCount,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    }
  });
}));

// Get unread count
router.get('/unread-count', authenticate, asyncHandler(async (req, res) => {
  const count = await prisma.notification.count({
    where: { userId: req.user!.id, isRead: false }
  });

  res.json({
    success: true,
    data: { count }
  });
}));

// Mark as read
router.patch('/:id/read', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const notification = await prisma.notification.findFirst({
    where: { id, userId: req.user!.id }
  });

  if (!notification) {
    throw new AppError('Notification not found', 404);
  }

  const notificationService = new NotificationService(req.app.get('io'));
  await notificationService.markAsRead(id, req.user!.id);

  res.json({
    success: true,
    message: 'Notification marked as read'
  });
}));

// Mark all as read
router.patch('/read-all', authenticate, asyncHandler(async (req, res) => {
  const notificationService = new NotificationService(req.app.get('io'));
  await notificationService.markAllAsRead(req.user!.id);

  res.json({
    success: true,
    message: 'All notifications marked as read'
  });
}));

// Delete notification
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const notification = await prisma.notification.findFirst({
    where: { id, userId: req.user!.id }
  });

  if (!notification) {
    throw new AppError('Notification not found', 404);
  }

  await prisma.notification.delete({
    where: { id }
  });

  res.json({
    success: true,
    message: 'Notification deleted'
  });
}));

export default router;
