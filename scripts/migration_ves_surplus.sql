-- Migration: Add new columns for VES Surplus and Cycle Types
-- Run this script on your production database

USE arbitraje_db;

-- Add columns to cycles table
ALTER TABLE cycles 
ADD COLUMN IF NOT EXISTS cycle_type ENUM('MAIN', 'VES_TO_USD') DEFAULT 'MAIN' AFTER id,
ADD COLUMN IF NOT EXISTS initial_currency VARCHAR(10) DEFAULT 'USDT' AFTER initial_balance;

-- Add columns to cycle_steps table
ALTER TABLE cycle_steps 
ADD COLUMN IF NOT EXISTS ves_surplus DECIMAL(20, 8) DEFAULT 0 AFTER fee,
ADD COLUMN IF NOT EXISTS debit_amount DECIMAL(20, 8) NULL AFTER ves_surplus;

-- Verify changes
DESCRIBE cycles;
DESCRIBE cycle_steps;
