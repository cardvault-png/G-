"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkBanStatus = exports.requireKyc = exports.requireSuperAdmin = exports.requireAdmin = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../utils/prisma");
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided.'
            });
        }
        const token = authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. Invalid token format.'
            });
        }
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        // Get user from database
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: decoded.userId },
            select: {
                id: true,
                email: true,
                phone: true,
                role: true,
                isBanned: true,
                kycStatus: true,
            }
        });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }
        if (user.isBanned) {
            return res.status(403).json({
                success: false,
                message: 'Account has been suspended. Please contact support.',
                code: 'ACCOUNT_BANNED'
            });
        }
        req.user = user;
        next();
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            return res.status(401).json({
                success: false,
                message: 'Token expired',
                code: 'TOKEN_EXPIRED'
            });
        }
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            return res.status(401).json({
                success: false,
                message: 'Invalid token',
                code: 'INVALID_TOKEN'
            });
        }
        console.error('Auth middleware error:', error);
        return res.status(500).json({
            success: false,
            message: 'Authentication error'
        });
    }
};
exports.authenticate = authenticate;
const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }
    if (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({
            success: false,
            message: 'Admin access required'
        });
    }
    next();
};
exports.requireAdmin = requireAdmin;
const requireSuperAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }
    if (req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({
            success: false,
            message: 'Super admin access required'
        });
    }
    next();
};
exports.requireSuperAdmin = requireSuperAdmin;
const requireKyc = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }
    if (req.user.kycStatus !== 'APPROVED') {
        return res.status(403).json({
            success: false,
            message: 'KYC verification required',
            code: 'KYC_REQUIRED',
            kycStatus: req.user.kycStatus
        });
    }
    next();
};
exports.requireKyc = requireKyc;
const checkBanStatus = async (req, res, next) => {
    if (!req.user) {
        return next();
    }
    try {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.user.id },
            select: { isBanned: true, banReason: true }
        });
        if (user?.isBanned) {
            return res.status(403).json({
                success: false,
                message: 'Account suspended',
                reason: user.banReason,
                code: 'ACCOUNT_BANNED'
            });
        }
        next();
    }
    catch (error) {
        console.error('Ban check error:', error);
        next();
    }
};
exports.checkBanStatus = checkBanStatus;
//# sourceMappingURL=auth.js.map