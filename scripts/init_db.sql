-- Creación de la base de datos si no existe
CREATE DATABASE IF NOT EXISTS arbitraje_db;
USE arbitraje_db;

-- Tabla de Billetera (Saldo Base)
CREATE TABLE IF NOT EXISTS wallet (
    id INT PRIMARY KEY AUTO_INCREMENT,
    currency VARCHAR(10) NOT NULL DEFAULT 'USDT',
    balance DECIMAL(20, 8) NOT NULL DEFAULT 0.00000000,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Inicializar billetera si está vacía
INSERT IGNORE INTO wallet (id, currency, balance) VALUES 
(1, 'USDT', 0.00000000),
(2, 'VES', 0.00000000),
(3, 'USD_CASH', 0.00000000),
(4, 'USDC_KONTIGO', 0.00000000),
(5, 'USDC_BINANCE', 0.00000000);

-- Tabla de Usuarios
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('ADMIN', 'USER') DEFAULT 'ADMIN',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Ciclos de Arbitraje
CREATE TABLE IF NOT EXISTS cycles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    cycle_type ENUM('MAIN', 'VES_TO_USD') DEFAULT 'MAIN',
    start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_date TIMESTAMP NULL,
    status ENUM('OPEN', 'COMPLETED', 'CANCELLED') DEFAULT 'OPEN',
    initial_balance DECIMAL(20, 8),
    initial_currency VARCHAR(10) DEFAULT 'USDT',
    final_balance DECIMAL(20, 8),
    spread_amount DECIMAL(20, 8),
    spread_percentage DECIMAL(10, 4)
);

-- Tabla de Pasos del Ciclo
CREATE TABLE IF NOT EXISTS cycle_steps (
    id INT PRIMARY KEY AUTO_INCREMENT,
    cycle_id INT NOT NULL,
    step_type ENUM(
        'SELL_USDT_TO_VES',
        'BUY_USD_CASH',
        'DEPOSIT_KONTIGO',
        'SEND_TO_BINANCE',
        'CONVERT_TO_USDT'
    ) NOT NULL,
    input_amount DECIMAL(20, 8) NOT NULL,
    output_amount DECIMAL(20, 8) NOT NULL,
    exchange_rate DECIMAL(20, 8) NULL,
    fee DECIMAL(20, 8) DEFAULT 0,
    ves_surplus DECIMAL(20, 8) DEFAULT 0,
    debit_amount DECIMAL(20, 8) NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE
);

-- Tabla de Transacciones (Auditoría)
CREATE TABLE IF NOT EXISTS transactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    wallet_id INT NOT NULL,
    cycle_id INT NULL,
    type ENUM('DEPOSIT', 'WITHDRAWAL', 'MANUAL_ADJUSTMENT', 'CYCLE_START', 'CYCLE_STEP', 'CYCLE_CANCEL', 'CYCLE_CLOSE') NOT NULL,
    amount DECIMAL(20, 8) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_id) REFERENCES wallet(id),
    FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE
);
