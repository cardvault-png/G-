"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncHandler = exports.errorHandler = exports.AppError = void 0;
class AppError extends Error {
    statusCode;
    code;
    constructor(message, statusCode = 500, code) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);
    // Default error values
    let statusCode = 500;
    let message = 'Internal server error';
    let code;
    // Handle AppError
    if (err instanceof AppError) {
        statusCode = err.statusCode;
        message = err.message;
        code = err.code;
    }
    // Handle Prisma errors
    if (err.name === 'PrismaClientKnownRequestError') {
        const prismaError = err;
        if (prismaError.code === 'P2002') {
            statusCode = 409;
            message = 'Duplicate entry. This record already exists.';
            code = 'DUPLICATE_ENTRY';
        }
        else if (prismaError.code === 'P2025') {
            statusCode = 404;
            message = 'Record not found';
            code = 'NOT_FOUND';
        }
        else if (prismaError.code === 'P2003') {
            statusCode = 400;
            message = 'Foreign key constraint failed';
            code = 'CONSTRAINT_ERROR';
        }
    }
    // Handle validation errors
    if (err.name === 'ValidationError') {
        statusCode = 400;
        message = err.message;
        code = 'VALIDATION_ERROR';
    }
    // Handle JWT errors
    if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        message = 'Invalid token';
        code = 'INVALID_TOKEN';
    }
    if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        message = 'Token expired';
        code = 'TOKEN_EXPIRED';
    }
    // Handle multer errors
    if (err.name === 'MulterError') {
        statusCode = 400;
        message = err.message;
        code = 'FILE_UPLOAD_ERROR';
    }
    // Send response
    res.status(statusCode).json({
        success: false,
        message,
        code,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};
exports.errorHandler = errorHandler;
// Async handler wrapper
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
exports.asyncHandler = asyncHandler;
//# sourceMappingURL=errorHandler.js.map