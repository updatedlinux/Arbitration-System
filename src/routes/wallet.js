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
 *     summary: Obtener saldo de las billeteras
 *     tags: [Wallet]
 *     responses:
 *       200:
 *         description: Lista de saldos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   currency:
 *                     type: string
 *                   balance:
 *                     type: number
 *                     format: float
 *                   updated_at:
 *                     type: string
 *                     format: date-time
 */
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM wallet ORDER BY id ASC');
        res.json(rows);
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
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Obtener saldo anterior para el log
        const [rows] = await connection.query('SELECT balance FROM wallet WHERE id = 1');
        const oldBalance = parseFloat(rows[0].balance);
        const newBalance = parseFloat(balance);
        const difference = newBalance - oldBalance;

        // Actualizar wallet
        await connection.query('UPDATE wallet SET balance = ?, updated_at = NOW() WHERE id = 1', [newBalance]);

        // Registrar Transacción (Auditoría)
        if (difference !== 0) {
            await connection.query(
                'INSERT INTO transactions (wallet_id, type, amount, description) VALUES (?, "MANUAL_ADJUSTMENT", ?, ?)',
                [1, difference, `Ajuste manual de saldo: ${oldBalance} -> ${newBalance}`]
            );
        }

        await connection.commit();
        res.json({ success: true, balance: newBalance });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

module.exports = router;
