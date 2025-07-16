const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));

// Conexión a MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/emergency-db';

mongoose.connect(MONGODB_URI)
.then(() => {
    console.log('✅ Conectado exitosamente a MongoDB');
    console.log('📍 Base de datos:', mongoose.connection.name);
})
.catch((err) => {
    console.error('❌ Error conectando a MongoDB:', err.message);
    process.exit(1);
});

// ESQUEMAS DE BASE DE DATOS

// Esquema de Usuario
const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    role: {
        type: String,
        enum: ['ciudadano', 'policia', 'bombero', 'paramedico', 'administrador'],
        default: 'ciudadano'
    },
    profile: {
        nombre: { type: String, required: true },
        telefono: { type: String, required: true },
        ubicacion: {
            ciudad: { type: String, required: true },
            distrito: { type: String, required: true },
            direccion: String
        },
        // Solo para personal de emergencia
        badge: String,
        departamento: String,
        especialidad: String,
        disponible: { type: Boolean, default: true },
        coordenadas: {
            latitud: Number,
            longitud: Number,
            lastUpdate: { type: Date, default: Date.now }
        }
    },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date, default: Date.now }
}, {
    timestamps: true
});

// Esquema de Emergencia (mejorado)
const emergencySchema = new mongoose.Schema({
    tipoEmergencia: {
        type: String,
        required: true,
        enum: ['asalto', 'accidente', 'medica', 'incendio', 'violencia_domestica', 'robo', 'otra']
    },
    ubicacion: {
        direccion: { type: String, required: true },
        distrito: { type: String, required: true },
        ciudad: { type: String, required: true },
        coordenadas: {
            latitud: Number,
            longitud: Number
        },
        puntoReferencia: String
    },
    descripcion: {
        type: String,
        required: true,
        minlength: 10
    },
    reportadoPor: {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        nombre: { type: String, default: 'Anónimo' },
        telefono: String,
        esAnonimo: { type: Boolean, default: false }
    },
    estado: {
        type: String,
        enum: ['activo', 'asignado', 'en_proceso', 'resuelto', 'cancelado'],
        default: 'activo'
    },
    prioridad: {
        type: String,
        enum: ['baja', 'media', 'alta', 'critica'],
        default: 'media'
    },
    asignado: {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        nombre: String,
        badge: String,
        tiempoAsignacion: Date,
        tiempoLlegada: Date
    },
    seguimiento: [{
        accion: String,
        descripcion: String,
        usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        timestamp: { type: Date, default: Date.now }
    }],
    recursos: [{
        tipo: { type: String, enum: ['policia', 'bombero', 'paramedico'] },
        cantidad: Number,
        solicitado: { type: Date, default: Date.now },
        estado: { type: String, enum: ['solicitado', 'despachado', 'en_lugar'], default: 'solicitado' }
    }],
    timestamp: { type: Date, default: Date.now },
    tiempoRespuesta: Number,
    fechaResolucion: Date
}, {
    timestamps: true
});

// Índices para optimizar consultas
emergencySchema.index({ timestamp: -1 });
emergencySchema.index({ estado: 1 });
emergencySchema.index({ tipoEmergencia: 1 });
emergencySchema.index({ 'ubicacion.distrito': 1 });
emergencySchema.index({ 'asignado.userId': 1 });

const User = mongoose.model('User', userSchema);
const Emergency = mongoose.model('Emergency', emergencySchema);

// MIDDLEWARE DE AUTENTICACIÓN
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Token requerido' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'clave-secreta-muy-segura', (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, message: 'Token inválido' });
        }
        req.user = user;
        next();
    });
};

// MIDDLEWARE DE ROLES
const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                message: 'No tienes permisos para esta acción' 
            });
        }
        next();
    };
};

// RUTAS DE AUTENTICACIÓN

