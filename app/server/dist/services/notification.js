"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const prisma_1 = require("../utils/prisma");
class NotificationService {
    io;
    emailTransporter = null;
    constructor(io) {
        this.io = io;
        this.initializeEmailTransporter();
    }
    initializeEmailTransporter() {
        // Initialize SendGrid or SMTP transporter
        if (process.env.SENDGRID_API_KEY) {
            this.emailTransporter = nodemailer_1.default.createTransport({
                host: 'smtp.sendgrid.net',
                port: 587,
                auth: {
                    user: 'apikey',
                    pass: process.env.SENDGRID_API_KEY
                }
            });
        }
        else if (process.env.SMTP_HOST) {
            this.emailTransporter = nodemailer_1.default.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587'),
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });
        }
    }
    // Create and send in-app notification
    async createNotification(data) {
        try {
            // Save to database
            const notification = await prisma_1.prisma.notification.create({
                data: {
                    userId: data.userId,
                    type: data.type,
                    title: data.title,
                    message: data.message,
                    actionUrl: data.actionUrl
                }
            });
            // Emit to user's room
            this.io.to(`user_${data.userId}`).emit('new_notification', {
                id: notification.id,
                type: data.type,
                title: data.title,
                message: data.message,
                actionUrl: data.actionUrl,
                createdAt: notification.createdAt,
                isRead: false
            });
            // Update unread count
            await this.updateUnreadCount(data.userId);
            // Send email notification if enabled
            await this.sendEmailNotification(data);
        }
        catch (error) {
            console.error('Error creating notification:', error);
        }
    }
    // Send email notification
    async sendEmailNotification(data) {
        if (!this.emailTransporter)
            return;
        try {
            // Get user email
            const user = await prisma_1.prisma.user.findUnique({
                where: { id: data.userId },
                select: { email: true }
            });
            if (!user?.email)
                return;
            const emailData = {
                to: user.email,
                subject: data.title,
                html: this.generateEmailTemplate(data),
                text: data.message
            };
            await this.emailTransporter.sendMail({
                from: process.env.EMAIL_FROM || 'noreply@giftcardpro.com',
                to: emailData.to,
                subject: emailData.subject,
                html: emailData.html,
                text: emailData.text
            });
            // Update notification record
            await prisma_1.prisma.notification.updateMany({
                where: {
                    userId: data.userId,
                    title: data.title,
                    emailSent: false
                },
                data: {
                    emailSent: true,
                    emailSentAt: new Date()
                }
            });
        }
        catch (error) {
            console.error('Error sending email notification:', error);
        }
    }
    // Generate HTML email template
    generateEmailTemplate(data) {
        return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${data.title}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 20px; margin: 20px 0; }
          .button { display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; }
          .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>GiftCard Pro</h1>
          </div>
          <div class="content">
            <h2>${data.title}</h2>
            <p>${data.message}</p>
            ${data.actionUrl ? `<a href="${data.actionUrl}" class="button">View Details</a>` : ''}
          </div>
          <div class="footer">
            <p>This is an automated message from GiftCard Pro. Please do not reply to this email.</p>
            <p>&copy; ${new Date().getFullYear()} GiftCard Pro. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    }
    // Update unread notification count
    async updateUnreadCount(userId) {
        try {
            const count = await prisma_1.prisma.notification.count({
                where: {
                    userId,
                    isRead: false
                }
            });
            this.io.to(`user_${userId}`).emit('unread_count', count);
        }
        catch (error) {
            console.error('Error updating unread count:', error);
        }
    }
    // Mark notification as read
    async markAsRead(notificationId, userId) {
        try {
            await prisma_1.prisma.notification.update({
                where: {
                    id: notificationId,
                    userId
                },
                data: {
                    isRead: true,
                    readAt: new Date()
                }
            });
            await this.updateUnreadCount(userId);
        }
        catch (error) {
            console.error('Error marking notification as read:', error);
        }
    }
    // Mark all notifications as read
    async markAllAsRead(userId) {
        try {
            await prisma_1.prisma.notification.updateMany({
                where: {
                    userId,
                    isRead: false
                },
                data: {
                    isRead: true,
                    readAt: new Date()
                }
            });
            await this.updateUnreadCount(userId);
        }
        catch (error) {
            console.error('Error marking all notifications as read:', error);
        }
    }
    // Send OTP email
    async sendOtpEmail(email, code, type) {
        if (!this.emailTransporter) {
            console.log('Email transporter not configured. OTP:', code);
            return;
        }
        try {
            const subject = type === 'PASSWORD_RESET'
                ? 'Password Reset Code'
                : 'Verification Code';
            await this.emailTransporter.sendMail({
                from: process.env.EMAIL_FROM || 'noreply@giftcardpro.com',
                to: email,
                subject,
                html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>${subject}</h2>
            <p>Your verification code is:</p>
            <div style="background: #f3f4f6; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 20px 0;">
              ${code}
            </div>
            <p>This code will expire in 10 minutes.</p>
            <p>If you didn't request this code, please ignore this email.</p>
          </div>
        `,
                text: `Your verification code is: ${code}. This code will expire in 10 minutes.`
            });
        }
        catch (error) {
            console.error('Error sending OTP email:', error);
        }
    }
    // Send broadcast notification to all users
    async sendBroadcast(title, message, actionUrl) {
        try {
            const users = await prisma_1.prisma.user.findMany({
                select: { id: true }
            });
            for (const user of users) {
                await this.createNotification({
                    userId: user.id,
                    type: 'SYSTEM',
                    title,
                    message,
                    actionUrl
                });
            }
            // Emit to all connected clients
            this.io.emit('broadcast', { title, message, actionUrl });
        }
        catch (error) {
            console.error('Error sending broadcast:', error);
        }
    }
    // Send admin notification
    async sendAdminNotification(title, message, data) {
        this.io.to('admin_room').emit('admin_notification', {
            title,
            message,
            data,
            timestamp: new Date().toISOString()
        });
    }
}
exports.NotificationService = NotificationService;
//# sourceMappingURL=notification.js.map