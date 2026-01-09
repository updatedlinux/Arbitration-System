const express = require('express');
const cors = require('cors');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./config/swagger');
require('dotenv').config();

// Importar rutas
const authRoutes = require('./routes/auth');
const walletRoutes = require('./routes/wallet');
const cyclesRoutes = require('./routes/cycles');
const verifyToken = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Archivos estáticos - Servir frontend en la raíz
app.use(express.static(path.join(__dirname, '../assets')));

// Documentación Swagger
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));

// Rutas API
app.use('/api/auth', authRoutes);
app.use('/api/wallet', verifyToken, walletRoutes);
app.use('/api/cycles', verifyToken, cyclesRoutes);

// Redirigir cualquier otra ruta no API al frontend (SPA capability)
app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
        res.status(404).json({ error: 'Endpoint no encontrado' });
    } else {
        res.sendFile(path.resolve(__dirname, '../assets/index.html'));
    }
});

// Manejo de errores global
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: err.message
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
    console.log(`📄 Documentación Swagger: http://localhost:${PORT}/api-docs`);
    console.log(`💻 Frontend: http://localhost:${PORT}/`);
});

module.exports = app;
