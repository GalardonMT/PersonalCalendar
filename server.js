const fastify = require('fastify')({ logger: true });
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');
const crypto = require('crypto');
const { open } = require('sqlite');
const cron = require('node-cron');

let db;

const DEFAULT_COLOR = '#3b82f6';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias
const SESSION_CLEANUP_INTERVAL_MS = 1000 * 60 * 60; // 1 hora

// ── Rate limiter en memoria para login/registro ──
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const RATE_LIMIT_MAX_HITS = 10;

function checkRateLimit(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now - entry.start > RATE_LIMIT_WINDOW_MS) {
        rateLimitMap.set(ip, { start: now, count: 1 });
        return true;
    }
    entry.count += 1;
    return entry.count <= RATE_LIMIT_MAX_HITS;
}

// Limpiar entradas expiradas del rate limiter cada 5 minutos
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
        if (now - entry.start > RATE_LIMIT_WINDOW_MS) {
            rateLimitMap.delete(ip);
        }
    }
}, 5 * 60 * 1000).unref();

// ── Helper para transacciones ──
async function withTransaction(fn) {
    await db.exec('BEGIN');
    try {
        const result = await fn();
        await db.exec('COMMIT');
        return result;
    } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
    }
}

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
            created_at TEXT NOT NULL,
            is_superuser INTEGER DEFAULT 0,
            whatsapp_enabled INTEGER DEFAULT 0,
            whatsapp_phone TEXT,
            whatsapp_apikey TEXT
        )
    `);

    // Migration para base de datos existente
    try {
        await db.exec('ALTER TABLE users ADD COLUMN is_superuser INTEGER DEFAULT 0');
    } catch (e) {
        // Ignorar si la columna ya existe
    }
    try { await db.exec('ALTER TABLE users ADD COLUMN whatsapp_enabled INTEGER DEFAULT 0'); } catch (e) { }
    try { await db.exec('ALTER TABLE users ADD COLUMN whatsapp_phone TEXT'); } catch (e) { }
    try { await db.exec('ALTER TABLE users ADD COLUMN whatsapp_apikey TEXT'); } catch (e) { }
    try { await db.exec('ALTER TABLE users ADD COLUMN daily_hour INTEGER DEFAULT 9'); } catch (e) { }
    try { await db.exec('ALTER TABLE users ADD COLUMN daily_minute INTEGER DEFAULT 0'); } catch (e) { }
    try { await db.exec('ALTER TABLE users ADD COLUMN weekly_hour INTEGER DEFAULT 20'); } catch (e) { }
    try { await db.exec('ALTER TABLE users ADD COLUMN weekly_minute INTEGER DEFAULT 0'); } catch (e) { }
    try { await db.exec('ALTER TABLE users ADD COLUMN weekly_day INTEGER DEFAULT 0'); } catch (e) { }

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
            description TEXT,
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
            description TEXT,
            color TEXT NOT NULL DEFAULT '${DEFAULT_COLOR}',
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (template_id) REFERENCES event_templates(id) ON DELETE RESTRICT
        )
    `);

    await ensureColumn('event_templates', 'color', `TEXT NOT NULL DEFAULT '${DEFAULT_COLOR}'`);
    await ensureColumn('event_templates', 'description', 'TEXT');
    await ensureColumn('calendar_events', 'color', `TEXT NOT NULL DEFAULT '${DEFAULT_COLOR}'`);
    await ensureColumn('calendar_events', 'description', 'TEXT');
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

    // ── Optimizaciones de rendimiento ──
    await db.exec('PRAGMA journal_mode=WAL');
    await db.exec('PRAGMA foreign_keys=ON');

    // Indices para acelerar consultas frecuentes
    await db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_events_user ON calendar_events(user_id)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_events_start ON calendar_events(start)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_events_template ON calendar_events(template_id)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_templates_user ON event_templates(user_id)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_template_tags_template ON template_tags(template_id)');

    // Limpieza inicial de sesiones expiradas
    await db.run('DELETE FROM user_sessions WHERE expires_at <= ?', [new Date().toISOString()]);

    // Limpieza periodica de sesiones expiradas
    setInterval(async () => {
        try {
            await db.run('DELETE FROM user_sessions WHERE expires_at <= ?', [new Date().toISOString()]);
        } catch (err) {
            console.error('Error limpiando sesiones expiradas:', err.message);
        }
    }, SESSION_CLEANUP_INTERVAL_MS).unref();

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
        SELECT s.id, s.user_id, s.expires_at, u.username, u.is_superuser, u.whatsapp_enabled, u.whatsapp_phone, u.whatsapp_apikey
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
        token,
        is_superuser: session.is_superuser === 1,
        whatsapp_enabled: session.whatsapp_enabled === 1,
        whatsapp_phone: session.whatsapp_phone,
        whatsapp_apikey: session.whatsapp_apikey
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
    return { success: true, user: { id: user.id, username: user.username, is_superuser: user.is_superuser, whatsapp_enabled: user.whatsapp_enabled } };
});

