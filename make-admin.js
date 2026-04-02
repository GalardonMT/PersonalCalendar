const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const path = require('path');

(async () => {
    // Si estamos en EasyPanel es probable que use la ruta de la variable de entorno
    const filename = process.env.DB_PATH || './database.sqlite';
    const db = await open({ filename: filename, driver: sqlite3.Database });
    
    const username = process.argv[2];
    if (!username) {
        console.log('Uso: node make-admin.js <nombre_de_usuario>');
        return;
    }
    
    const user = await db.get('SELECT id FROM users WHERE username = ?', [username]);
    if (!user) {
        console.log('Usuario no encontrado en la base de datos: ' + filename);
        return;
    }
    
    await db.run('UPDATE users SET is_superuser = 1 WHERE id = ?', [user.id]);
    console.log('Usuario ' + username + ' actualizado a superusuario correctamente.');
    process.exit(0);
})();
