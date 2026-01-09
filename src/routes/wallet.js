const express = require('express');
const router = express.Router();
const pool = require('../config/database');

/**
 * @swagger
 * tags:
 *   name: Wallet
 *   description: Gestión del saldo base de USDT
 */

/**
 * @swagger
 * /wallet:
 *   get:
 *     summary: Obtener saldo actual de la billetera
 *     tags: [Wallet]
 *     responses:
 *       200:
 *         description: Saldo actual
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 balance:
 *                   type: number
 *                   format: float
 *                 updated_at:
 *                   type: string
 */
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM wallet WHERE id = 1');
        if (rows.length === 0) {
            // Inicializar si no existe por seguridad
            await pool.query("INSERT INTO wallet (id, currency, balance) VALUES (1, 'USDT', 0)");
            return res.json({ balance: 0, updated_at: new Date() });
        }
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * @swagger
 * /wallet:
 *   put:
 *     summary: Actualizar saldo manualmente
 *     tags: [Wallet]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               balance:
 *                 type: number
 *                 description: Nuevo saldo en USDT
 *     responses:
 *       200:
 *         description: Saldo actualizado
 */
router.put('/', async (req, res) => {
    const { balance } = req.body;
    if (balance === undefined || isNaN(balance)) {
        return res.status(400).json({ error: 'Se requiere un monto válido' });
    }

    try {
        await pool.query('UPDATE wallet SET balance = ? WHERE id = 1', [balance]);
        res.json({ success: true, message: 'Saldo actualizado', balance });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