// Crear usuario (solo administradores)
app.post('/api/admin/users', authenticateToken, authorizeRoles('administrador'), async (req, res) => {
    try {
        const { username, email, password, role, profile } = req.body;

        // Verificar si el usuario ya existe
        const existingUser = await User.findOne({ 
            $or: [{ email }, { username }] 
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'El usuario o email ya existe'
            });
        }

        // Encriptar contraseña
        const hashedPassword = await bcrypt.hash(password, 10);

        // Crear usuario
        const newUser = new User({
            username,
            email,
            password: hashedPassword,
            role,
            profile
        });

        await newUser.save();

        console.log(`✅ Usuario ${role} creado por admin:`, newUser.username);

        res.status(201).json({
            success: true,
            message: `Usuario ${role} creado exitosamente`,
            user: {
                id: newUser._id,
                username: newUser.username,
                email: newUser.email,
                role: newUser.role,
                profile: newUser.profile
            }
        });

    } catch (error) {
        console.error('Error al crear usuario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear usuario',
            error: error.message
        });
    }
});

// Obtener todos los usuarios (solo administradores)
app.get('/api/admin/users', authenticateToken, authorizeRoles('administrador'), async (req, res) => {
    try {
        const { role, page = 1, limit = 20 } = req.query;
        
        let query = {};
        if (role) query.role = role;

        const users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await User.countDocuments(query);

        res.json({
            success: true,
            data: users,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Error al obtener usuarios:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener usuarios',
            error: error.message
        });
    }
});

// Actualizar usuario (solo administradores)
app.put('/api/admin/users/:id', authenticateToken, authorizeRoles('administrador'), async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Si se actualiza la contraseña, encriptarla
        if (updateData.password) {
            updateData.password = await bcrypt.hash(updateData.password, 10);
        }

        const updatedUser = await User.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).select('-password');

        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Usuario actualizado correctamente',
            user: updatedUser
        });

    } catch (error) {
        console.error('Error al actualizar usuario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar usuario',
            error: error.message
        });
    }
});

// Eliminar usuario (solo administradores)
app.delete('/api/admin/users/:id', authenticateToken, authorizeRoles('administrador'), async (req, res) => {
    try {
        const { id } = req.params;

        const deletedUser = await User.findByIdAndDelete(id);

        if (!deletedUser) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Usuario eliminado correctamente'
        });

    } catch (error) {
        console.error('Error al eliminar usuario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar usuario',
            error: error.message
        });
    }
});

// Cambiar disponibilidad (solo personal de emergencia)
app.put('/api/users/availability', authenticateToken, authorizeRoles('policia', 'bombero', 'paramedico'), async (req, res) => {
    try {
        const { disponible, coordenadas } = req.body;
        const userId = req.user.userId;

        const updateData = {
            'profile.disponible': disponible,
            'profile.coordenadas.lastUpdate': new Date()
        };

        if (coordenadas) {
            updateData['profile.coordenadas.latitud'] = coordenadas.latitud;
            updateData['profile.coordenadas.longitud'] = coordenadas.longitud;
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            updateData,
            { new: true }
        ).select('-password');

        res.json({
            success: true,
            message: 'Disponibilidad actualizada',
            user: updatedUser
        });

    } catch (error) {
        console.error('Error al actualizar disponibilidad:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar disponibilidad',
            error: error.message
        });
    }
});

// Registro de usuario (solo para ciudadanos o admin creando usuarios)
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password, role, profile } = req.body;

        // Verificar si el usuario ya existe
        const existingUser = await User.findOne({ 
            $or: [{ email }, { username }] 
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'El usuario o email ya existe'
            });
        }

        // Encriptar contraseña
        const hashedPassword = await bcrypt.hash(password, 10);

        // Crear usuario
        const newUser = new User({
            username,
            email,
            password: hashedPassword,
            role: role || 'ciudadano',
            profile
        });

        await newUser.save();

        res.status(201).json({
            success: true,
            message: 'Usuario registrado exitosamente',
            user: {
                id: newUser._id,
                username: newUser.username,
                email: newUser.email,
                role: newUser.role
            }
        });

    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({
            success: false,
            message: 'Error al registrar usuario',
            error: error.message
        });
    }
});