fastify.get('/api/admin/users', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    if (!user.is_superuser) {
        reply.code(403);
        return { success: false, message: 'Acceso denegado. Se requiere ser administrador.' };
    }
    const users = await db.all('SELECT id, username, created_at FROM users ORDER BY id DESC');
    return users;
});

fastify.put('/api/admin/users/:id', async (request, reply) => {
    const admin = await requireAuth(request, reply);
    if (!admin) return;
    if (!admin.is_superuser) {
        reply.code(403); return { success: false, message: 'Acceso denegado.' };
    }

    const targetUserId = parseInt(request.params.id, 10);
    const newUsernameStr = String(request.body?.username || '').trim();
    const newPasswordStr = String(request.body?.password || '');

    if (!targetUserId || targetUserId <= 0) {
        reply.code(400); return { success: false, message: 'ID invalido.' };
    }

    try {
        const username = sanitizeUsername(newUsernameStr);
        let password = null;
        if (newPasswordStr) {
            password = sanitizePassword(newPasswordStr);
        }

        const existing = await db.get('SELECT id FROM users WHERE username = ? AND id != ?', [username, targetUserId]);
        if (existing) {
            reply.code(409); return { success: false, message: 'Ese usuario ya existe.' };
        }

        if (password) {
            const salt = crypto.randomBytes(16).toString('hex');
            const hash = hashPassword(password, salt);
            await db.run('UPDATE users SET username = ?, password_hash = ?, password_salt = ? WHERE id = ?', [username, hash, salt, targetUserId]);
        } else {
            await db.run('UPDATE users SET username = ? WHERE id = ?', [username, targetUserId]);
        }

        return { success: true, message: 'Usuario actualizado correctamente.' };
    } catch (err) {
        reply.code(400);
        return { success: false, message: err.message };
    }
});

fastify.delete('/api/admin/users/:id', async (request, reply) => {
    const admin = await requireAuth(request, reply);
    if (!admin) return;
    if (!admin.is_superuser) {
        reply.code(403); return { success: false, message: 'Acceso denegado.' };
    }
    const targetUserId = parseInt(request.params.id, 10);
    if (!targetUserId || targetUserId <= 0) {
        reply.code(400); return { success: false, message: 'ID invalido.' };
    }

    if (admin.id === targetUserId) {
        reply.code(400); return { success: false, message: 'No puedes eliminarte a ti mismo.' };
    }

    try {
        await withTransaction(async () => {
            await db.run('DELETE FROM user_sessions WHERE user_id = ?', [targetUserId]);
            await db.run('DELETE FROM calendar_events WHERE user_id = ?', [targetUserId]);

            const templates = await db.all('SELECT id FROM event_templates WHERE user_id = ?', [targetUserId]);
            for (const t of templates) {
                await db.run('DELETE FROM template_tags WHERE template_id = ?', [t.id]);
            }
            await db.run('DELETE FROM event_templates WHERE user_id = ?', [targetUserId]);

            await db.run('DELETE FROM users WHERE id = ?', [targetUserId]);
        });
        return { success: true, message: 'Usuario eliminado.' };
    } catch (err) {
        reply.code(500); return { success: false, message: err.message };
    }
});

