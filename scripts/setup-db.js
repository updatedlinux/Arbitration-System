require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function setupDatabase() {
    const config = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        dataStrings: true,
        multipleStatements: true // Permitir múltiples sentencias en una sola query
    };

    try {
        console.log('Conectando al servidor MariaDB...');
        const connection = await mysql.createConnection(config);

        console.log('Leyendo script de inicialización...');
        const sqlPath = path.join(__dirname, 'init_db.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Ejecutando script de base de datos...');
        await connection.query(sql);

        // Seed Admin User if not exists
        const [users] = await connection.query('SELECT * FROM users WHERE username = "admin"');
        if (users.length === 0) {
            console.log('Creando usuario admin por defecto...');
            // Password: admin123
            const bcrypt = require('bcryptjs');
            const hash = await bcrypt.hash('admin123', 10);
            await connection.query('INSERT INTO users (username, password_hash) VALUES (?, ?)', ['admin', hash]);
            console.log('✅ Usuario "admin" creado (Pass: admin123)');
        }

        console.log('✅ Base de datos "arbitraje_db" inicializada correctamente.');
        await connection.end();
    } catch (error) {
        console.error('❌ Error al inicializar la base de datos:', error);
        process.exit(1);
    }
}

setupDatabase();