// Login de usuario
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Buscar usuario
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Credenciales inválidas'
            });
        }

        // Verificar contraseña
        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
            return res.status(400).json({
                success: false,
                message: 'Credenciales inválidas'
            });
        }

        // Actualizar último login
        user.lastLogin = new Date();
        await user.save();

        // Generar token JWT
        const token = jwt.sign(
            { 
                userId: user._id, 
                role: user.role,
                username: user.username 
            },
            process.env.JWT_SECRET || 'clave-secreta-muy-segura',
            { expiresIn: '8h' }
        );

        res.json({
            success: true,
            message: 'Login exitoso',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                profile: user.profile
            }
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({
            success: false,
            message: 'Error al iniciar sesión',
            error: error.message
        });
    }
});

// Verificar token
app.get('/api/auth/verify', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-password');
        res.json({
            success: true,
            user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error al verificar token'
        });
    }
});

// RUTAS DE EMERGENCIAS

// Crear emergencia (ciudadanos y anónimos)
app.post('/api/emergencies', async (req, res) => {
    try {
        const emergencyData = req.body;
        const authHeader = req.headers['authorization'];
        
        // Verificar si es usuario autenticado
        if (authHeader) {
            const token = authHeader.split(' ')[1];
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'clave-secreta-muy-segura');
                const user = await User.findById(decoded.userId);
                
                emergencyData.reportadoPor = {
                    userId: user._id,
                    nombre: user.profile.nombre,
                    telefono: user.profile.telefono,
                    esAnonimo: false
                };
            } catch (err) {
                // Token inválido, continuar como anónimo
                emergencyData.reportadoPor = {
                    nombre: emergencyData.reportadoPor?.nombre || 'Anónimo',
                    telefono: emergencyData.reportadoPor?.telefono || '',
                    esAnonimo: true
                };
            }
        } else {
            // Reporte anónimo
            emergencyData.reportadoPor = {
                nombre: emergencyData.reportadoPor?.nombre || 'Anónimo',
                telefono: emergencyData.reportadoPor?.telefono || '',
                esAnonimo: true
            };
        }

        // Determinar prioridad automáticamente
        const prioridadMap = {
            'asalto': 'alta',
            'accidente': 'critica',
            'medica': 'critica',
            'incendio': 'critica',
            'violencia_domestica': 'alta',
            'robo': 'media',
            'otra': 'media'
        };

        emergencyData.prioridad = prioridadMap[emergencyData.tipoEmergencia] || 'media';

        const newEmergency = new Emergency(emergencyData);
        const savedEmergency = await newEmergency.save();

        // Notificar a personal de emergencia cercano
        await notifyNearbyPersonnel(savedEmergency);

        console.log('✅ Nueva emergencia creada:', savedEmergency._id);

        res.status(201).json({
            success: true,
            message: 'Emergencia reportada exitosamente',
            data: savedEmergency
        });

    } catch (error) {
        console.error('Error al crear emergencia:', error);
        res.status(400).json({
            success: false,
            message: 'Error al crear emergencia',
            error: error.message
        });
    }
});

