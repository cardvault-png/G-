"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../utils/prisma");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const notification_1 = require("../services/notification");
const router = (0, express_1.Router)();
// Get user notifications
router.get('/', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { page = 1, limit = 20, unreadOnly } = req.query;
    const where = { userId: req.user.id };
    if (unreadOnly === 'true') {
        where.isRead = false;
    }
    const [notifications, total, unreadCount] = await Promise.all([
        prisma_1.prisma.notification.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (Number(page) - 1) * Number(limit),
            take: Number(limit)
        }),
        prisma_1.prisma.notification.count({ where: { userId: req.user.id } }),
        prisma_1.prisma.notification.count({
            where: { userId: req.user.id, isRead: false }
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
router.get('/unread-count', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const count = await prisma_1.prisma.notification.count({
        where: { userId: req.user.id, isRead: false }
    });
    res.json({
        success: true,
        data: { count }
    });
}));
// Mark as read
router.patch('/:id/read', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const notification = await prisma_1.prisma.notification.findFirst({
        where: { id, userId: req.user.id }
    });
    if (!notification) {
        throw new errorHandler_1.AppError('Notification not found', 404);
    }
    const notificationService = new notification_1.NotificationService(req.app.get('io'));
    await notificationService.markAsRead(id, req.user.id);
    res.json({
        success: true,
        message: 'Notification marked as read'
    });
}));
// Mark all as read
router.patch('/read-all', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const notificationService = new notification_1.NotificationService(req.app.get('io'));
    await notificationService.markAllAsRead(req.user.id);
    res.json({
        success: true,
        message: 'All notifications marked as read'
    });
}));
// Delete notification
router.delete('/:id', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const notification = await prisma_1.prisma.notification.findFirst({
        where: { id, userId: req.user.id }
    });
    if (!notification) {
        throw new errorHandler_1.AppError('Notification not found', 404);
    }
    await prisma_1.prisma.notification.delete({
        where: { id }
    });
    res.json({
        success: true,
        message: 'Notification deleted'
    });
}));
exports.default = router;
//# sourceMappingURL=notification.js.map