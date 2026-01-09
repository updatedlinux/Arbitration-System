# Sistema de Arbitraje Diario de Criptomonedas

Sistema web PWA para el registro, gestión y cálculo de beneficios en ciclos de arbitraje de criptomonedas.

![Dashboard](https://img.shields.io/badge/Status-Production%20Ready-green)
![Node](https://img.shields.io/badge/Node.js-18%2B-brightgreen)
![License](https://img.shields.io/badge/License-MIT-blue)

## Características Principales

### 🔄 Ciclos de Arbitraje

#### Ciclo MAIN (Cripto → Fiat → Cripto)
1. **Venta USDT → VES**: Vende USDT y recibe VES
2. **Compra USD Efectivo**: Usa VES para comprar dólares en efectivo
3. **Depósito en Kontigo**: Deposita el efectivo y recibe USDC
4. **Envío a Binance**: Transfiere USDC de Kontigo a Binance
5. **Conversión a USDT**: Convierte USDC a USDT

#### Ciclo VES (Fiat → Cripto)
1. **Compra USD Efectivo**: Usa VES acumulados
2. **Depósito en Kontigo**: Deposita efectivo
3. **Envío a Binance**: Transfiere a Binance
4. **Conversión a USDT**: Convierte a USDT

### 💰 Sistema de Billeteras
- **USDT Binance**: Billetera principal
- **VES**: Bolívares venezolanos (ganancias de spread)
- **USD Cash**: Efectivo en dólares
- **USDC Kontigo**: Balance en Kontigo
- **USDC Binance**: USDC en Binance

### 📊 Funcionalidades

- **Cálculo automático de Spread**: Diferencia entre USDT invertido y recuperado
- **Ganancia VES**: Diferencia entre tasa de venta USDT y compra USD se acumula
- **Auditoría completa**: Todas las transacciones quedan registradas
- **Historial detallado**: Click en cualquier ciclo para ver todos sus pasos
- **Reportes diarios**: Dashboard con métricas, gráficas y promedios

### 📱 PWA (Progressive Web App)
- Instalable en iOS y Android
- 100% responsive para móviles
- Funciona offline (cache de assets)

## Requisitos

- Node.js v18+
- MariaDB/MySQL Server
- NPM

## Instalación

```bash
# 1. Clonar repositorio
git clone https://github.com/updatedlinux/Arbitration-System.git
cd Arbitration-System

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# 4. Inicializar base de datos
npm run init-db
```

### Variables de Entorno (.env)
```env
PORT=3000
DB_HOST=localhost
DB_USER=tu_usuario
DB_PASSWORD=tu_password
DB_NAME=arbitraje_db
JWT_SECRET=tu_secreto_jwt_seguro
```

## Ejecución

```bash
# Desarrollo (con hot reload)
npm run dev

# Producción
npm start
```

Accede a `http://localhost:3000`

## Scripts Disponibles

| Script | Descripción |
|--------|-------------|
| `npm start` | Inicia el servidor en producción |
| `npm run dev` | Inicia con nodemon (desarrollo) |
| `npm run init-db` | Inicializa/migra la base de datos |
| `npm run reset-production` | Limpia todos los datos de prueba |

## API Endpoints

### Autenticación
- `POST /api/auth/login` - Iniciar sesión
- `POST /api/auth/register` - Registrar usuario

### Billeteras
- `GET /api/wallet` - Obtener todas las billeteras
- `PUT /api/wallet` - Actualizar balance USDT

### Ciclos
- `GET /api/cycles/active` - Ciclo activo actual
- `GET /api/cycles/:id` - Detalles de un ciclo
- `GET /api/cycles` - Historial de ciclos
- `POST /api/cycles/start` - Iniciar ciclo MAIN
- `POST /api/cycles/start-ves` - Iniciar ciclo VES
- `POST /api/cycles/:id/step` - Registrar paso
- `POST /api/cycles/:id/close` - Cerrar ciclo MAIN
- `POST /api/cycles/:id/close-ves` - Cerrar ciclo VES
- `POST /api/cycles/:id/cancel` - Cancelar ciclo

### Reportes
- `GET /api/reports/daily?date=YYYY-MM-DD` - Reporte diario

**Documentación Swagger**: `/api-docs`

## Estructura del Proyecto

```
Arbitration-System/
├── assets/              # Frontend
│   ├── css/
│   │   └── style.css    # Estilos principales
│   ├── js/
│   │   └── app.js       # Lógica frontend
│   ├── index.html       # Dashboard principal
│   ├── reports.html     # Reportes diarios
│   ├── login.html       # Página de login
│   └── manifest.json    # PWA manifest
├── src/                 # Backend
│   ├── config/
│   │   ├── database.js  # Conexión a DB
│   │   └── swagger.js   # Config Swagger
│   ├── middleware/
│   │   └── auth.js      # JWT middleware
│   ├── routes/
│   │   ├── auth.js      # Rutas auth
│   │   ├── wallet.js    # Rutas billeteras
│   │   ├── cycles.js    # Rutas ciclos
│   │   └── reports.js   # Rutas reportes
│   └── app.js           # Entry point
├── scripts/
│   ├── init_db.sql      # Schema SQL
│   ├── setup-db.js      # Script inicialización
│   └── reset-production.js  # Script reset
└── package.json
```

## Reportes Diarios

El módulo de reportes (`/reports.html`) incluye:

- **Selector de fecha** con atajos (Hoy, Ayer)
- **Spread total del día**
- **Tasas promedio**:
  - Tasa de venta USDT
  - Tasa de compra USD
- **Volúmenes**:
  - USDT vendidos
  - USD efectivo comprado
  - VES ganados (spread)
  - VES gastados
  - USDC depositados/retirados
  - USDC recibidos en Binance
  - USDT convertidos
- **Gráfica de spread** por ciclo
- **Tabla de ciclos** del día

## Seguridad

- Autenticación JWT
- Contraseñas hasheadas con bcrypt
- Middleware de verificación de token
- Variables de entorno para secretos

## Usuario por Defecto

```
Usuario: admin
Contraseña: admin123
```

> ⚠️ **Importante**: Cambia la contraseña en producción

## Licencia

MIT License
