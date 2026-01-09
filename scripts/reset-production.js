/**
 * Script de Reset para Producción
 * Limpia todos los datos de prueba y prepara la plataforma para uso real.
 * 
 * USO: npm run reset-production
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const readline = require('readline');

async function resetProduction() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log('\n⚠️  ADVERTENCIA: Este script eliminará TODOS los datos de prueba.');
    console.log('   - Ciclos');
    console.log('   - Pasos de ciclos');
    console.log('   - Transacciones');
    console.log('   - Balances de billeteras\n');

    const answer = await new Promise(resolve => {
        rl.question('¿Estás seguro de continuar? (escribe "RESET" para confirmar): ', resolve);
    });
    rl.close();

    if (answer !== 'RESET') {
        console.log('❌ Operación cancelada.');
        process.exit(0);
    }

    const config = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'arbitraje_db',
        multipleStatements: true
    };

    try {
        console.log('\n🔄 Conectando a la base de datos...');
        const connection = await mysql.createConnection(config);

        console.log('🗑️  Eliminando datos de prueba...');

        // 1. Limpiar tablas en orden (por foreign keys)
        await connection.query('DELETE FROM transactions');
        console.log('   ✅ Transacciones eliminadas');

        await connection.query('DELETE FROM cycle_steps');
        console.log('   ✅ Pasos de ciclos eliminados');

        await connection.query('DELETE FROM cycles');
        console.log('   ✅ Ciclos eliminados');

        // 2. Resetear auto_increment
        await connection.query('ALTER TABLE transactions AUTO_INCREMENT = 1');
        await connection.query('ALTER TABLE cycle_steps AUTO_INCREMENT = 1');
        await connection.query('ALTER TABLE cycles AUTO_INCREMENT = 1');
        console.log('   ✅ Contadores reiniciados');

        // 3. Resetear billeteras a 0
        await connection.query('UPDATE wallet SET balance = 0');
        console.log('   ✅ Billeteras reseteadas a 0');

        await connection.end();

        console.log('\n🎉 ¡Reset completado! La plataforma está lista para producción.');
        console.log('\n📋 Próximos pasos:');
        console.log('   1. Ajusta el balance inicial de USDT manualmente desde la app');
        console.log('   2. Verifica que el usuario admin tenga contraseña segura');
        console.log('   3. Cambia JWT_SECRET en .env por uno seguro\n');

    } catch (error) {
        console.error('❌ Error durante el reset:', error.message);
        process.exit(1);
    }
}

resetProduction();
