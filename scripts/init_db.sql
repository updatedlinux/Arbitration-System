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
INSERT IGNORE INTO wallet (id, currency, balance) VALUES (1, 'USDT', 0.00000000);

-- Tabla de Ciclos de Arbitraje
CREATE TABLE IF NOT EXISTS cycles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_date TIMESTAMP NULL,
    status ENUM('OPEN', 'COMPLETED') DEFAULT 'OPEN',
    initial_balance DECIMAL(20, 8) NOT NULL,
    final_balance DECIMAL(20, 8) NULL,
    spread_amount DECIMAL(20, 8) NULL, -- Ganancia/Pérdida en USDT
    spread_percentage DECIMAL(10, 4) NULL -- Ganancia/Pérdida en %
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
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE
);