fastify.post('/api/auth/register', async (request, reply) => {
    const ip = request.ip;
    if (!checkRateLimit(ip)) {
        reply.code(429);
        return { success: false, message: 'Demasiados intentos. Espera unos minutos.' };
    }

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
    const ip = request.ip;
    if (!checkRateLimit(ip)) {
        reply.code(429);
        return { success: false, message: 'Demasiados intentos. Espera unos minutos.' };
    }

    let username;
    let password;
    try {
        username = sanitizeUsername(request.body?.username);
        password = sanitizePassword(request.body?.password);
    } catch (error) {
        reply.code(400);
        return { success: false, message: error.message };
    }

    const user = await db.get('SELECT id, username, password_hash, password_salt, is_superuser, whatsapp_enabled FROM users WHERE username = ?', [username]);
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
    return { success: true, message: 'Login correcto.', user: { id: user.id, username: user.username, is_superuser: user.is_superuser === 1, whatsapp_enabled: user.whatsapp_enabled === 1 } };
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
        SELECT id, template_id, title, start, selected_tag, description, color
        FROM calendar_events
        WHERE user_id = ?
        `,
        [user.id]
    );
    return eventos.map((evento) => ({
        id: evento.id,
        title: evento.title,
        start: evento.start,
        allDay: true,
        templateId: evento.template_id,
        selectedTag: evento.selected_tag || '',
        description: evento.description || '',
        backgroundColor: evento.color || DEFAULT_COLOR,
        borderColor: evento.color || DEFAULT_COLOR,
        textColor: getTextColorForBackground(evento.color || DEFAULT_COLOR)
    }));
});

fastify.get('/api/eventos-detalle', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) {
        return;
    }

    const eventos = await db.all(
        `
        SELECT id, template_id, title, start, selected_tag, description, color
        FROM calendar_events
        WHERE user_id = ?
        ORDER BY start ASC, id ASC
        `,
        [user.id]
    );
    return eventos.map((evento) => ({
        id: evento.id,
        templateId: evento.template_id,
        title: evento.title,
        start: evento.start,
        selectedTag: evento.selected_tag || '',
        description: evento.description || '',
        color: evento.color || DEFAULT_COLOR
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
        SELECT id, template_id, title, start, selected_tag, description, color
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
        description: evento.description || '',
        color: evento.color || DEFAULT_COLOR
    }));
});

fastify.get('/api/plantillas', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) {
        return;
    }

    const templates = await db.all(
        'SELECT id, title, color, description FROM event_templates WHERE user_id = ? ORDER BY id DESC',
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
            description: template.description || '',
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

    const templateId = await withTransaction(async () => {
        const insertTemplate = await db.run(
            'INSERT INTO event_templates (user_id, title, color, description) VALUES (?, ?, ?, ?)',
            [user.id, title, color, String(request.body?.description || '')]
        );
        const newId = insertTemplate.lastID;

        for (const tag of tags) {
            await db.run('INSERT INTO template_tags (template_id, name) VALUES (?, ?)', [newId, tag]);
        }

        return newId;
    });
    return { success: true, message: 'Plantilla guardada', templateId };
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

    await withTransaction(async () => {
        await db.run('UPDATE event_templates SET title = ?, color = ?, description = ? WHERE id = ? AND user_id = ?', [
            title,
            color,
            String(request.body?.description || ''),
            templateId,
            user.id
        ]);
        await db.run('UPDATE calendar_events SET title = ?, color = ?, description = ? WHERE template_id = ? AND user_id = ?', [
            title,
            color,
            String(request.body?.description || ''),
            templateId,
            user.id
        ]);
        await db.run('DELETE FROM template_tags WHERE template_id = ?', [templateId]);

        for (const tag of tags) {
            await db.run('INSERT INTO template_tags (template_id, name) VALUES (?, ?)', [templateId, tag]);
        }
    });
    return { success: true, message: 'Plantilla actualizada' };
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

    const eventDescription = String(request.body?.description || template.description || '');
    await db.run(
        'INSERT INTO calendar_events (user_id, template_id, title, start, selected_tag, description, color) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [user.id, templateId, template.title, start, selectedTag, eventDescription, template.color || DEFAULT_COLOR]
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
    const start = String(request.body?.start || '').trim();

    if (!Number.isInteger(eventId) || eventId <= 0) {
        reply.code(400);
        return { success: false, message: 'Evento invalido.' };
    }

    if (!Number.isInteger(templateId) || templateId <= 0) {
        reply.code(400);
        return { success: false, message: 'Plantilla invalida.' };
    }

    if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
        reply.code(400);
        return { success: false, message: 'Fecha invalida. Usa formato YYYY-MM-DD.' };
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

    let description = null;
    if (typeof request.body?.description === 'string') {
        description = request.body.description.trim();
    }

    await db.run(
        `
        UPDATE calendar_events
        SET template_id = ?, title = ?, selected_tag = ?, description = COALESCE(?, description), color = ?, start = COALESCE(?, start)
        WHERE id = ? AND user_id = ?
        `,
        [templateId, template.title, selectedTag, description !== null ? description : null, template.color || DEFAULT_COLOR, start || null, eventId, user.id]
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

async function sendWhatsAppMessage(phone, apiKey, message) {
    if (!phone || !apiKey || !message) return false;
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(apiKey)}`;
    try {
        const response = await fetch(url);
        if (response.ok) {
            console.log(`WhatsApp enviado a ${phone}`);
            return true;
        } else {
            console.error(`Error enviando WhatsApp: ${response.statusText}`);
            return false;
        }
    } catch (error) {
        console.error(`Error enviando WhatsApp: ${error.message}`);
        return false;
    }
}

function getChileDateStr(dateObj) {
    const d = new Date(dateObj.toLocaleString('en-US', { timeZone: 'America/Santiago' }));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function formatDateToDDMMYYYY(dateStr) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

async function sendDailyReport(admin, dateStr) {
    const eventos = await db.all(
        'SELECT title, selected_tag, description FROM calendar_events WHERE user_id = ? AND start = ?',
        [admin.id, dateStr]
    );
    if (eventos.length === 0) return;

    let msg = `📅 *Eventos de hoy (${formatDateToDDMMYYYY(dateStr)})*\n\n`;
    const eventsByTitle = {};
    eventos.forEach(e => {
        if (!eventsByTitle[e.title]) eventsByTitle[e.title] = [];
        eventsByTitle[e.title].push(e);
    });
    for (const title in eventsByTitle) {
        msg += `📌 *${title}*\n`;
        eventsByTitle[title].forEach(e => {
            if (e.selected_tag || e.description) {
                if (e.selected_tag) msg += `🔸 *${e.selected_tag}*\n`;
                if (e.description) msg += `↳ ${e.description}\n`;
            }
        });
        msg += `\n`;
    }
    await sendWhatsAppMessage(admin.whatsapp_phone, admin.whatsapp_apikey, msg.trim());
}

async function sendWeeklyReport(admin, now) {
    const today = new Date(now.toLocaleString('en-US', { timeZone: 'America/Santiago' }));
    const monday = new Date(today);
    monday.setDate(monday.getDate() + 1);
    const mondayStr = getChileDateStr(monday);
    const sundayNext = new Date(monday);
    sundayNext.setDate(sundayNext.getDate() + 6);
    const sundayNextStr = getChileDateStr(sundayNext);

    const eventos = await db.all(
        'SELECT title, start, selected_tag, description FROM calendar_events WHERE user_id = ? AND start >= ? AND start <= ? ORDER BY start ASC',
        [admin.id, mondayStr, sundayNextStr]
    );

    let msg = `🗓️ *Resumen de la semana (${formatDateToDDMMYYYY(mondayStr)} a ${formatDateToDDMMYYYY(sundayNextStr)})*\n\n`;
    if (eventos.length === 0) {
        msg += `No tienes eventos programados.`;
    } else {
        const days = {};
        eventos.forEach(e => {
            if (!days[e.start]) days[e.start] = {};
            if (!days[e.start][e.title]) days[e.start][e.title] = [];
            days[e.start][e.title].push(e);
        });
        for (const day in days) {
            msg += `📅 *${formatDateToDDMMYYYY(day)}*:\n\n`;
            for (const title in days[day]) {
                msg += `📌 *${title}*\n`;
                days[day][title].forEach(e => {
                    if (e.selected_tag || e.description) {
                        if (e.selected_tag) msg += `🔸 *${e.selected_tag}*\n`;
                        if (e.description) msg += `↳ ${e.description}\n`;
                    }
                });
                msg += `\n`;
            }
        }
    }
    await sendWhatsAppMessage(admin.whatsapp_phone, admin.whatsapp_apikey, msg.trim());
}

function initCronJobs() {
    // Cron universal: se ejecuta cada minuto y compara con el horario de cada usuario
    cron.schedule('* * * * *', async () => {
        try {
            const now = new Date();
            // Hora y minuto actuales en zona horaria de Chile
            const chileNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Santiago' }));
            const currentHour = chileNow.getHours();
            const currentMinute = chileNow.getMinutes();
            const currentDayOfWeek = chileNow.getDay();
            const dateStr = getChileDateStr(now);

            const admins = await db.all(
                'SELECT id, whatsapp_phone, whatsapp_apikey, daily_hour, daily_minute, weekly_hour, weekly_minute, weekly_day FROM users WHERE is_superuser = 1 AND whatsapp_enabled = 1'
            );

            for (const admin of admins) {
                const dh = admin.daily_hour ?? 9;
                const dm = admin.daily_minute ?? 0;
                const wh = admin.weekly_hour ?? 20;
                const wm = admin.weekly_minute ?? 0;
                const wd = admin.weekly_day ?? 0;

                // Reporte diario: si la hora/minuto coincide con el horario del usuario
                if (currentHour === dh && currentMinute === dm) {
                    console.log(`Enviando reporte diario a usuario ${admin.id} (${dh}:${String(dm).padStart(2, '0')} Chile)`);
                    await sendDailyReport(admin, dateStr);
                }

                // Reporte semanal: en el día de la semana y horario elegidos por el usuario
                if (currentDayOfWeek === wd && currentHour === wh && currentMinute === wm) {
                    console.log(`Enviando reporte semanal a usuario ${admin.id} (Día ${wd} a las ${wh}:${String(wm).padStart(2, '0')} Chile)`);
                    await sendWeeklyReport(admin, now);
                }
            }
        } catch (error) {
            console.error('Error en cron de notificaciones:', error);
        }
    }, { scheduled: true, timezone: "America/Santiago" });
}

fastify.get('/api/user/settings', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    if (!user.is_superuser) {
        reply.code(403);
        return { success: false, message: 'Solo admins.' };
    }
    // Leer los campos directamente desde la BD para incluir los nuevos de horario
    const fullUser = await db.get(
        'SELECT whatsapp_enabled, whatsapp_phone, whatsapp_apikey, daily_hour, daily_minute, weekly_hour, weekly_minute, weekly_day FROM users WHERE id = ?',
        [user.id]
    );
    return {
        success: true,
        whatsapp_enabled: fullUser.whatsapp_enabled,
        whatsapp_phone: fullUser.whatsapp_phone || '',
        whatsapp_apikey: fullUser.whatsapp_apikey || '',
        daily_hour: fullUser.daily_hour ?? 9,
        daily_minute: fullUser.daily_minute ?? 0,
        weekly_hour: fullUser.weekly_hour ?? 20,
        weekly_minute: fullUser.weekly_minute ?? 0,
        weekly_day: fullUser.weekly_day ?? 0
    };
});

fastify.put('/api/user/settings', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    if (!user.is_superuser) {
        reply.code(403);
        return { success: false, message: 'Solo admins.' };
    }
    const enabled = request.body.whatsapp_enabled === true ? 1 : 0;
    const phone = String(request.body.whatsapp_phone || '').trim();
    const apikey = String(request.body.whatsapp_apikey || '').trim();

    const dailyHour = Math.max(0, Math.min(23, parseInt(request.body.daily_hour ?? 9, 10)));
    const dailyMinute = Math.max(0, Math.min(59, parseInt(request.body.daily_minute ?? 0, 10)));
    const weeklyHour = Math.max(0, Math.min(23, parseInt(request.body.weekly_hour ?? 20, 10)));
    const weeklyMinute = Math.max(0, Math.min(59, parseInt(request.body.weekly_minute ?? 0, 10)));
    const weeklyDay = Math.max(0, Math.min(6, parseInt(request.body.weekly_day ?? 0, 10)));

    await db.run(
        'UPDATE users SET whatsapp_enabled = ?, whatsapp_phone = ?, whatsapp_apikey = ?, daily_hour = ?, daily_minute = ?, weekly_hour = ?, weekly_minute = ?, weekly_day = ? WHERE id = ?',
        [enabled, phone, apikey, dailyHour, dailyMinute, weeklyHour, weeklyMinute, weeklyDay, user.id]
    );

    return { success: true, message: 'Configuración actualizada.' };
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
        initCronJobs();
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