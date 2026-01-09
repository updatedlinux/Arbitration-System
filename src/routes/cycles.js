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

        // 2. REGLA: Verificar saldo en Kontigo (ID 4)
        const [kontigoWallet] = await connection.query('SELECT balance FROM wallet WHERE id = 4');
        const kontigoBalance = parseFloat(kontigoWallet[0].balance);
        if (kontigoBalance > 0) {
            throw new Error(`Tienes ${kontigoBalance} USDC en Kontigo. Debes moverlos a Binance antes de iniciar un nuevo ciclo.`);
        }

        // 3. Obtener saldo actual de wallet (USDT ID 1) para fijarlo como inicial/usarlo
        const [wallet] = await connection.query('SELECT balance FROM wallet WHERE id = 1');
        const usdtBalance = parseFloat(wallet[0].balance);

        // REGLA: Si hay Efectivo (ID 3), se permite iniciar SIEMPRE QUE haya USDT en la base.
        // Si usdtBalance <= 0, no se puede iniciar nueva vuelta (cycle).
        if (usdtBalance <= 0) {
            throw new Error('El saldo de la billetera USDT debe ser mayor a 0 para iniciar un ciclo.');
        }

        const initialBalance = usdtBalance;

        // 4. Crear ciclo
        const [result] = await connection.query(
            'INSERT INTO cycles (initial_balance, status) VALUES (?, "OPEN")',
            [initialBalance]
        );
        const cycleId = result.insertId;

        // 5. Registrar Transacción (Auditoría) - Débito Virtual o Log de Inicio
        // Nota: En este sistema "Referencial", el saldo de wallet suele mantenerse "estático" como referencia 
        // o se "congela". Según la lógica anterior, NO descontábamos el saldo de la wallet al iniciar, solo copiábamos.
        // PERO el usuario pidió "Auditoría de TODAS las transacciones".
        // Si queremos simular que el dinero "entra" al ciclo, deberíamos descontarlo de la wallet?
        // El prompt anterior decía: "Congela saldo actual como initial_balance". 
        // Vamos a mantener la lógica de "foto" pero registrando evento.
        // SI el usuario quiere que se descuente, debería haberlo especificado. 
        // Asumiremos que el dinero se "bloquea" en el ciclo.
        // UPDATE: Para "auditoría de transacciones", vamos a registrar el evento CYCLE_START.

        await connection.query(
            'INSERT INTO transactions (wallet_id, cycle_id, type, amount, description) VALUES (?, ?, "CYCLE_START", ?, ?)',
            [1, cycleId, 0, `Inicio de ciclo #${cycleId} con base ${initialBalance} USDT`]
        );

        await connection.commit();
        res.status(201).json({
            success: true,
            message: 'Ciclo iniciado',
            cycleId,
            initialBalance
        });

    } catch (error) {
        await connection.rollback();
        res.status(400).json({ error: error.message }); // 400 Bad Request
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
 * /cycles/{id}/cancel:
 *   post:
 *     summary: Cancelar ciclo forzosamente y acreditar activos pendientes
 *     tags: [Cycles]
 */
router.post('/:id/cancel', async (req, res) => {
    const { id } = req.params;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Obtener ciclo y saldo inicial
        const [cycleRows] = await connection.query('SELECT * FROM cycles WHERE id = ?', [id]);
        if (cycleRows.length === 0) throw new Error('Ciclo no encontrado');
        const cycle = cycleRows[0];

        if (cycle.status !== 'OPEN') throw new Error('El ciclo no está activo');

        // 2. Obtener pasos realizados
        const [steps] = await connection.query('SELECT * FROM cycle_steps WHERE cycle_id = ? ORDER BY id ASC', [id]);
        const lastStep = steps.length > 0 ? steps[steps.length - 1] : null;

        let refundWalletId = 1; // Default USDT
        let refundAmount = parseFloat(cycle.initial_balance);
        let refundCurrency = 'USDT';

        // Lógica de Devolución basada en último paso
        if (!lastStep) {
            // No se hizo nada, devolver USDT inicial
            refundWalletId = 1;
            refundAmount = parseFloat(cycle.initial_balance);
        } else {
            // Dependiendo del paso, el dinero está en diferentes estados
            switch (lastStep.step_type) {
                case 'SELL_USDT_TO_VES': // Tengo VES
                    refundWalletId = 2; // VES
                    refundAmount = parseFloat(lastStep.output_amount);
                    refundCurrency = 'VES';
                    break;
                case 'BUY_USD_CASH': // Tengo Efectivo
                    refundWalletId = 3; // USD_CASH
                    refundAmount = parseFloat(lastStep.output_amount);
                    refundCurrency = 'USD_CASH';
                    break;
                case 'DEPOSIT_KONTIGO': // Tengo USDC en Kontigo
                    refundWalletId = 4; // USDC_KONTIGO
                    refundAmount = parseFloat(lastStep.output_amount);
                    refundCurrency = 'USDC_KONTIGO';
                    break;
                case 'SEND_TO_BINANCE': // Tengo USDC en Binance
                    refundWalletId = 5; // USDC_BINANCE
                    refundAmount = parseFloat(lastStep.output_amount);
                    refundCurrency = 'USDC_BINANCE';
                    break;
                case 'CONVERT_TO_USDT': // Ciclo completo, usar endpoint de cierre
                    throw new Error('El ciclo ya está completo. Use /close.');
            }
        }

        // 3. Actualizar Wallet Correspondiente
        // Primero obtener saldo actual de esa wallet
        const [targetWallet] = await connection.query('SELECT balance FROM wallet WHERE id = ?', [refundWalletId]);
        const currentBalance = parseFloat(targetWallet[0].balance || 0);
        const newBalance = currentBalance + refundAmount;

        await connection.query('UPDATE wallet SET balance = ? WHERE id = ?', [newBalance, refundWalletId]);

        // 4. Marcar Ciclo como Cancelado
        await connection.query(
            'UPDATE cycles SET status = "CANCELLED", end_date = NOW(), final_balance = ?, spread_amount = 0, spread_percentage = 0 WHERE id = ?',
            [refundAmount, id]
        );

        // 5. Auditoría
        await connection.query(
            'INSERT INTO transactions (wallet_id, cycle_id, type, amount, description) VALUES (?, ?, "CYCLE_CANCEL", ?, ?)',
            [refundWalletId, id, refundAmount, `Ciclo cancelado. Crédito a ${refundCurrency}.`]
        );

        await connection.commit();
        res.json({
            success: true,
            message: `Ciclo cancelado. Se acreditaron ${refundAmount} ${refundCurrency} a la billetera.`
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

        // 5. Auditoría
        await connection.query(
            'INSERT INTO transactions (wallet_id, cycle_id, type, amount, description) VALUES (?, ?, "CYCLE_CLOSE", ?, ?)',
            [1, id, spreadAmount, `Cierre de ciclo. Balance final: ${finalBalance}`]
        );

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
