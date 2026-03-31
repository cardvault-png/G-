"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CryptoRateService = void 0;
const prisma_1 = require("../utils/prisma");
class CryptoRateService {
    io;
    isRunning = false;
    updateInterval = null;
    UPDATE_INTERVAL = 60000; // 60 seconds
    COINS = ['bitcoin', 'ethereum', 'tether', 'binancecoin', 'solana'];
    SYMBOL_MAP = {
        'bitcoin': 'BTC',
        'ethereum': 'ETH',
        'tether': 'USDT',
        'binancecoin': 'BNB',
        'solana': 'SOL'
    };
    NAME_MAP = {
        'bitcoin': 'Bitcoin',
        'ethereum': 'Ethereum',
        'tether': 'Tether',
        'binancecoin': 'BNB',
        'solana': 'Solana'
    };
    constructor(io) {
        this.io = io;
    }
    async start() {
        if (this.isRunning)
            return;
        this.isRunning = true;
        console.log('Starting crypto rate service...');
        // Initial fetch
        await this.fetchAndUpdateRates();
        // Start update loop
        this.updateInterval = setInterval(() => {
            this.fetchAndUpdateRates();
        }, this.UPDATE_INTERVAL);
    }
    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        this.isRunning = false;
        console.log('Crypto rate service stopped');
    }
    async fetchAndUpdateRates() {
        try {
            const rates = await this.fetchCryptoRates();
            for (const rate of rates) {
                await this.updateRateInDatabase(rate);
            }
            // Emit updated rates to all connected clients
            this.io.emit('crypto_rates_update', rates);
            console.log('Crypto rates updated successfully');
        }
        catch (error) {
            console.error('Error fetching crypto rates:', error);
        }
    }
    async fetchCryptoRates() {
        try {
            const apiKey = process.env.COINGECKO_API_KEY;
            const url = `https://api.coingecko.com/api/v3/simple/price?ids=${this.COINS.join(',')}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`;
            const headers = {};
            if (apiKey) {
                headers['x-cg-pro-api-key'] = apiKey;
            }
            const response = await fetch(url, { headers });
            if (!response.ok) {
                throw new Error(`CoinGecko API error: ${response.status}`);
            }
            const data = await response.json();
            return this.COINS.map(coin => ({
                symbol: this.SYMBOL_MAP[coin],
                name: this.NAME_MAP[coin],
                priceUsd: data[coin]?.usd || 0,
                change24h: data[coin]?.usd_24h_change || 0,
                volume24h: data[coin]?.usd_24h_vol || 0,
                marketCap: data[coin]?.usd_market_cap || 0
            }));
        }
        catch (error) {
            console.error('Error fetching from CoinGecko:', error);
            // Fallback: return cached rates from database
            return this.getCachedRates();
        }
    }
    async updateRateInDatabase(data) {
        try {
            await prisma_1.prisma.cryptoRate.upsert({
                where: { symbol: data.symbol },
                update: {
                    priceUsd: data.priceUsd,
                    change24h: data.change24h,
                    volume24h: data.volume24h,
                    marketCap: data.marketCap,
                    lastUpdated: new Date()
                },
                create: {
                    symbol: data.symbol,
                    name: data.name,
                    priceUsd: data.priceUsd,
                    change24h: data.change24h,
                    volume24h: data.volume24h,
                    marketCap: data.marketCap
                }
            });
        }
        catch (error) {
            console.error(`Error updating rate for ${data.symbol}:`, error);
        }
    }
    async getCachedRates() {
        try {
            const rates = await prisma_1.prisma.cryptoRate.findMany({
                orderBy: { lastUpdated: 'desc' }
            });
            return rates.map(rate => ({
                symbol: rate.symbol,
                name: rate.name,
                priceUsd: parseFloat(rate.priceUsd.toString()),
                change24h: rate.change24h,
                volume24h: parseFloat(rate.volume24h.toString()),
                marketCap: parseFloat(rate.marketCap.toString())
            }));
        }
        catch (error) {
            console.error('Error getting cached rates:', error);
            return [];
        }
    }
    // Public method to get current rates
    async getCurrentRates() {
        const rates = await prisma_1.prisma.cryptoRate.findMany({
            orderBy: { lastUpdated: 'desc' }
        });
        if (rates.length === 0) {
            // If no cached rates, fetch fresh
            return this.fetchCryptoRates();
        }
        return rates.map(rate => ({
            symbol: rate.symbol,
            name: rate.name,
            priceUsd: parseFloat(rate.priceUsd.toString()),
            change24h: rate.change24h,
            volume24h: parseFloat(rate.volume24h.toString()),
            marketCap: parseFloat(rate.marketCap.toString())
        }));
    }
    // Get single crypto rate
    async getRate(symbol) {
        const rate = await prisma_1.prisma.cryptoRate.findUnique({
            where: { symbol: symbol.toUpperCase() }
        });
        if (!rate)
            return null;
        return {
            symbol: rate.symbol,
            name: rate.name,
            priceUsd: parseFloat(rate.priceUsd.toString()),
            change24h: rate.change24h,
            volume24h: parseFloat(rate.volume24h.toString()),
            marketCap: parseFloat(rate.marketCap.toString())
        };
    }
    // Convert amount between currencies
    async convert(amount, fromSymbol, toSymbol) {
        if (fromSymbol === toSymbol)
            return amount;
        const fromRate = await this.getRate(fromSymbol);
        const toRate = await this.getRate(toSymbol);
        if (!fromRate || !toRate) {
            throw new Error('Exchange rate not available');
        }
        const usdValue = amount * fromRate.priceUsd;
        return usdValue / toRate.priceUsd;
    }
}
exports.CryptoRateService = CryptoRateService;
//# sourceMappingURL=cryptoRate.js.map