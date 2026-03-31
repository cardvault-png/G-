"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleUploadError = exports.uploadGiftCardImages = exports.uploadKycDocuments = exports.uploadMultiple = exports.uploadSingle = exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Ensure upload directories exist
const uploadDirs = [
    './uploads/kyc',
    './uploads/giftcards',
    './uploads/appeals',
    './uploads/avatars'
];
uploadDirs.forEach(dir => {
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
});
// Configure storage
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        let uploadPath = './uploads/';
        if (req.originalUrl.includes('/kyc')) {
            uploadPath += 'kyc';
        }
        else if (req.originalUrl.includes('/giftcards')) {
            uploadPath += 'giftcards';
        }
        else if (req.originalUrl.includes('/appeals')) {
            uploadPath += 'appeals';
        }
        else {
            uploadPath += 'avatars';
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path_1.default.extname(file.originalname);
        const prefix = req.originalUrl.includes('/kyc') ? 'kyc' :
            req.originalUrl.includes('/giftcards') ? 'card' : 'file';
        cb(null, `${prefix}-${uniqueSuffix}${ext}`);
    }
});
// File filter
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and PDF are allowed.'));
    }
};
// Configure multer
exports.upload = (0, multer_1.default)({
    storage,
    fileFilter,
    limits: {
        fileSize: parseInt(process.env.UPLOAD_MAX_SIZE || '10485760'), // 10MB
        files: 5
    }
});
// Single file upload middleware
const uploadSingle = (fieldName) => exports.upload.single(fieldName);
exports.uploadSingle = uploadSingle;
// Multiple files upload middleware
const uploadMultiple = (fields) => {
    return exports.upload.fields(fields);
};
exports.uploadMultiple = uploadMultiple;
// KYC document upload
exports.uploadKycDocuments = exports.upload.fields([
    { name: 'frontImage', maxCount: 1 },
    { name: 'backImage', maxCount: 1 },
    { name: 'selfieImage', maxCount: 1 }
]);
// Gift card images upload
exports.uploadGiftCardImages = exports.upload.fields([
    { name: 'imageFront', maxCount: 1 },
    { name: 'imageBack', maxCount: 1 },
    { name: 'imageScratched', maxCount: 1 }
]);
// Error handler for multer
const handleUploadError = (error, req, res, next) => {
    if (error instanceof multer_1.default.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File too large. Maximum size is 10MB.',
                code: 'FILE_TOO_LARGE'
            });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                message: 'Too many files uploaded.',
                code: 'TOO_MANY_FILES'
            });
        }
        if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
                success: false,
                message: 'Unexpected field name in file upload.',
                code: 'UNEXPECTED_FIELD'
            });
        }
    }
    if (error) {
        return res.status(400).json({
            success: false,
            message: error.message,
            code: 'UPLOAD_ERROR'
        });
    }
    next();
};
exports.handleUploadError = handleUploadError;
//# sourceMappingURL=upload.js.map