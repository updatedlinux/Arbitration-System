const express = require('express');
const router = express.Router();
const pool = require('../config/database');

/**
 * @swagger
 * tags:
 *   name: Reports
 *   description: Reportes y estadísticas
 */

/**
 * @swagger
 * /reports/daily:
 *   get:
 *     summary: Obtener reporte diario
 *     tags: [Reports]
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha en formato YYYY-MM-DD
 */
router.get('/daily', async (req, res) => {
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ error: 'Se requiere parámetro date (YYYY-MM-DD)' });
    }

    try {
        // 1. Obtener ciclos del día
        const [cycles] = await pool.query(`
            SELECT c.*, 
                   (SELECT COUNT(*) FROM cycle_steps WHERE cycle_id = c.id) as step_count
            FROM cycles c 
            WHERE DATE(c.start_date) = ? 
            ORDER BY c.start_date ASC
        `, [date]);

        if (cycles.length === 0) {
            return res.json({
                hasData: false,
                date,
                message: `No hay datos de ciclos y/o operaciones realizadas en la fecha ${date}`
            });
        }

        const cycleIds = cycles.map(c => c.id);

        // 2. Obtener todos los pasos de los ciclos del día
        const [steps] = await pool.query(`
            SELECT cs.*, c.cycle_type 
            FROM cycle_steps cs
            JOIN cycles c ON cs.cycle_id = c.id
            WHERE cs.cycle_id IN (?)
            ORDER BY cs.id ASC
        `, [cycleIds]);

        // 3. Calcular métricas

        // USDT Vendidos (solo MAIN cycles, step SELL_USDT_TO_VES)
        const usdtSold = steps
            .filter(s => s.step_type === 'SELL_USDT_TO_VES')
            .reduce((sum, s) => sum + parseFloat(s.input_amount), 0);

        // USD Efectivo Comprado (ambos ciclos, step BUY_USD_CASH)
        const usdCashBought = steps
            .filter(s => s.step_type === 'BUY_USD_CASH')
            .reduce((sum, s) => sum + parseFloat(s.output_amount), 0);

        // VES Ganados en Spread (ves_surplus de BUY_USD_CASH)
        const vesEarned = steps
            .filter(s => s.step_type === 'BUY_USD_CASH' && s.ves_surplus)
            .reduce((sum, s) => sum + parseFloat(s.ves_surplus), 0);

        // VES Gastados en Compra (input_amount de BUY_USD_CASH)
        const vesSpent = steps
            .filter(s => s.step_type === 'BUY_USD_CASH')
            .reduce((sum, s) => sum + parseFloat(s.input_amount), 0);

        // USDC Depositados en Kontigo (output de DEPOSIT_KONTIGO)
        const usdcDeposited = steps
            .filter(s => s.step_type === 'DEPOSIT_KONTIGO')
            .reduce((sum, s) => sum + parseFloat(s.output_amount), 0);

        // USDC Retirados de Kontigo (debit_amount de SEND_TO_BINANCE)
        const usdcWithdrawn = steps
            .filter(s => s.step_type === 'SEND_TO_BINANCE' && s.debit_amount)
            .reduce((sum, s) => sum + parseFloat(s.debit_amount), 0);

        // USDC que llegaron a Binance (output de SEND_TO_BINANCE)
        const usdcToBinance = steps
            .filter(s => s.step_type === 'SEND_TO_BINANCE')
            .reduce((sum, s) => sum + parseFloat(s.output_amount), 0);

        // USDT Convertidos (output de CONVERT_TO_USDT)
        const usdtConverted = steps
            .filter(s => s.step_type === 'CONVERT_TO_USDT')
            .reduce((sum, s) => sum + parseFloat(s.output_amount), 0);

        // 4. Tasas promedio

        // Tasa promedio de VENTA USDT (MAIN cycles only)
        const sellRates = steps
            .filter(s => s.step_type === 'SELL_USDT_TO_VES' && s.exchange_rate)
            .map(s => parseFloat(s.exchange_rate));
        const avgSellRate = sellRates.length > 0
            ? sellRates.reduce((a, b) => a + b, 0) / sellRates.length
            : 0;

        // Tasa promedio de COMPRA USD (ambos ciclos)
        const buyRates = steps
            .filter(s => s.step_type === 'BUY_USD_CASH' && s.exchange_rate)
            .map(s => parseFloat(s.exchange_rate));
        const avgBuyRate = buyRates.length > 0
            ? buyRates.reduce((a, b) => a + b, 0) / buyRates.length
            : 0;

        // 5. Spread total del día
        const totalSpread = cycles
            .filter(c => c.spread_amount)
            .reduce((sum, c) => sum + parseFloat(c.spread_amount), 0);

        // 6. Datos para gráfica de spread por ciclo
        const spreadChart = cycles.map(c => ({
            id: c.id,
            type: c.cycle_type,
            spread: parseFloat(c.spread_amount || 0),
            percentage: parseFloat(c.spread_percentage || 0),
            time: c.start_date
        }));

        res.json({
            hasData: true,
            date,
            summary: {
                totalCycles: cycles.length,
                mainCycles: cycles.filter(c => c.cycle_type === 'MAIN').length,
                vesCycles: cycles.filter(c => c.cycle_type === 'VES_TO_USD').length,
                totalSpread
            },
            volumes: {
                usdtSold,
                usdCashBought,
                vesEarned,
                vesSpent,
                usdcDeposited,
                usdcWithdrawn,
                usdcToBinance,
                usdtConverted
            },
            rates: {
                avgSellRate,
                avgBuyRate,
                sellRateCount: sellRates.length,
                buyRateCount: buyRates.length
            },
            spreadChart,
            cycles
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
