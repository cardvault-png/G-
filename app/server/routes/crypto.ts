import { Router } from 'express';
import { CryptoRateService } from '../services/cryptoRate';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Get all crypto rates
router.get('/rates', asyncHandler(async (req, res) => {
  const cryptoService = new CryptoRateService({} as any);
  const rates = await cryptoService.getCurrentRates();

  res.json({
    success: true,
    data: rates
  });
}));

// Get specific crypto rate
router.get('/rates/:symbol', asyncHandler(async (req, res) => {
  const { symbol } = req.params;
  const cryptoService = new CryptoRateService({} as any);
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
router.post('/convert', asyncHandler(async (req, res) => {
  const { amount, from, to } = req.body;

  if (!amount || !from || !to) {
    return res.status(400).json({
      success: false,
      message: 'Amount, from, and to are required'
    });
  }

  const cryptoService = new CryptoRateService({} as any);
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

export default router;
