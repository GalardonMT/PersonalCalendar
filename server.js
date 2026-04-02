const fastify = require('fastify')({ logger: true });
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');
const crypto = require('crypto');
const { open } = require('sqlite');

let db;

const DEFAULT_COLOR = '#3b82f6';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias

async function iniciarDB() {
    const filename = process.env.DB_PATH || './database.sqlite';
    const dbDir = path.dirname(filename);
    
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    db = await open({
        filename: filename,
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS user_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS event_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            title TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '${DEFAULT_COLOR}',
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS template_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            FOREIGN KEY (template_id) REFERENCES event_templates(id) ON DELETE CASCADE,
            UNIQUE(template_id, name)
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS calendar_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            template_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            start TEXT NOT NULL,
            selected_tag TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '${DEFAULT_COLOR}',
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (template_id) REFERENCES event_templates(id) ON DELETE RESTRICT
        )
    `);

    await ensureColumn('event_templates', 'color', `TEXT NOT NULL DEFAULT '${DEFAULT_COLOR}'`);
    await ensureColumn('calendar_events', 'color', `TEXT NOT NULL DEFAULT '${DEFAULT_COLOR}'`);
    await ensureColumn('event_templates', 'user_id', 'INTEGER');
    await ensureColumn('calendar_events', 'user_id', 'INTEGER');

    await db.exec(`
        CREATE TABLE IF NOT EXISTS eventos_legacy (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            start TEXT
        )
    `);

    const oldRows = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='eventos'");
    if (oldRows.length > 0) {
        await db.exec('INSERT INTO eventos_legacy (title, start) SELECT title, start FROM eventos');
        await db.exec('DROP TABLE eventos');
    }

    console.log('Base de datos SQLite conectada.');
}

async function ensureColumn(tableName, columnName, columnDefinition) {
    const columns = await db.all(`PRAGMA table_info(${tableName})`);
    const exists = columns.some((column) => column.name === columnName);
    if (!exists) {
        await db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
    }
}

function sanitizeTags(tags) {
    if (!Array.isArray(tags)) {
        return [];
    }

    const unique = [];
    const seen = new Set();

    for (const rawTag of tags) {
        const tag = String(rawTag || '').trim();
        if (!tag) {
            continue;
        }
        if (tag.length > 40) {
            throw new Error('Cada etiqueta debe tener maximo 40 caracteres.');
        }
        const lowered = tag.toLowerCase();
        if (!seen.has(lowered)) {
            seen.add(lowered);
            unique.push(tag);
        }
    }

    if (unique.length > 10) {
        throw new Error('Un evento puede tener maximo 10 etiquetas.');
    }

    return unique;
}

function sanitizeColor(rawColor) {
    const color = String(rawColor || '').trim();
    if (!color) {
        return DEFAULT_COLOR;
    }

    const normalized = color.toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(normalized)) {
        throw new Error('Color invalido. Debe ser hexadecimal como #1a2b3c.');
    }

    return normalized;
}

function sanitizeUsername(raw) {
    const username = String(raw || '').trim();
    if (!username) {
        throw new Error('El nombre de usuario es obligatorio.');
    }
    if (username.length < 3 || username.length > 30) {
        throw new Error('El nombre de usuario debe tener entre 3 y 30 caracteres.');
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
        throw new Error('El usuario solo puede usar letras, numeros, punto, guion y guion bajo.');
    }
    return username;
}

function sanitizePassword(raw) {
    const password = String(raw || '');
    if (!password) {
        throw new Error('La contrasena es obligatoria.');
    }
    if (password.length < 4 || password.length > 120) {
        throw new Error('La contrasena debe tener entre 4 y 120 caracteres.');
    }
    return password;
}

function hashPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

function parseCookies(request) {
    const raw = request.headers.cookie || '';
    const chunks = raw.split(';');
    const parsed = {};
    for (const chunk of chunks) {
        const [key, ...rest] = chunk.trim().split('=');
        if (!key) {
            continue;
        }
        parsed[key] = decodeURIComponent(rest.join('='));
    }
    return parsed;
}

function buildSessionCookie(token, expiresAt) {
    return `session_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}`;
}

function clearSessionCookie() {
    return 'session_token=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

async function getCurrentUser(request) {
    const cookies = parseCookies(request);
    const token = String(cookies.session_token || '').trim();
    if (!token) {
        return null;
    }

    const session = await db.get(
        `
        SELECT s.id, s.user_id, s.expires_at, u.username
        FROM user_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = ?
        `,
        [token]
    );

    if (!session) {
        return null;
    }

    if (new Date(session.expires_at).getTime() <= Date.now()) {
        await db.run('DELETE FROM user_sessions WHERE id = ?', [session.id]);
        return null;
    }

    return {
        id: session.user_id,
        username: session.username,
        token
    };
}

async function requireAuth(request, reply) {
    const user = await getCurrentUser(request);
    if (!user) {
        reply.code(401);
        reply.send({ success: false, message: 'No autenticado.' });
        return null;
    }
    return user;
}

function getTextColorForBackground(hexColor) {
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.62 ? '#111827' : '#ffffff';
}

fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, 'public'),
    prefix: '/',
});

fastify.get('/api/auth/me', async (request, reply) => {
    const user = await getCurrentUser(request);
    if (!user) {
        reply.code(401);
        return { success: false, message: 'No autenticado.' };
    }
    return { success: true, user: { id: user.id, username: user.username } };
});

fastify.post('/api/auth/register', async (request, reply) => {
    let username;
    let password;
    try {
        username = sanitizeUsername(request.body?.username);
        password = sanitizePassword(request.body?.password);
    } catch (error) {
        reply.code(400);
        return { success: false, message: error.message };
    }

    const existing = await db.get('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) {
        reply.code(409);
        return { success: false, message: 'Ese usuario ya existe.' };
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);
    const createdAt = new Date().toISOString();

    const result = await db.run(
        'INSERT INTO users (username, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?)',
        [username, hash, salt, createdAt]
    );

    return { success: true, message: 'Usuario creado.', userId: result.lastID };
});

fastify.post('/api/auth/login', async (request, reply) => {
    let username;
    let password;
    try {
        username = sanitizeUsername(request.body?.username);
        password = sanitizePassword(request.body?.password);
    } catch (error) {
        reply.code(400);
        return { success: false, message: error.message };
    }

    const user = await db.get('SELECT id, username, password_hash, password_salt FROM users WHERE username = ?', [username]);
    if (!user) {
        reply.code(401);
        return { success: false, message: 'Usuario o contrasena incorrectos.' };
    }

    const expectedHash = hashPassword(password, user.password_salt);
    if (expectedHash !== user.password_hash) {
        reply.code(401);
        return { success: false, message: 'Usuario o contrasena incorrectos.' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    const createdAt = new Date().toISOString();

    await db.run('INSERT INTO user_sessions (user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?)', [
        user.id,
        token,
        expiresAt,
        createdAt
    ]);

    reply.header('Set-Cookie', buildSessionCookie(token, expiresAt));
    return { success: true, message: 'Login correcto.', user: { id: user.id, username: user.username } };
});

fastify.post('/api/auth/logout', async (request, reply) => {
    const cookies = parseCookies(request);
    const token = String(cookies.session_token || '').trim();
    if (token) {
        await db.run('DELETE FROM user_sessions WHERE token = ?', [token]);
    }
    reply.header('Set-Cookie', clearSessionCookie());
    return { success: true, message: 'Sesion cerrada.' };
});

fastify.get('/api/eventos', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) {
        return;
    }

    const eventos = await db.all(
        `
        SELECT id, title, start, selected_tag, color
        FROM calendar_events
        WHERE user_id = ?
        `,
        [user.id]
    );

    return eventos.map((evento) => ({
        id: evento.id,
        title: evento.selected_tag ? `${evento.title} [${evento.selected_tag}]` : evento.title,
        start: evento.start,
        allDay: true,
        backgroundColor: evento.color || DEFAULT_COLOR,
        borderColor: evento.color || DEFAULT_COLOR,
        textColor: getTextColorForBackground(evento.color || DEFAULT_COLOR)
    }));
});

fastify.get('/api/eventos-dia/:date', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) {
        return;
    }

    const date = String(request.params?.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        reply.code(400);
        return { success: false, message: 'Fecha invalida. Usa formato YYYY-MM-DD.' };
    }

    const eventos = await db.all(
        `
        SELECT id, template_id, title, start, selected_tag, color
        FROM calendar_events
        WHERE start = ? AND user_id = ?
        ORDER BY id ASC
        `,
        [date, user.id]
    );

    return eventos.map((evento) => ({
        id: evento.id,
        templateId: evento.template_id,
        title: evento.title,
        start: evento.start,
        selectedTag: evento.selected_tag || '',
        color: evento.color || DEFAULT_COLOR
    }));
});

fastify.get('/api/plantillas', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) {
        return;
    }

    const templates = await db.all(
        'SELECT id, title, color FROM event_templates WHERE user_id = ? ORDER BY id DESC',
        [user.id]
    );

    const result = [];
    for (const template of templates) {
        const tags = await db.all(
            'SELECT name FROM template_tags WHERE template_id = ? ORDER BY id ASC',
            [template.id]
        );
        result.push({
            id: template.id,
            title: template.title,
            color: template.color || DEFAULT_COLOR,
            tags: tags.map((t) => t.name)
        });
    }

    return result;
});

fastify.post('/api/plantillas', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) {
        return;
    }

    const title = String(request.body?.title || '').trim();
    let color;
    let tags;

    try {
        color = sanitizeColor(request.body?.color);
    } catch (error) {
        reply.code(400);
        return { success: false, message: error.message };
    }

    try {
        tags = sanitizeTags(request.body?.tags);
    } catch (error) {
        reply.code(400);
        return { success: false, message: error.message };
    }

    if (!title) {
        reply.code(400);
        return { success: false, message: 'El titulo es obligatorio.' };
    }

    if (title.length > 120) {
        reply.code(400);
        return { success: false, message: 'El titulo debe tener maximo 120 caracteres.' };
    }

    await db.exec('BEGIN');
    try {
        const insertTemplate = await db.run(
            'INSERT INTO event_templates (user_id, title, color) VALUES (?, ?, ?)',
            [user.id, title, color]
        );
        const templateId = insertTemplate.lastID;

        for (const tag of tags) {
            await db.run('INSERT INTO template_tags (template_id, name) VALUES (?, ?)', [templateId, tag]);
        }

        await db.exec('COMMIT');
        return { success: true, message: 'Plantilla guardada', templateId };
    } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
    }
});

fastify.put('/api/plantillas/:id', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) {
        return;
    }

    const templateId = Number(request.params?.id);
    const title = String(request.body?.title || '').trim();
    let color;
    let tags;

    if (!Number.isInteger(templateId) || templateId <= 0) {
        reply.code(400);
        return { success: false, message: 'Plantilla invalida.' };
    }

    try {
        color = sanitizeColor(request.body?.color);
    } catch (error) {
        reply.code(400);
        return { success: false, message: error.message };
    }

    try {
        tags = sanitizeTags(request.body?.tags);
    } catch (error) {
        reply.code(400);
        return { success: false, message: error.message };
    }

    if (!title) {
        reply.code(400);
        return { success: false, message: 'El titulo es obligatorio.' };
    }

    if (title.length > 120) {
        reply.code(400);
        return { success: false, message: 'El titulo debe tener maximo 120 caracteres.' };
    }

    const existing = await db.get('SELECT id FROM event_templates WHERE id = ? AND user_id = ?', [templateId, user.id]);
    if (!existing) {
        reply.code(404);
        return { success: false, message: 'La plantilla no existe.' };
    }

    await db.exec('BEGIN');
    try {
        await db.run('UPDATE event_templates SET title = ?, color = ? WHERE id = ? AND user_id = ?', [
            title,
            color,
            templateId,
            user.id
        ]);
        await db.run('DELETE FROM template_tags WHERE template_id = ?', [templateId]);

        for (const tag of tags) {
            await db.run('INSERT INTO template_tags (template_id, name) VALUES (?, ?)', [templateId, tag]);
        }

        await db.exec('COMMIT');
        return { success: true, message: 'Plantilla actualizada' };
    } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
    }
});

fastify.delete('/api/plantillas/:id', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) {
        return;
    }

    const templateId = Number(request.params?.id);

    if (!Number.isInteger(templateId) || templateId <= 0) {
        reply.code(400);
        return { success: false, message: 'Plantilla invalida.' };
    }

    const inUse = await db.get(
        'SELECT id FROM calendar_events WHERE template_id = ? AND user_id = ? LIMIT 1',
        [templateId, user.id]
    );
    if (inUse) {
        reply.code(400);
        return { success: false, message: 'No se puede eliminar: esta plantilla ya tiene eventos guardados en el calendario.' };
    }

    const result = await db.run('DELETE FROM event_templates WHERE id = ? AND user_id = ?', [templateId, user.id]);
    if (!result.changes) {
        reply.code(404);
        return { success: false, message: 'La plantilla no existe.' };
    }

    return { success: true, message: 'Plantilla eliminada' };
});

fastify.post('/api/eventos', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) {
        return;
    }

    const templateId = Number(request.body?.templateId);
    const start = String(request.body?.start || '').trim();
    const selectedTag = String(request.body?.selectedTag || '').trim();

    if (!Number.isInteger(templateId) || templateId <= 0) {
        reply.code(400);
        return { success: false, message: 'Plantilla invalida.' };
    }

    if (!start) {
        reply.code(400);
        return { success: false, message: 'La fecha es obligatoria.' };
    }

    const template = await db.get('SELECT id, title, color FROM event_templates WHERE id = ? AND user_id = ?', [
        templateId,
        user.id
    ]);
    if (!template) {
        reply.code(404);
        return { success: false, message: 'La plantilla no existe.' };
    }

    if (selectedTag) {
        const tagExists = await db.get('SELECT id FROM template_tags WHERE template_id = ? AND name = ?', [
            templateId,
            selectedTag
        ]);
        if (!tagExists) {
            reply.code(400);
            return { success: false, message: 'La etiqueta seleccionada no pertenece a la plantilla.' };
        }
    }

    await db.run(
        'INSERT INTO calendar_events (user_id, template_id, title, start, selected_tag, color) VALUES (?, ?, ?, ?, ?, ?)',
        [user.id, templateId, template.title, start, selectedTag, template.color || DEFAULT_COLOR]
    );

    return { success: true, message: 'Evento guardado' };
});

fastify.put('/api/eventos/:id', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) {
        return;
    }

    const eventId = Number(request.params?.id);
    const templateId = Number(request.body?.templateId);
    const selectedTag = String(request.body?.selectedTag || '').trim();

    if (!Number.isInteger(eventId) || eventId <= 0) {
        reply.code(400);
        return { success: false, message: 'Evento invalido.' };
    }

    if (!Number.isInteger(templateId) || templateId <= 0) {
        reply.code(400);
        return { success: false, message: 'Plantilla invalida.' };
    }

    const currentEvent = await db.get('SELECT id FROM calendar_events WHERE id = ? AND user_id = ?', [eventId, user.id]);
    if (!currentEvent) {
        reply.code(404);
        return { success: false, message: 'El evento no existe.' };
    }

    const template = await db.get('SELECT id, title, color FROM event_templates WHERE id = ? AND user_id = ?', [
        templateId,
        user.id
    ]);
    if (!template) {
        reply.code(404);
        return { success: false, message: 'La plantilla no existe.' };
    }

    if (selectedTag) {
        const tagExists = await db.get('SELECT id FROM template_tags WHERE template_id = ? AND name = ?', [
            templateId,
            selectedTag
        ]);
        if (!tagExists) {
            reply.code(400);
            return { success: false, message: 'La etiqueta seleccionada no pertenece a la plantilla.' };
        }
    }

    await db.run(
        `
        UPDATE calendar_events
        SET template_id = ?, title = ?, selected_tag = ?, color = ?
        WHERE id = ? AND user_id = ?
        `,
        [templateId, template.title, selectedTag, template.color || DEFAULT_COLOR, eventId, user.id]
    );

    return { success: true, message: 'Evento actualizado' };
});

fastify.delete('/api/eventos/:id', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) {
        return;
    }

    const eventId = Number(request.params?.id);
    if (!Number.isInteger(eventId) || eventId <= 0) {
        reply.code(400);
        return { success: false, message: 'Evento invalido.' };
    }

    const result = await db.run('DELETE FROM calendar_events WHERE id = ? AND user_id = ?', [eventId, user.id]);
    if (!result.changes) {
        reply.code(404);
        return { success: false, message: 'El evento no existe.' };
    }

    return { success: true, message: 'Evento eliminado' };
});

fastify.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode || 500;
    reply.code(statusCode).send({
        success: false,
        message: error.message || 'Error interno del servidor'
    });
});

const start = async () => {
    try {
        await iniciarDB();
        // Escucha dinamicamente en el puerto que asigne EasyPanel (o 3000 por defecto)
        const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
        await fastify.listen({ port: port, host: '0.0.0.0' });
        console.log(`Server is running on port ${port}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

// Manejar los apagados correctamente para evitar que el orquestador se queje
['SIGINT', 'SIGTERM'].forEach(signal => {
    process.on(signal, async () => {
        await fastify.close();
        process.exit(0);
    });
});

start();