"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FraudDetectionService = void 0;
const prisma_1 = require("../utils/prisma");
class FraudDetectionService {
    SCORE_THRESHOLD = parseInt(process.env.FRAUD_SCORE_THRESHOLD || '60');
    LOCK_THRESHOLD = parseInt(process.env.FRAUD_LOCK_THRESHOLD || '80');
    // Check gift card for fraud
    async checkGiftCard(data) {
        let score = 0;
        const flags = [];
        try {
            // 1. Check if new account + high value
            const user = await prisma_1.prisma.user.findUnique({
                where: { id: data.userId },
                select: {
                    createdAt: true,
                    giftCards: {
                        select: { id: true },
                        take: 1
                    }
                }
            });
            if (user) {
                const accountAge = Date.now() - user.createdAt.getTime();
                const isNewAccount = accountAge < 7 * 24 * 60 * 60 * 1000; // 7 days
                if (isNewAccount && data.cardValue > 500) {
                    score += 20;
                    flags.push('NEW_ACCOUNT_HIGH_VALUE');
                }
                // Check if first transaction
                if (user.giftCards.length === 0 && data.cardValue > 200) {
                    score += 10;
                    flags.push('FIRST_TRANSACTION_HIGH_VALUE');
                }
            }
            // 2. Check multiple uploads in short time
            const recentUploads = await prisma_1.prisma.giftCard.count({
                where: {
                    userId: data.userId,
                    createdAt: {
                        gte: new Date(Date.now() - 5 * 60 * 1000) // 5 minutes
                    }
                }
            });
            if (recentUploads >= 3) {
                score += 15;
                flags.push('MULTIPLE_UPLOADS_5MIN');
            }
            // 3. Check OCR confidence
            if (data.ocrConfidence < 0.7) {
                score += 20;
                flags.push('LOW_OCR_CONFIDENCE');
            }
            else if (data.ocrConfidence < 0.85) {
                score += 10;
                flags.push('MEDIUM_OCR_CONFIDENCE');
            }
            // 4. Check for duplicate PIN
            const duplicatePin = await prisma_1.prisma.giftCard.findFirst({
                where: {
                    pinCode: data.pinCode,
                    userId: { not: data.userId }
                }
            });
            if (duplicatePin) {
                score += 40;
                flags.push('DUPLICATE_PIN');
            }
            // 5. Check IP reputation
            const ipHistory = await this.checkIpReputation(data.ipAddress, data.userId);
            score += ipHistory.score;
            flags.push(...ipHistory.flags);
            // 6. Check device fingerprint
            if (data.deviceFingerprint) {
                const deviceHistory = await this.checkDeviceReputation(data.deviceFingerprint, data.userId);
                score += deviceHistory.score;
                flags.push(...deviceHistory.flags);
            }
            // 7. Check for suspicious PIN patterns
            if (this.isSuspiciousPin(data.pinCode)) {
                score += 15;
                flags.push('SUSPICIOUS_PIN_PATTERN');
            }
            // Determine risk level
            const riskLevel = this.getRiskLevel(score);
            const shouldBlock = score >= this.LOCK_THRESHOLD;
            // If critical risk, temporarily lock account
            if (shouldBlock) {
                await this.flagAccount(data.userId, score, flags);
            }
            return {
                score,
                flags,
                riskLevel,
                shouldBlock
            };
        }
        catch (error) {
            console.error('Error in fraud detection:', error);
            return {
                score: 0,
                flags: ['ERROR_IN_CHECK'],
                riskLevel: 'MEDIUM',
                shouldBlock: false
            };
        }
    }
    // Check transaction for fraud
    async checkTransaction(data) {
        let score = 0;
        const flags = [];
        try {
            // 1. Check account age vs transaction amount
            const user = await prisma_1.prisma.user.findUnique({
                where: { id: data.userId },
                select: {
                    createdAt: true,
                    kycStatus: true,
                    transactions: {
                        where: { status: 'COMPLETED' },
                        select: { amount: true }
                    }
                }
            });
            if (user) {
                const accountAge = Date.now() - user.createdAt.getTime();
                const isNewAccount = accountAge < 7 * 24 * 60 * 60 * 1000;
                // New account with high withdrawal
                if (isNewAccount && data.type === 'WITHDRAWAL' && data.amount > 1000) {
                    score += 25;
                    flags.push('NEW_ACCOUNT_HIGH_WITHDRAWAL');
                }
                // No KYC with high amount
                if (user.kycStatus !== 'APPROVED' && data.amount > 500) {
                    score += 20;
                    flags.push('NO_KYC_HIGH_AMOUNT');
                }
                // Check total volume vs this transaction
                const totalVolume = user.transactions.reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0);
                if (totalVolume > 0 && data.amount > totalVolume * 2) {
                    score += 15;
                    flags.push('UNUSUAL_TRANSACTION_SIZE');
                }
            }
            // 2. Check rapid transactions
            const recentTransactions = await prisma_1.prisma.transaction.count({
                where: {
                    userId: data.userId,
                    createdAt: {
                        gte: new Date(Date.now() - 60 * 60 * 1000) // 1 hour
                    }
                }
            });
            if (recentTransactions >= 5) {
                score += 15;
                flags.push('RAPID_TRANSACTIONS');
            }
            // 3. Check IP reputation
            const ipHistory = await this.checkIpReputation(data.ipAddress, data.userId);
            score += ipHistory.score;
            flags.push(...ipHistory.flags);
            // 4. Check device fingerprint
            if (data.deviceFingerprint) {
                const deviceHistory = await this.checkDeviceReputation(data.deviceFingerprint, data.userId);
                score += deviceHistory.score;
                flags.push(...deviceHistory.flags);
            }
            // Determine risk level
            const riskLevel = this.getRiskLevel(score);
            const shouldBlock = score >= this.LOCK_THRESHOLD;
            return {
                score,
                flags,
                riskLevel,
                shouldBlock
            };
        }
        catch (error) {
            console.error('Error in transaction fraud detection:', error);
            return {
                score: 0,
                flags: ['ERROR_IN_CHECK'],
                riskLevel: 'MEDIUM',
                shouldBlock: false
            };
        }
    }
    // Check IP reputation
    async checkIpReputation(ipAddress, userId) {
        let score = 0;
        const flags = [];
        try {
            // Check for failed login attempts from this IP
            const failedLogins = await prisma_1.prisma.loginAttempt.count({
                where: {
                    ipAddress,
                    success: false,
                    createdAt: {
                        gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours
                    }
                }
            });
            if (failedLogins >= 5) {
                score += 25;
                flags.push('IP_FAILED_LOGINS');
            }
            // Check if IP is used by multiple accounts
            const uniqueUsers = await prisma_1.prisma.loginAttempt.groupBy({
                by: ['userId'],
                where: {
                    ipAddress,
                    createdAt: {
                        gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
                    }
                }
            });
            if (uniqueUsers.length > 3) {
                score += 15;
                flags.push('IP_MULTIPLE_ACCOUNTS');
            }
            // Check for banned users from this IP
            const bannedUsers = await prisma_1.prisma.user.count({
                where: {
                    isBanned: true,
                    id: {
                        in: uniqueUsers.map(u => u.userId).filter(Boolean)
                    }
                }
            });
            if (bannedUsers > 0) {
                score += 20;
                flags.push('IP_BANNED_USERS');
            }
            return { score, flags };
        }
        catch (error) {
            console.error('Error checking IP reputation:', error);
            return { score: 0, flags: [] };
        }
    }
    // Check device reputation
    async checkDeviceReputation(deviceFingerprint, userId) {
        let score = 0;
        const flags = [];
        try {
            // Check if device is used by multiple users
            const deviceUsers = await prisma_1.prisma.user.count({
                where: {
                    deviceFingerprint,
                    id: { not: userId }
                }
            });
            if (deviceUsers > 2) {
                score += 15;
                flags.push('DEVICE_MULTIPLE_USERS');
            }
            // Check for device mismatch (user previously used different device)
            const user = await prisma_1.prisma.user.findUnique({
                where: { id: userId },
                select: { deviceFingerprint: true }
            });
            if (user?.deviceFingerprint && user.deviceFingerprint !== deviceFingerprint) {
                score += 10;
                flags.push('DEVICE_MISMATCH');
            }
            return { score, flags };
        }
        catch (error) {
            console.error('Error checking device reputation:', error);
            return { score: 0, flags: [] };
        }
    }
    // Check if PIN has suspicious pattern
    isSuspiciousPin(pin) {
        // Check for sequential numbers
        const sequential = /^(0123|1234|2345|3456|4567|5678|6789|7890|0987|9876|8765|7654|6543|5432|4321|3210)/;
        if (sequential.test(pin))
            return true;
        // Check for repeated digits
        const repeated = /^(\d)\1{3,}/;
        if (repeated.test(pin))
            return true;
        // Check for common patterns
        const commonPatterns = ['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999'];
        if (commonPatterns.includes(pin))
            return true;
        return false;
    }
    // Get risk level based on score
    getRiskLevel(score) {
        if (score >= this.LOCK_THRESHOLD)
            return 'CRITICAL';
        if (score >= this.SCORE_THRESHOLD)
            return 'HIGH';
        if (score >= 30)
            return 'MEDIUM';
        return 'LOW';
    }
    // Flag account for review
    async flagAccount(userId, score, flags) {
        try {
            // Log the fraud detection
            await prisma_1.prisma.auditLog.create({
                data: {
                    userId,
                    action: 'FRAUD_DETECTED',
                    entityType: 'USER',
                    entityId: userId,
                    newData: { score, flags },
                    ipAddress: 'system',
                    userAgent: 'fraud-detection-service'
                }
            });
            // If critical, could also notify admins
            // This would be handled by the notification service
        }
        catch (error) {
            console.error('Error flagging account:', error);
        }
    }
    // Calculate fraud score for image (AI analysis result)
    calculateImageFraudScore(blurScore, editScore, duplicateScore, ocrConfidence) {
        let score = 0;
        const flags = [];
        if (blurScore > 0.5) {
            score += 20;
            flags.push('BLURRED_IMAGE');
        }
        if (editScore > 0.3) {
            score += 30;
            flags.push('EDITED_IMAGE');
        }
        if (duplicateScore > 0.9) {
            score += 40;
            flags.push('DUPLICATE_IMAGE');
        }
        if (ocrConfidence < 0.7) {
            score += 15;
            flags.push('LOW_OCR_CONFIDENCE');
        }
        return { score, flags };
    }
}
exports.FraudDetectionService = FraudDetectionService;
//# sourceMappingURL=fraudDetection.js.map