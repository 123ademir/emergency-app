const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

console.log('🔧 Iniciando corrección de contraseñas...');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/emergency-db')
.then(() => {
    console.log('✅ Conectado a MongoDB');
    fixPasswords();
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
        }
    }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

async function fixPasswords() {
    try {
        const users = [
            { email: 'admin@emergencias.com', password: 'admin123' },
            { email: 'policia@emergencias.com', password: 'policia123' },
            { email: 'bombero@emergencias.com', password: 'bombero123' },
            { email: 'paramedico@emergencias.com', password: 'paramedico123' },
            { email: 'ciudadano@emergencias.com', password: 'ciudadano123' }
        ];

        console.log('📝 Actualizando contraseñas...');

        for (const userData of users) {
            const hashedPassword = await bcrypt.hash(userData.password, 10);
            
            const result = await User.findOneAndUpdate(
                { email: userData.email },
                { password: hashedPassword },
                { new: true }
            );
            
            if (result) {
                console.log(`✅ Contraseña actualizada para: ${userData.email}`);
            } else {
                console.log(`⚠️ Usuario no encontrado: ${userData.email}`);
            }
        }

        console.log('\n🎉 ¡Proceso completado exitosamente!');
        console.log('📋 Credenciales actualizadas:');
        console.log('   👨‍💼 Admin: admin@emergencias.com / admin123');
        console.log('   👮 Policía: policia@emergencias.com / policia123');
        console.log('   🚒 Bombero: bombero@emergencias.com / bombero123');
        console.log('   🚑 Paramédico: paramedico@emergencias.com / paramedico123');
        console.log('   👤 Ciudadano: ciudadano@emergencias.com / ciudadano123');
        console.log('\n🌐 Ve a: http://localhost:3000/login');

        mongoose.connection.close();
    } catch (error) {
        console.error('❌ Error:', error);
        mongoose.connection.close();
    }
}create-users-fresh.js