// Obtener emergencias (con filtros por rol)
app.get('/api/emergencies', async (req, res) => {
    try {
        const { estado, tipo, distrito, limit = 50 } = req.query;
        const authHeader = req.headers['authorization'];
        
        let query = {};
        
        if (estado) query.estado = estado;
        if (tipo) query.tipoEmergencia = tipo;
        if (distrito) query['ubicacion.distrito'] = distrito;

        // Si es usuario autenticado, filtrar según rol
        if (authHeader) {
            const token = authHeader.split(' ')[1];
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'clave-secreta-muy-segura');
                const user = await User.findById(decoded.userId);
                
                // Filtrar emergencias según el rol
                if (user.role === 'policia') {
                    query.tipoEmergencia = { $in: ['asalto', 'robo', 'violencia_domestica'] };
                } else if (user.role === 'bombero') {
                    query.tipoEmergencia = { $in: ['incendio', 'accidente'] };
                } else if (user.role === 'paramedico') {
                    query.tipoEmergencia = { $in: ['medica', 'accidente'] };
                }
            } catch (err) {
                // Token inválido, mostrar todas las emergencias públicas
            }
        }

        const emergencies = await Emergency.find(query)
            .populate('reportadoPor.userId', 'username profile.nombre')
            .populate('asignado.userId', 'username profile.nombre')
            .sort({ timestamp: -1 })
            .limit(parseInt(limit));

        res.json({
            success: true,
            data: emergencies,
            total: emergencies.length
        });

    } catch (error) {
        console.error('Error al obtener emergencias:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener emergencias',
            error: error.message
        });
    }
});

// Asignar emergencia (solo personal de emergencia)
app.put('/api/emergencies/:id/assign', authenticateToken, authorizeRoles('policia', 'bombero', 'paramedico'), async (req, res) => {
    try {
        const emergencyId = req.params.id;
        const userId = req.user.userId;
        
        const user = await User.findById(userId);
        const emergency = await Emergency.findById(emergencyId);

        if (!emergency) {
            return res.status(404).json({
                success: false,
                message: 'Emergencia no encontrada'
            });
        }

        if (emergency.estado !== 'activo') {
            return res.status(400).json({
                success: false,
                message: 'La emergencia ya está asignada'
            });
        }

        // Asignar emergencia
        emergency.asignado = {
            userId: user._id,
            nombre: user.profile.nombre,
            badge: user.profile.badge,
            tiempoAsignacion: new Date()
        };
        emergency.estado = 'asignado';

        // Agregar seguimiento
        emergency.seguimiento.push({
            accion: 'Asignación',
            descripcion: `Emergencia asignada a ${user.profile.nombre}`,
            usuario: user._id
        });

        await emergency.save();

        res.json({
            success: true,
            message: 'Emergencia asignada exitosamente',
            data: emergency
        });

    } catch (error) {
        console.error('Error al asignar emergencia:', error);
        res.status(500).json({
            success: false,
            message: 'Error al asignar emergencia',
            error: error.message
        });
    }
});

// Actualizar estado de emergencia
app.put('/api/emergencies/:id/status', authenticateToken, async (req, res) => {
    try {
        const { estado, descripcion } = req.body;
        const emergency = await Emergency.findById(req.params.id);
        
        if (!emergency) {
            return res.status(404).json({
                success: false,
                message: 'Emergencia no encontrada'
            });
        }

        emergency.estado = estado;
        
        if (estado === 'resuelto') {
            emergency.fechaResolucion = new Date();
            emergency.tiempoRespuesta = new Date() - emergency.timestamp;
        }

        // Agregar seguimiento
        emergency.seguimiento.push({
            accion: 'Cambio de estado',
            descripcion: descripcion || `Estado cambiado a ${estado}`,
            usuario: req.user.userId
        });

        await emergency.save();

        res.json({
            success: true,
            message: 'Estado actualizado correctamente',
            data: emergency
        });

    } catch (error) {
        console.error('Error al actualizar estado:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar estado',
            error: error.message
        });
    }
});

