# Sistema de Arbitraje Diario de Criptomonedas

Sistema web para el registro, gestión y cálculo de beneficios en ciclos de arbitraje de criptomonedas (USDT -> VES -> USD Efectivo -> Kontigo -> Binance -> USDT).

## Características

- **Backend**: Node.js + Express REST API.
- **Base de Datos**: MariaDB para persistencia de ciclos y transacciones.
- **Frontend**: Dashboard web moderno (HTML/CSS/JS) con asistente paso a paso.
- **Documentación**: Swagger UI integrado.
- **Cálculo de Spread**: Seguimiento automático de ganancias por ciclo.

## Requisitos previos

- Node.js (v18 o superior)
- MariaDB Server
- NPM

## Instalación

1. Clonar el repositorio y entrar al directorio:
   ```bash
   cd Arbitration-System
   ```

2. Instalar dependencias:
   ```bash
   npm install
   ```

3. Configurar variables de entorno:
   Crea un archivo `.env` en la raíz (puedes copiar el ejemplo si existiera) con:
   ```env
   PORT=3000
   DB_HOST=localhost
   DB_USER=tu_usuario
   DB_PASSWORD=tu_password
   DB_NAME=arbitraje_db
   ```

4. Inicializar la Base de Datos:
   Ejecuta el script incluido para crear la base de datos y las tablas necesarias.
   ```bash
   npm run init-db
   ```

## Ejecución

### Desarrollo
Para correr el servidor con recarga automática:
```bash
npm run dev
```

### Producción
```bash
npm start
```

El servidor iniciará en el puerto 3000 por defecto.

## Uso

1. **Dashboard**: Accede a `http://localhost:3000/`
2. **API Swagger**: Accede a `http://localhost:3000/api-docs/`

### Flujo de Arbitraje
1. **Inicio**: Haz clic en "Comenzar Arbitraje". Se congelará tu saldo actual de USDT como base.
2. **Ciclo**: Sigue los 5 pasos del asistente:
   - Venta de USDT a VES.
   - Compra de Dólares en Efectivo.
   - Depósito en Kontigo (registrando lo recibido neto).
   - Envío a Binance (registrando comisión de red).
   - Conversión final a USDT.
3. **Cierre**: Al finalizar, el sistema calculará tu ganancia (Spread) y actualizará tu saldo base.

## Estructura del Proyecto

- `/src`: Código fuente del Backend.
- `/scripts`: Scripts de utilidad (base de datos).
- `/assets`: Frontend (HTML, CSS, JS).
