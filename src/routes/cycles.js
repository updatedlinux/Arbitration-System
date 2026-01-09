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
 * /cycles/{id}:
 *   get:
 *     summary: Obtener detalles de un ciclo específico con todos sus pasos
 *     tags: [Cycles]
 */
router.get('/:id', async (req, res) => {
    const { id } = req.params;

    // Evitar conflicto con otras rutas como /active
    if (isNaN(id)) {
        return res.status(400).json({ error: 'ID de ciclo inválido' });
    }

    try {
        const [cycles] = await pool.query('SELECT * FROM cycles WHERE id = ?', [id]);

        if (cycles.length === 0) {
            return res.status(404).json({ error: 'Ciclo no encontrado' });
        }

        const cycle = cycles[0];
        const [steps] = await pool.query('SELECT * FROM cycle_steps WHERE cycle_id = ? ORDER BY id ASC', [id]);
        const [transactions] = await pool.query('SELECT * FROM transactions WHERE cycle_id = ? ORDER BY id ASC', [id]);

        cycle.steps = steps;
        cycle.transactions = transactions;

        res.json(cycle);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * @swagger
 * /cycles/start-ves:
 *   post:
 *     summary: Iniciar un ciclo VES->USD (usando saldo de VES acumulado)
 *     tags: [Cycles]
 *     responses:
 *       201:
 *         description: Ciclo VES iniciado
 */
router.post('/start-ves', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Verificar si hay ciclo abierto
        const [active] = await connection.query('SELECT id FROM cycles WHERE status = "OPEN"');
        if (active.length > 0) {
            throw new Error('Ya existe un ciclo activo. Debe cerrarlo antes de iniciar otro.');
        }

        // 2. Obtener saldo de VES (Wallet ID 2)
        const [vesWallet] = await connection.query('SELECT balance FROM wallet WHERE id = 2');
        const vesBalance = parseFloat(vesWallet[0].balance);

        if (vesBalance <= 0) {
            throw new Error('No tienes saldo en VES para iniciar este ciclo.');
        }

        // 3. Crear ciclo tipo VES_TO_USD
        const [result] = await connection.query(
            'INSERT INTO cycles (cycle_type, initial_balance, initial_currency, status) VALUES ("VES_TO_USD", ?, "VES", "OPEN")',
            [vesBalance]
        );
        const cycleId = result.insertId;

        // 4. Descontar VES de la wallet (lo estamos usando en el ciclo)
        await connection.query('UPDATE wallet SET balance = 0 WHERE id = 2');

        // 5. Auditoría
        await connection.query(
            'INSERT INTO transactions (wallet_id, cycle_id, type, amount, description) VALUES (?, ?, "CYCLE_START", ?, ?)',
            [2, cycleId, -vesBalance, `Inicio de ciclo VES→USD #${cycleId} con ${vesBalance} VES`]
        );

        await connection.commit();
        res.status(201).json({
            success: true,
            message: 'Ciclo VES→USD iniciado',
            cycleId,
            initialBalance: vesBalance,
            currency: 'VES'
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
 * /cycles/start:
 *   post:
 *     summary: Iniciar un nuevo ciclo de arbitraje (Tipo MAIN)
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

        // 3. Verificar que hay USDT disponible
        const [wallet] = await connection.query('SELECT balance FROM wallet WHERE id = 1');
        const usdtBalance = parseFloat(wallet[0].balance);

        if (usdtBalance <= 0) {
            throw new Error('El saldo de la billetera USDT debe ser mayor a 0 para iniciar un ciclo.');
        }

        // 4. Crear ciclo (initial_balance se actualizará cuando se registre Step 1)
        const [result] = await connection.query(
            'INSERT INTO cycles (cycle_type, initial_balance, initial_currency, status) VALUES ("MAIN", 0, "USDT", "OPEN")'
        );
        const cycleId = result.insertId;

        // 5. Auditoría
        await connection.query(
            'INSERT INTO transactions (wallet_id, cycle_id, type, amount, description) VALUES (?, ?, "CYCLE_START", ?, ?)',
            [1, cycleId, 0, `Inicio de ciclo MAIN #${cycleId}`]
        );

        await connection.commit();
        res.status(201).json({
            success: true,
            message: 'Ciclo iniciado. Procede a registrar la venta de USDT.',
            cycleId,
            availableUSDT: usdtBalance
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
    const { step_type, input_amount, output_amount, exchange_rate, fee, notes, debit_amount } = req.body;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        let vesSurplus = 0;

        // Lógica especial para SELL_USDT_TO_VES: Descontar USDT de wallet
        if (step_type === 'SELL_USDT_TO_VES') {
            const usdtSold = parseFloat(input_amount);

            // Verificar saldo disponible
            const [wallet] = await connection.query('SELECT balance FROM wallet WHERE id = 1');
            const currentUSDT = parseFloat(wallet[0].balance);

            if (usdtSold > currentUSDT) {
                throw new Error(`Saldo insuficiente. Disponible: ${currentUSDT} USDT, Intentando vender: ${usdtSold} USDT`);
            }

            // Descontar USDT de la wallet
            const newUSDT = currentUSDT - usdtSold;
            await connection.query('UPDATE wallet SET balance = ? WHERE id = 1', [newUSDT]);

            // Actualizar initial_balance del ciclo
            await connection.query('UPDATE cycles SET initial_balance = ? WHERE id = ?', [usdtSold, id]);

            // Auditoría
            await connection.query(
                'INSERT INTO transactions (wallet_id, cycle_id, type, amount, description) VALUES (?, ?, "CYCLE_STEP", ?, ?)',
                [1, id, -usdtSold, `Venta USDT→VES: ${usdtSold} USDT a tasa ${exchange_rate}`]
            );
        }

        // Lógica especial para BUY_USD_CASH: Calcular VES Surplus
        if (step_type === 'BUY_USD_CASH') {
            // Obtener VES recibidos del paso anterior (SELL_USDT_TO_VES)
            const [prevStep] = await connection.query(
                'SELECT output_amount FROM cycle_steps WHERE cycle_id = ? AND step_type = "SELL_USDT_TO_VES" ORDER BY id DESC LIMIT 1',
                [id]
            );

            if (prevStep.length > 0) {
                const vesReceived = parseFloat(prevStep[0].output_amount);
                const vesSpent = parseFloat(input_amount); // Lo que gastamos para comprar USD Cash
                vesSurplus = vesReceived - vesSpent;

                // Acreditar VES Surplus a Wallet VES (ID 2)
                if (vesSurplus > 0) {
                    const [vesWallet] = await connection.query('SELECT balance FROM wallet WHERE id = 2');
                    const currentVES = parseFloat(vesWallet[0].balance);
                    const newVES = currentVES + vesSurplus;

                    await connection.query('UPDATE wallet SET balance = ? WHERE id = 2', [newVES]);

                    // Auditoría
                    await connection.query(
                        'INSERT INTO transactions (wallet_id, cycle_id, type, amount, description) VALUES (?, ?, "CYCLE_STEP", ?, ?)',
                        [2, id, vesSurplus, `Ganancia VES del ciclo (${vesReceived} - ${vesSpent} = ${vesSurplus})`]
                    );
                }
            }
        }

        // Insertar paso
        await connection.query(
            `INSERT INTO cycle_steps 
            (cycle_id, step_type, input_amount, output_amount, exchange_rate, fee, ves_surplus, debit_amount, notes) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, step_type, input_amount, output_amount, exchange_rate, fee || 0, vesSurplus, debit_amount || null, notes]
        );

        await connection.commit();
        res.json({
            success: true,
            message: 'Paso registrado',
            ves_surplus: vesSurplus
        });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
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

        // 1. Obtener el paso inicial (USDT vendido) - ES LA BASE REAL
        const [step1] = await connection.query(
            'SELECT input_amount FROM cycle_steps WHERE cycle_id = ? AND step_type = "SELL_USDT_TO_VES" ORDER BY id ASC LIMIT 1',
            [id]
        );

        if (step1.length === 0) {
            throw new Error('El ciclo no tiene el paso inicial (SELL_USDT_TO_VES) registrado.');
        }

        const usdtSold = parseFloat(step1[0].input_amount);

        // 2. Obtener el paso final (USDT recuperado)
        const [step5] = await connection.query(
            'SELECT output_amount FROM cycle_steps WHERE cycle_id = ? AND step_type = "CONVERT_TO_USDT" ORDER BY id DESC LIMIT 1',
            [id]
        );

        if (step5.length === 0) {
            throw new Error('El ciclo no tiene el paso final (CONVERT_TO_USDT) registrado.');
        }

        const usdtReturned = parseFloat(step5[0].output_amount);

        // 3. Calcular Spread REAL (basado en USDT que entró vs USDT que salió)
        const spreadAmount = usdtReturned - usdtSold;
        const spreadPercentage = (spreadAmount / usdtSold) * 100;

        // 4. Actualizar ciclo (guardamos USDT sold como initial, USDT returned como final)
        await connection.query(
            'UPDATE cycles SET status = "COMPLETED", end_date = NOW(), initial_balance = ?, final_balance = ?, spread_amount = ?, spread_percentage = ? WHERE id = ?',
            [usdtSold, usdtReturned, spreadAmount, spreadPercentage, id]
        );

        // 5. Actualizar Billetera Principal: AGREGAR el USDT recuperado (no sobreescribir)
        const [wallet] = await connection.query('SELECT balance FROM wallet WHERE id = 1');
        const currentBalance = parseFloat(wallet[0].balance);
        const newBalance = currentBalance + usdtReturned;

        await connection.query('UPDATE wallet SET balance = ? WHERE id = 1', [newBalance]);

        // 6. Auditoría
        await connection.query(
            'INSERT INTO transactions (wallet_id, cycle_id, type, amount, description) VALUES (?, ?, "CYCLE_CLOSE", ?, ?)',
            [1, id, usdtReturned, `Cierre de ciclo #${id}. Vendido: ${usdtSold} USDT, Recuperado: ${usdtReturned} USDT, Spread: ${spreadAmount.toFixed(2)} USDT`]
        );

        await connection.commit();
        res.json({
            success: true,
            message: 'Ciclo cerrado correctamente',
            results: {
                usdtSold,
                usdtReturned,
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