// Dashboard administrativo
app.get('/api/admin/dashboard', authenticateToken, authorizeRoles('administrador'), async (req, res) => {
    try {
        const [
            totalEmergencias,
            emergenciasActivas,
            emergenciasHoy,
            personalDisponible,
            estadisticasPorTipo
        ] = await Promise.all([
            Emergency.countDocuments(),
            Emergency.countDocuments({ estado: { $in: ['activo', 'asignado', 'en_proceso'] } }),
            Emergency.countDocuments({ 
                timestamp: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
            }),
            User.countDocuments({ 
                role: { $in: ['policia', 'bombero', 'paramedico'] },
                'profile.disponible': true 
            }),
            Emergency.aggregate([
                { $group: { _id: '$tipoEmergencia', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ])
        ]);

        res.json({
            success: true,
            data: {
                totalEmergencias,
                emergenciasActivas,
                emergenciasHoy,
                personalDisponible,
                estadisticasPorTipo
            }
        });

    } catch (error) {
        console.error('Error en dashboard:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener datos del dashboard',
            error: error.message
        });
    }
});

// Obtener personal disponible
app.get('/api/admin/personnel', authenticateToken, authorizeRoles('administrador'), async (req, res) => {
    try {
        const personnel = await User.find({
            role: { $in: ['policia', 'bombero', 'paramedico'] }
        }).select('-password');

        res.json({
            success: true,
            data: personnel
        });

    } catch (error) {
        console.error('Error al obtener personal:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener personal',
            error: error.message
        });
    }
});

// Función para notificar personal cercano
async function notifyNearbyPersonnel(emergency) {
    try {
        const tipoPersonal = {
            'asalto': 'policia',
            'robo': 'policia',
            'violencia_domestica': 'policia',
            'incendio': 'bombero',
            'accidente': ['policia', 'bombero', 'paramedico'],
            'medica': 'paramedico'
        };

        const roles = Array.isArray(tipoPersonal[emergency.tipoEmergencia]) 
            ? tipoPersonal[emergency.tipoEmergencia] 
            : [tipoPersonal[emergency.tipoEmergencia]];

        const nearbyPersonnel = await User.find({
            role: { $in: roles },
            'profile.disponible': true,
            'profile.ubicacion.distrito': emergency.ubicacion.distrito
        });

        // Aquí se enviarían notificaciones push, emails, etc.
        console.log(`📢 Notificando a ${nearbyPersonnel.length} personas del personal`);

    } catch (error) {
        console.error('Error notificando personal:', error);
    }
}

// Ruta para servir diferentes interfaces según el rol
// Ruta para servir el frontend
app.get('/login', (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(__dirname, '../frontend/login.html'));
});
app.get('/', (req, res) => {
    console.log('Accediendo a ruta raíz - sirviendo login.html');
    const loginPath = path.join(__dirname, '../frontend/login.html');
    console.log('Ruta completa:', loginPath);
    res.sendFile(loginPath);
});
app.get('/debug', (req, res) => {
    const fs = require('fs');
    const loginPath = path.join(__dirname, '../frontend/login.html');
    const exists = fs.existsSync(loginPath);
    res.json({
        loginPath: loginPath,
        exists: exists,
        files: fs.readdirSync(path.join(__dirname, '../frontend'))
    });
});
app.get('/', (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(__dirname, '../frontend/login.html'));
});
// Asegúrate de que también tengas estas rutas:
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

app.get('/ciudadano', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/ciudadano.html'));
});

app.get('/personal', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/personal.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

// Manejo de errores global
app.use((err, req, res, next) => {
    console.error('Error no manejado:', err);
    res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Error interno'
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
    console.log(`👤 Login: http://localhost:${PORT}`);
    console.log(`🏠 Ciudadano: http://localhost:${PORT}/ciudadano`);
    console.log(`👮 Personal: http://localhost:${PORT}/personal`);
    console.log(`👨‍💼 Admin: http://localhost:${PORT}/admin`);
    console.log(`🔧 API: http://localhost:${PORT}/api`);
});

// Manejo de cierre del servidor
process.on('SIGINT', async () => {
    console.log('\n🔄 Cerrando servidor...');
    await mongoose.connection.close();
    console.log('❌ Conexión a MongoDB cerrada');
    process.exit(0);
});