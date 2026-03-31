"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const cryptoRate_1 = require("../services/cryptoRate");
const errorHandler_1 = require("../middleware/errorHandler");
const router = (0, express_1.Router)();
// Get all crypto rates
router.get('/rates', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const cryptoService = new cryptoRate_1.CryptoRateService({});
    const rates = await cryptoService.getCurrentRates();
    res.json({
        success: true,
        data: rates
    });
}));
// Get specific crypto rate
router.get('/rates/:symbol', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { symbol } = req.params;
    const cryptoService = new cryptoRate_1.CryptoRateService({});
    const rate = await cryptoService.getRate(symbol.toUpperCase());
    if (!rate) {
        return res.status(404).json({
            success: false,
            message: 'Crypto rate not found'
        });
    }
    res.json({
        success: true,
        data: rate
    });
}));
// Convert amount
router.post('/convert', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { amount, from, to } = req.body;
    if (!amount || !from || !to) {
        return res.status(400).json({
            success: false,
            message: 'Amount, from, and to are required'
        });
    }
    const cryptoService = new cryptoRate_1.CryptoRateService({});
    const converted = await cryptoService.convert(parseFloat(amount), from.toUpperCase(), to.toUpperCase());
    res.json({
        success: true,
        data: {
            amount: parseFloat(amount),
            from: from.toUpperCase(),
            to: to.toUpperCase(),
            result: converted
        }
    });
}));
exports.default = router;
//# sourceMappingURL=crypto.js.map