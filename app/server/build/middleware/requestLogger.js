"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogger = void 0;
const prisma_1 = require("../utils/prisma");
const requestLogger = (req, res, next) => {
    const start = Date.now();
    res.on('finish', async () => {
        const duration = Date.now() - start;
        const userId = req.user?.id;
        // Log to console
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms - ${req.ip}`);
        // Log sensitive operations to audit log
        const sensitiveMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
        const sensitivePaths = [
            '/api/auth',
            '/api/wallet',
            '/api/transactions',
            '/api/giftcards',
            '/api/admin',
            '/api/kyc',
            '/api/bank'
        ];
        const isSensitive = sensitiveMethods.includes(req.method) &&
            sensitivePaths.some(path => req.originalUrl.startsWith(path));
        if (isSensitive && process.env.NODE_ENV === 'production') {
            try {
                await prisma_1.prisma.auditLog.create({
                    data: {
                        userId,
                        action: req.method,
                        entityType: req.originalUrl.split('/')[2]?.toUpperCase() || 'UNKNOWN',
                        oldData: { path: req.originalUrl, query: req.query },
                        newData: { statusCode: res.statusCode },
                        ipAddress: req.ip || 'unknown',
                        userAgent: req.headers['user-agent'] || 'unknown',
                    }
                });
            }
            catch (error) {
                console.error('Audit log error:', error);
            }
        }
    });
    next();
};
exports.requestLogger = requestLogger;
//# sourceMappingURL=requestLogger.js.map