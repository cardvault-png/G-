"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.giftCardRateLimiter = exports.strictRateLimiter = exports.apiRateLimiter = exports.clearLoginAttempts = exports.recordFailedLogin = exports.loginRateLimiter = exports.rateLimiter = void 0;
// In-memory store for rate limiting (use Redis in production)
const rateLimitStore = new Map();
const loginAttemptsStore = new Map();
// Clean up expired entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        if (entry.resetTime < now) {
            rateLimitStore.delete(key);
        }
    }
}, 60000);
const rateLimiter = (options = {}) => {
    const windowMs = options.windowMs || parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000');
    const maxRequests = options.maxRequests || parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100');
    const keyPrefix = options.keyPrefix || 'rate_limit';
    return (req, res, next) => {
        const key = `${keyPrefix}:${req.ip}`;
        const now = Date.now();
        const entry = rateLimitStore.get(key);
        if (!entry || entry.resetTime < now) {
            // Create new entry
            rateLimitStore.set(key, {
                count: 1,
                resetTime: now + windowMs
            });
            return next();
        }
        if (entry.count >= maxRequests) {
            return res.status(429).json({
                success: false,
                message: 'Too many requests. Please try again later.',
                code: 'RATE_LIMIT_EXCEEDED',
                retryAfter: Math.ceil((entry.resetTime - now) / 1000)
            });
        }
        entry.count++;
        next();
    };
};
exports.rateLimiter = rateLimiter;
// Specific rate limiter for login endpoints
const loginRateLimiter = (req, res, next) => {
    const identifier = req.body.email || req.body.phone || req.ip;
    const key = `login:${identifier}`;
    const now = Date.now();
    const maxAttempts = parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '5');
    const lockDuration = 15 * 60 * 1000; // 15 minutes
    const entry = loginAttemptsStore.get(key);
    // Check if account is locked
    if (entry?.lockUntil && entry.lockUntil > now) {
        const remainingTime = Math.ceil((entry.lockUntil - now) / 1000);
        return res.status(429).json({
            success: false,
            message: `Account temporarily locked. Please try again in ${Math.ceil(remainingTime / 60)} minutes.`,
            code: 'ACCOUNT_LOCKED',
            lockDuration: remainingTime
        });
    }
    // Reset if lock expired
    if (entry?.lockUntil && entry.lockUntil <= now) {
        loginAttemptsStore.delete(key);
    }
    next();
};
exports.loginRateLimiter = loginRateLimiter;
// Record failed login attempt
const recordFailedLogin = (identifier) => {
    const key = `login:${identifier}`;
    const maxAttempts = parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '5');
    const lockDuration = 15 * 60 * 1000; // 15 minutes
    const entry = loginAttemptsStore.get(key);
    if (!entry) {
        loginAttemptsStore.set(key, { count: 1 });
    }
    else {
        entry.count++;
        if (entry.count >= maxAttempts) {
            entry.lockUntil = Date.now() + lockDuration;
        }
    }
};
exports.recordFailedLogin = recordFailedLogin;
// Clear login attempts on successful login
const clearLoginAttempts = (identifier) => {
    const key = `login:${identifier}`;
    loginAttemptsStore.delete(key);
};
exports.clearLoginAttempts = clearLoginAttempts;
// API endpoint rate limiters
exports.apiRateLimiter = (0, exports.rateLimiter)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
    keyPrefix: 'api'
});
exports.strictRateLimiter = (0, exports.rateLimiter)({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    keyPrefix: 'strict'
});
// Gift card upload rate limiter
exports.giftCardRateLimiter = (0, exports.rateLimiter)({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 20,
    keyPrefix: 'giftcard'
});
//# sourceMappingURL=rateLimiter.js.map