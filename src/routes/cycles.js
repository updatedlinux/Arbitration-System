const express = require('express');
const router = express.Router();
const pool = require('../config/database');

/**
 * @swagger
 * tags:
 *   name: Cycles
 *   description: Gestión de Ciclos de Arbitraje
 */

/**
 * @swagger
 * /cycles/active:
 *   get:
 *     summary: Obtener el ciclo activo actual (si existe)
 *     tags: [Cycles]
 *     responses:
 *       200:
 *         description: Objeto del ciclo activo o null
 */
router.get('/active', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM cycles WHERE status = "OPEN" LIMIT 1');
        if (rows.length > 0) {
            // Obtener pasos del ciclo
            const cycle = rows[0];
            const [steps] = await pool.query('SELECT * FROM cycle_steps WHERE cycle_id = ? ORDER BY id ASC', [cycle.id]);
            cycle.steps = steps;
            return res.json({ active: true, cycle });
        }
        res.json({ active: false, cycle: null });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * @swagger
 * /cycles/start:
 *   post:
 *     summary: Iniciar un nuevo ciclo de arbitraje
 *     tags: [Cycles]
 *     responses:
 *       201:
 *         description: Ciclo iniciado
 */
router.post('/start', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Verificar si hay ciclo abierto
        const [active] = await connection.query('SELECT id FROM cycles WHERE status = "OPEN"');
        if (active.length > 0) {
            throw new Error('Ya existe un ciclo activo. Debe cerrarlo antes de iniciar otro.');
        }

        // 2. Obtener saldo actual de wallet para fijarlo como inicial
        const [wallet] = await connection.query('SELECT balance FROM wallet WHERE id = 1');
        const initialBalance = wallet[0].balance;

        if (initialBalance <= 0) {
            throw new Error('El saldo de la billetera debe ser mayor a 0 para iniciar un ciclo.');
        }

        // 3. Crear ciclo
        const [result] = await connection.query(
            'INSERT INTO cycles (initial_balance, status) VALUES (?, "OPEN")',
            [initialBalance]
        );

        await connection.commit();
        res.status(201).json({
            success: true,
            message: 'Ciclo iniciado',
            cycleId: result.insertId,
            initialBalance
        });

    } catch (error) {
        await connection.rollback();
        res.status(400).json({ error: error.message });
    } finally {
        connection.release();
    }
});

/**
 * @swagger
 * /cycles/{id}/step:
 *   post:
 *     summary: Registrar un paso del ciclo
 *     tags: [Cycles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CycleStep'
 */
router.post('/:id/step', async (req, res) => {
    const { id } = req.params;
    const { step_type, input_amount, output_amount, exchange_rate, fee, notes } = req.body;

    // TODO: Validar que el step_type corresponda a la secuencia lógica (opcional pero recomendado)
    // 1: SELL_USDT_TO_VES, 2: BUY_USD_CASH, 3: DEPOSIT_KONTIGO, 4: SEND_TO_BINANCE, 5: CONVERT_TO_USDT

    try {
        await pool.query(
            `INSERT INTO cycle_steps 
            (cycle_id, step_type, input_amount, output_amount, exchange_rate, fee, notes) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, step_type, input_amount, output_amount, exchange_rate, fee || 0, notes]
        );

        // Si es el último paso, podríamos actualizar el saldo provisionalmente, pero mejor esperar al cierre.

        res.json({ success: true, message: 'Paso registrado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * @swagger
 * /cycles/{id}/close:
 *   post:
 *     summary: Cerrar ciclo y calcular resultados
 *     tags: [Cycles]
 */
router.post('/:id/close', async (req, res) => {
    const { id } = req.params;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Verificar último paso para obtener el balance final real
        const [steps] = await connection.query(
            'SELECT output_amount FROM cycle_steps WHERE cycle_id = ? AND step_type = "CONVERT_TO_USDT" ORDER BY id DESC LIMIT 1',
            [id]
        );

        if (steps.length === 0) {
            throw new Error('El ciclo no tiene el paso final (CONVERT_TO_USDT) registrado.');
        }

        const finalBalance = parseFloat(steps[0].output_amount);

        // 2. Obtener balance inicial
        const [cycle] = await connection.query('SELECT initial_balance FROM cycles WHERE id = ?', [id]);
        if (cycle.length === 0) throw new Error('Ciclo no encontrado');

        const initialBalance = parseFloat(cycle[0].initial_balance);
        const spreadAmount = finalBalance - initialBalance;
        const spreadPercentage = (spreadAmount / initialBalance) * 100;

        // 3. Actualizar ciclo
        await connection.query(
            'UPDATE cycles SET status = "COMPLETED", end_date = NOW(), final_balance =?, spread_amount = ?, spread_percentage = ? WHERE id = ?',
            [finalBalance, spreadAmount, spreadPercentage, id]
        );

        // 4. Actualizar Billetera Principal
        await connection.query('UPDATE wallet SET balance = ? WHERE id = 1', [finalBalance]);

        await connection.commit();
        res.json({
            success: true,
            message: 'Ciclo cerrado correctamente',
            results: {
                initialBalance,
                finalBalance,
                spreadAmount,
                spreadPercentage
            }
        });

    } catch (error) {
        await connection.rollback();
        res.status(400).json({ error: error.message });
    } finally {
        connection.release();
    }
});

/**
 * @swagger
 * /cycles:
 *   get:
 *     summary: Listar historial de ciclos
 *     tags: [Cycles]
 */
router.get('/', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    try {
        const [rows] = await pool.query('SELECT * FROM cycles ORDER BY id DESC LIMIT ? OFFSET ?', [limit, offset]);
        const [count] = await pool.query('SELECT COUNT(*) as total FROM cycles');

        res.json({
            data: rows,
            pagination: {
                total: count[0].total,
                page,
                limit,
                pages: Math.ceil(count[0].total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
