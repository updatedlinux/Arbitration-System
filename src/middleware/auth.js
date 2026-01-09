const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(403).json({ success: false, error: 'Se requiere un token de autenticación (Bearer token)' });
    }

    try {
        const bearer = token.split(' ');
        const bearerToken = bearer[1];

        const decoded = jwt.verify(bearerToken, process.env.JWT_SECRET || 'secret_key_123');
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, error: 'Token inválido o expirado' });
    }
};

module.exports = verifyToken;
