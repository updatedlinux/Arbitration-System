const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Sistema de Arbitraje Diario API',
            version: '1.0.0',
            description: 'API para gestionar ciclos de arbitraje, transacciones y billetera USDT. Documentación en Español.',
            contact: {
                name: 'Jonny Melendez',
            },
        },
        servers: [
            {
                url: 'http://localhost:3000/api',
                description: 'Servidor de Desarrollo Local',
            },
            {
                url: 'https://arbitraje.soyjonnymelendez.net/api',
                description: 'Servidor de Producción',
            },
        ],
        components: {
            schemas: {
                Cycle: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        start_date: { type: 'string', format: 'date-time' },
                        end_date: { type: 'string', format: 'date-time' },
                        status: { type: 'string', enum: ['OPEN', 'COMPLETED'] },
                        initial_balance: { type: 'number', format: 'float' },
                        final_balance: { type: 'number', format: 'float' },
                        spread_amount: { type: 'number', format: 'float' },
                        spread_percentage: { type: 'number', format: 'float' }
                    }
                },
                CycleStep: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        step_type: { type: 'string', enum: ['SELL_USDT_TO_VES', 'BUY_USD_CASH', 'DEPOSIT_KONTIGO', 'SEND_TO_BINANCE', 'CONVERT_TO_USDT'] },
                        input_amount: { type: 'number' },
                        output_amount: { type: 'number' },
                        exchange_rate: { type: 'number' },
                        fee: { type: 'number' },
                        notes: { type: 'string' }
                    }
                }
            }
        }
    },
    apis: ['./src/routes/*.js'], // Archivos donde buscar anotaciones
};

const specs = swaggerJsdoc(options);
module.exports = specs;
