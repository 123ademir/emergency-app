const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

console.log('🚀 Creando usuarios desde cero...');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/emergency-db')
.then(() => {
    console.log('✅ Conectado a MongoDB');
    createUsers();
})
.catch(err => {
    console.error('❌ Error conectando a MongoDB:', err);
    process.exit(1);
});

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['ciudadano', 'policia', 'bombero', 'paramedico', 'administrador'] },
    profile: {
        nombre: { type: String, required: true },
        telefono: { type: String, required: true },
        ubicacion: {
            ciudad: { type: String, required: true },
            distrito: { type: String, required: true }
        },
        badge: String,
        departamento: String,
        disponible: { type: Boolean, default: true }
    },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date, default: Date.now }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

async function createUsers() {
    try {
        // Borrar todos los usuarios existentes
        await User.deleteMany({});
        console.log('🗑️ Usuarios anteriores eliminados');

        const users = [
            {
                username: 'admin',
                email: 'admin@emergencias.com',
                password: await bcrypt.hash('admin123', 10),
                role: 'administrador',
                profile: {
                    nombre: 'Administrador del Sistema',
                    telefono: '999999999',
                    ubicacion: {
                        ciudad: 'Arequipa',
                        distrito: 'Centro'
                    },
                    badge: 'ADM-001',
                    departamento: 'Administración'
                }
            },
            {
                username: 'policia001',
                email: 'policia@emergencias.com',
                password: await bcrypt.hash('policia123', 10),
                role: 'policia',
                profile: {
                    nombre: 'Oficial Carlos Ruiz',
                    telefono: '987654321',
                    ubicacion: {
                        ciudad: 'Arequipa',
                        distrito: 'Centro'
                    },
                    badge: 'POL-001',
                    departamento: 'Policía Nacional'
                }
            },
            {
                username: 'bombero001',
                email: 'bombero@emergencias.com',
                password: await bcrypt.hash('bombero123', 10),
                role: 'bombero',
                profile: {
                    nombre: 'Capitán Luis González',
                    telefono: '987654322',
                    ubicacion: {
                        ciudad: 'Arequipa',
                        distrito: 'Centro'
                    },
                    badge: 'BOM-001',
                    departamento: 'Bomberos'
                }
            },
            {
                username: 'paramedico001',
                email: 'paramedico@emergencias.com',
                password: await bcrypt.hash('paramedico123', 10),
                role: 'paramedico',
                profile: {
                    nombre: 'Dra. María López',
                    telefono: '987654323',
                    ubicacion: {
                        ciudad: 'Arequipa',
                        distrito: 'Centro'
                    },
                    badge: 'PAR-001',
                    departamento: 'SAMU'
                }
            },
            {
                username: 'ciudadano001',
                email: 'ciudadano@emergencias.com',
                password: await bcrypt.hash('ciudadano123', 10),
                role: 'ciudadano',
                profile: {
                    nombre: 'Juan Pérez',
                    telefono: '987654324',
                    ubicacion: {
                        ciudad: 'Arequipa',
                        distrito: 'Cercado'
                    }
                }
            }
        ];

        // Crear usuarios
        for (const userData of users) {
            const user = new User(userData);
            await user.save();
            console.log(`✅ Usuario creado: ${userData.role} - ${userData.email}`);
        }

        console.log('\n🎉 ¡Todos los usuarios creados exitosamente!');
        console.log('='.repeat(50));
        console.log('📋 CREDENCIALES PARA USAR:');
        console.log('='.repeat(50));
        console.log('👨‍💼 Admin:     admin@emergencias.com / admin123');
        console.log('👮 Policía:    policia@emergencias.com / policia123');
        console.log('🚒 Bombero:    bombero@emergencias.com / bombero123');
        console.log('🚑 Paramédico: paramedico@emergencias.com / paramedico123');
        console.log('👤 Ciudadano:  ciudadano@emergencias.com / ciudadano123');
        console.log('='.repeat(50));
        console.log('🌐 Ve a: http://localhost:3000/login');

        mongoose.connection.close();
    } catch (error) {
        console.error('❌ Error:', error);
        mongoose.connection.close();
    }
}