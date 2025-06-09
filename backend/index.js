import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import cors from 'cors';
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import pg from 'pg';
import connectPgSimple from 'connect-pg-simple';

// --- НАСТРОЙКИ ---
const PORT = process.env.PORT || 5001;
const app = express();
const pgPool = new pg.Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

async function logAction(user, actionType, details = {}) {
    try {
        const query = `
            INSERT INTO action_logs (user_id, user_name, action_type, details)
            VALUES ($1, $2, $3, $4)
        `;
        await pgPool.query(query, [user.id, user.username, actionType, details]);
        console.log(`[LOG] Пользователь ${user.username} выполнил действие: ${actionType}`);
    } catch (error) {
        console.error('!!! Ошибка записи в лог:', error);
    }
}

// --- DISCORD БОТ ---
const bot = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // Включаем доступ к участникам сервера
        GatewayIntentBits.MessageContent,
    ],
});

bot.on('ready', () => {
    console.log(`✅ Discord Бот запущен как ${bot.user.tag}!`);
});

bot.login(process.env.DISCORD_BOT_TOKEN);

// --- НАСТРОЙКА EXPRESS И PASSPORT (АУТЕНТИФИКАЦИЯ) ---
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());

const sessionStore = new (connectPgSimple(session))({ pool: pgPool });
app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7, // 1 неделя
    },
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
    // Сохраняем пользователя в сессию
    done(null, user);
});

passport.deserializeUser((user, done) => {
    // Получаем пользователя из сессии
    done(null, user);
});

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: `${process.env.BACKEND_URL}/api/auth/discord/callback`,
    scope: ['identify', 'guilds', 'guilds.members.read'],
},
// --- ИЗМЕНЕНИЕ: Функция стала асинхронной (async) ---
async (accessToken, refreshToken, profile, done) => {
    try {
        console.log(`Пользователь ${profile.username} (${profile.id}) аутентифицирован. Пытаемся получить его роли...`);

        // --- НАШ НОВЫЙ КОД: РУЧНОЕ ПОЛУЧЕНИЕ РОЛЕЙ ---
        const guild = await bot.guilds.fetch(process.env.DISCORD_GUILD_ID);
        if (!guild) {
            console.error(`Не удалось найти сервер с ID: ${process.env.DISCORD_GUILD_ID}`);
            return done(null, profile); // Возвращаем профиль без ролей, чтобы не ломать логин
        }

        const member = await guild.members.fetch(profile.id);
        if (!member) {
            console.warn(`Пользователь ${profile.username} есть в Discord, но не найден на указанном сервере.`);
            // Добавляем пустой массив ролей для этого сервера, чтобы фронтенд знал, что пользователь не на сервере
            profile.guilds = profile.guilds || [];
            const guildIndex = profile.guilds.findIndex(g => g.id === process.env.DISCORD_GUILD_ID);
            if (guildIndex > -1) {
                profile.guilds[guildIndex].roles = [];
            } else {
                profile.guilds.push({ id: process.env.DISCORD_GUILD_ID, roles: [] });
            }
            return done(null, profile);
        }

        // Получаем список ID ролей пользователя
        const userRoleIds = member.roles.cache.map(role => role.id);
        console.log(`Успешно получены роли для ${profile.username}:`, userRoleIds);

        // Добавляем или обновляем информацию о ролях в объекте пользователя
        // Это то, что будет сохранено в сессию
        const guildIndex = profile.guilds.findIndex(g => g.id === process.env.DISCORD_GUILD_ID);
        if (guildIndex > -1) {
            profile.guilds[guildIndex].roles = userRoleIds;
        } else {
            profile.guilds.push({ id: process.env.DISCORD_GUILD_ID, roles: userRoleIds });
        }

        // Возвращаем обновленный профиль, который сохранится в сессию
        return done(null, profile);

    } catch (error) {
        console.error('Критическая ошибка при получении ролей пользователя:', error);
        // В случае ошибки возвращаем исходный профиль, чтобы не прерывать вход
        return done(null, profile);
    }
}));

// --- MIDDLEWARE для проверки аутентификации ---
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: 'Не авторизован' });
};

// --- НОВЫЙ MIDDLEWARE ДЛЯ ПРОВЕРКИ ПРАВ ---
const checkPermission = (permissionKey) => {
    return async (req, res, next) => {
        if (!req.isAuthenticated()) {
            return res.status(401).json({ message: 'Не авторизован' });
        }

        try {
            // Получаем ID ролей пользователя из сессии
            const guildData = req.user.guilds.find(g => g.id === process.env.DISCORD_GUILD_ID);
            if (!guildData || !guildData.roles) {
                return res.status(403).json({ message: 'Нет данных о ролях на сервере.' });
            }
            const userRoleIds = guildData.roles;

            // Ищем в БД, есть ли у хотя бы одной из ролей пользователя нужное право
            const { rows } = await pgPool.query(
                'SELECT 1 FROM permissions WHERE role_id = ANY($1::varchar[]) AND permission_key = $2 LIMIT 1',
                [userRoleIds, permissionKey]
            );

            if (rows.length > 0) {
                // Право найдено, пропускаем дальше
                return next();
            } else {
                // Право не найдено
                return res.status(403).json({ message: 'Доступ запрещен. Недостаточно прав.' });
            }
        } catch (error) {
            console.error('Ошибка при проверке прав:', error);
            return res.status(500).json({ message: 'Внутренняя ошибка сервера при проверке прав' });
        }
    };
};

// --- РОУТЫ API ---
app.get('/api/auth/discord', passport.authenticate('discord'));

app.get('/api/auth/discord/callback', passport.authenticate('discord', {
    failureRedirect: process.env.FRONTEND_URL,
    successRedirect: process.env.FRONTEND_URL,
}));

app.get('/api/user', isAuthenticated, (req, res) => {
    res.json(req.user);
});

app.get('/api/reprimands', isAuthenticated, async (req, res) => {
    try {
        const { rows } = await pgPool.query('SELECT * FROM reprimands ORDER BY issued_at DESC');
        res.json(rows);
    } catch (error) {
        console.error("Ошибка при получении выговоров из БД:", error);
        res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
});

// --- НОВЫЙ РОУТ ДЛЯ СОЗДАНИЯ ВЫГОВОРА ---
app.post('/api/reprimands', checkPermission('reprimand.create'), async (req, res) => {
    const { recipient_id, reason, punishment_type, evidence } = req.body;
    const issuer_user = req.user;

    if (!recipient_id || !reason || !punishment_type) {
        return res.status(400).json({ message: 'Необходимо заполнить все обязательные поля.' });
    }

    try {
        const settingsResult = await pgPool.query('SELECT settings FROM system_settings WHERE id = 1');
        const settings = settingsResult.rows[0]?.settings || {};
        const guild = await bot.guilds.fetch(process.env.DISCORD_GUILD_ID);
        const recipient_member = await guild.members.fetch(recipient_id);
        const issuer_member = await guild.members.fetch(issuer_user.id);

        if (!recipient_member) return res.status(404).json({ message: `Пользователь с ID ${recipient_id} не найден на сервере.` });

        let deadlineDays = 0;
        let taskDescription = 'Не требуется.';
        if (punishment_type !== 'Увольнение' && settings.deadline_rules) {
            const memberRoleIds = recipient_member.roles.cache.map(r => r.id);
            for (const rule of settings.deadline_rules) {
                const typeMatch = !rule.punishment_type || rule.punishment_type === punishment_type;
                const rankMatch = !rule.rank_role_id || memberRoleIds.includes(rule.rank_role_id);
                const deptMatch = !rule.department_role_id || memberRoleIds.includes(rule.department_role_id);
                if (typeMatch && rankMatch && deptMatch) {
                    deadlineDays = rule.days;
                    taskDescription = rule.task;
                    break;
                }
            }
        }

        const expires_at_query = deadlineDays > 0 ? `NOW() + INTERVAL '${parseInt(deadlineDays)} day'` : null;
        const query = `
            INSERT INTO reprimands (issuer_id, issuer_name, recipient_id, recipient_name, reason, task, evidence, punishment_type, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${expires_at_query}) RETURNING *;
        `;
        const values = [issuer_user.id, issuer_member.displayName, recipient_id, recipient_member.displayName, reason.value, taskDescription, evidence, punishment_type];
        const { rows } = await pgPool.query(query, values);
        const newReprimand = rows[0];

        await logAction(issuer_user, 'REPRIMAND_CREATE', { reprimandId: newReprimand.id, recipientId: recipient_id, reason: reason.value });

        const channel = await guild.channels.fetch(process.env.DISCORD_REPRIMAND_CHANNEL_ID);
        const role = await guild.roles.fetch(process.env.DISCORD_REPRIMAND_ROLE_ID);
        await recipient_member.roles.add(role);

        const embed = new EmbedBuilder()
            .setTitle(`❗ ${punishment_type}`)
            .setColor(punishment_type === 'Увольнение' ? '#000000' : '#ff4d4d')
            .addFields(
                { name: 'Выдал', value: `<@${issuer_user.id}>`, inline: true },
                { name: 'Получил', value: `<@${recipient_id}>`, inline: true },
                { name: '\u200B', value: '\u200B' },
                { name: 'Нарушение', value: reason.label },
                { name: 'Задание на отработку', value: taskDescription },
                { name: 'Доказательства', value: evidence || 'Не указаны' }
            )
            .setTimestamp()
            .setFooter({ text: `ID выговора: ${newReprimand.id}` });

        if (deadlineDays > 0) embed.addFields({ name: 'Срок выполнения', value: `${deadlineDays} дн.` });

        await channel.send({ content: `Внимание, <@${recipient_id}>!`, embeds: [embed] });

        res.status(201).json(newReprimand);
    } catch (error) {
        console.error("Ошибка при создании выговора:", error);
        res.status(500).json({ message: "Внутренняя ошибка сервера: " + error.message });
    }
});

// --- НОВЫЙ РОУТ ДЛЯ ОБНОВЛЕНИЯ СТАТУСА ВЫГОВОРА ---
app.patch('/api/reprimands/:id/status', checkPermission('reprimand.update.status'), async (req, res) => {
    const { id } = req.params; // ID выговора из URL
    const { status } = req.body; // Новый статус из тела запроса

    if (!status) {
        return res.status(400).json({ message: 'Необходимо указать новый статус.' });
    }

    try {
        // 1. Обновляем запись в БД
        const { rows } = await pgPool.query(
            'UPDATE reprimands SET status = $1 WHERE id = $2 RETURNING *',
            [status, id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Выговор не найден.' });
        }
        const updatedReprimand = rows[0];

        await logAction(req.user, 'REPRIMAND_UPDATE_STATUS', { reprimandId: id, newStatus: status });

        // 2. Если статус "отработан" или "снят", пытаемся снять роль
        if (status === 'отработан' || status === 'снят') {
            try {
                const guild = await bot.guilds.fetch(process.env.DISCORD_GUILD_ID);
                const member = await guild.members.fetch(updatedReprimand.recipient_id);
                await member.roles.remove(process.env.DISCORD_REPRIMAND_ROLE_ID);
            } catch (botError) {
                console.error("ОШИБКА БОТА при снятии роли:", botError.message);
                // Не блокируем ответ, просто логируем ошибку
            }
        }

        res.json(updatedReprimand);
    } catch (error) {
        console.error('Ошибка при обновлении статуса:', error);
        res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
});

// --- НОВЫЙ РОУТ ДЛЯ УДАЛЕНИЯ ВЫГОВОРА ---
app.delete('/api/reprimands/:id', checkPermission('reprimand.delete'), async (req, res) => {
    const { id } = req.params;

    try {
         // Сначала получаем инфо о выговоре, чтобы знать, у кого снимать роль
        const { rows } = await pgPool.query('SELECT recipient_id FROM reprimands WHERE id = $1', [id]);
        if (rows.length === 0) {
             return res.status(404).json({ message: 'Выговор не найден.' });
        }
        const reprimandToDelete = rows[0];

        await logAction(req.user, 'REPRIMAND_DELETE', { reprimandId: id, recipientId: reprimandToDelete.recipient_id });

        // 1. Удаляем запись из БД
        await pgPool.query('DELETE FROM reprimands WHERE id = $1', [id]);

        // 2. Пытаемся снять роль
         try {
            const guild = await bot.guilds.fetch(process.env.DISCORD_GUILD_ID);
            const member = await guild.members.fetch(reprimandToDelete.recipient_id);
            await member.roles.remove(process.env.DISCORD_REPRIMAND_ROLE_ID);
        } catch (botError) {
            console.error("ОШИБКА БОТА при снятии роли:", botError.message);
        }

        res.status(204).send(); // 204 No Content - стандартный ответ для успешного DELETE
    } catch (error) {
        console.error('Ошибка при удалении выговора:', error);
        res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
});

app.post('/api/auth/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.status(200).json({ message: 'Выход выполнен' });
    });
});

// 1. Получить все роли с сервера и сохранить их в БД
app.get('/api/settings/roles', isAuthenticated, async (req, res) => {
    try {
        const guild = await bot.guilds.fetch(process.env.DISCORD_GUILD_ID);
        const roles = await guild.roles.fetch();

        const rolesData = roles
            .filter(role => !role.managed && role.name !== '@everyone') // Убираем роли ботов и @everyone
            .map(role => ({ id: role.id, name: role.name, guild_id: guild.id }));

        // Используем ON CONFLICT для обновления имен ролей, если они изменились
        const client = await pgPool.connect();
        try {
            await client.query('BEGIN');
            for (const role of rolesData) {
                await client.query(
                    `INSERT INTO discord_roles (id, name, guild_id) VALUES ($1, $2, $3)
                     ON CONFLICT (id) DO UPDATE SET name = $2`,
                    [role.id, role.name, role.guild_id]
                );
            }
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        res.json(rolesData);
    } catch (error) {
        console.error('Ошибка при получении ролей:', error);
        res.status(500).json({ message: 'Ошибка при получении ролей с Discord' });
    }
});

// 2. Получить текущие разрешения
app.get('/api/settings/permissions', isAuthenticated, async (req, res) => {
    try {
        const { rows } = await pgPool.query('SELECT * FROM permissions');
        // Преобразуем в удобный формат { 'roleId': ['perm1', 'perm2'], ... }
        const permissionsMap = rows.reduce((acc, row) => {
            if (!acc[row.role_id]) {
                acc[row.role_id] = [];
            }
            acc[row.role_id].push(row.permission_key);
            return acc;
        }, {});
        res.json(permissionsMap);
    } catch (error) {
        console.error('Ошибка при получении прав:', error);
        res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
});

// 3. Сохранить новые разрешения
app.post('/api/settings/permissions', checkPermission('settings.edit'), async (req, res) => {
    const newPermissions = req.body; // Ожидаем объект { 'roleId': ['perm1', 'perm2'], ... }

    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        // Полностью очищаем старые права
        await client.query('TRUNCATE TABLE permissions');
        // Вставляем новые
        for (const roleId in newPermissions) {
            for (const permKey of newPermissions[roleId]) {
                await client.query(
                    'INSERT INTO permissions (role_id, permission_key) VALUES ($1, $2)',
                    [roleId, permKey]
                );
            }
        }
        await client.query('COMMIT');
        await logAction(req.user, 'PERMISSIONS_UPDATE');
        res.status(200).json({ message: 'Права успешно обновлены!' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Ошибка при сохранении прав:', error);
        res.status(500).json({ message: 'Ошибка при сохранении прав' });
    } finally {
        client.release();
    }
});

// Получить устав
app.get('/api/charter', isAuthenticated, async (req, res) => {
    try {
        const { rows } = await pgPool.query('SELECT content FROM charter WHERE id = 1');
        // Если устава еще нет, возвращаем пустую строку
        res.json({ content: rows.length > 0 ? rows[0].content : '' });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка при получении устава' });
    }
});

// Сохранить/обновить устав
app.post('/api/charter', checkPermission('charter.edit'), async (req, res) => {
    const { content } = req.body;
    const user = req.user;

    try {
        // Используем ON CONFLICT, чтобы создать запись, если ее нет, или обновить, если есть
        const query = `
            INSERT INTO charter (id, content, last_updated_by_id, last_updated_by_name, updated_at)
            VALUES (1, $1, $2, $3, NOW())
            ON CONFLICT (id) DO UPDATE
            SET content = $1,
                last_updated_by_id = $2,
                last_updated_by_name = $3,
                updated_at = NOW()
            RETURNING *;
        `;
        const { rows } = await pgPool.query(query, [content, user.id, user.username]);

        await logAction(req.user, 'CHARTER_UPDATE');

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error("Ошибка сохранения устава:", error);
        res.status(500).json({ message: 'Ошибка при сохранении устава' });
    }
});

// --- API ДЛЯ ЛОГОВ ---
app.get('/api/logs', checkPermission('logs.view'), async (req, res) => {
    try {
        const { rows } = await pgPool.query(
            'SELECT * FROM action_logs ORDER BY created_at DESC LIMIT 100' // Ограничим выборку последними 100 записями
        );
        res.json(rows);
    } catch (error) {
        console.error("Ошибка при получении логов:", error);
        res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
});

// --- ОБНОВЛЕННЫЙ РОУТ ПОИСКА УЧАСТНИКОВ ---
app.get('/api/guild/members', isAuthenticated, async (req, res) => {
    const { q: searchQuery } = req.query;
    if (!searchQuery || searchQuery.length < 2) return res.json([]);
    try {
        const guild = await bot.guilds.fetch(process.env.DISCORD_GUILD_ID);
        const members = await guild.members.fetch({ query: searchQuery, limit: 100 });
        const lowerCaseQuery = searchQuery.toLowerCase();
        const filteredMembers = members
            .filter(m => m.displayName.toLowerCase().includes(lowerCaseQuery) || m.user.username.toLowerCase().includes(lowerCaseQuery))
            .first(10);
        const membersData = filteredMembers.map(m => ({
            id: m.id,
            name: m.user.username,
            displayName: m.displayName,
            avatarURL: m.displayAvatarURL({ size: 64 })
        }));
        res.json(membersData);
    } catch (error) {
        console.error("Ошибка при поиске участников:", error);
        res.status(500).json({ message: "Ошибка поиска участников на сервере" });
    }
});

// --- API ДЛЯ НАСТРОЕК ЛОГИКИ ---

// Получить текущие настройки логики
app.get('/api/settings/logic', isAuthenticated, async (req, res) => {
    try {
        const { rows } = await pgPool.query('SELECT settings FROM system_settings WHERE id = 1');
        res.json(rows[0].settings);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Ошибка получения настроек' });
    }
});

// Сохранить новые настройки логики
app.post('/api/settings/logic', checkPermission('settings.edit.logic'), async (req, res) => {
    const newSettings = req.body;
    try {
        await pgPool.query(
            'UPDATE system_settings SET settings = $1 WHERE id = 1',
            [newSettings]
        );
        await logAction(req.user, 'LOGIC_SETTINGS_UPDATE');
        res.status(200).json({ message: 'Настройки логики успешно сохранены!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Ошибка сохранения настроек' });
    }
});

// --- НОВЫЙ РОУТ ДЛЯ ПАРСИНГА УСТАВА ---
app.get('/api/charter/rules', isAuthenticated, async (req, res) => {
    try {
        const { rows } = await pgPool.query('SELECT content FROM charter WHERE id = 1');
        if (!rows.length || !rows[0].content) return res.json([]);
        const content = rows[0].content.replace(/<[^>]+>/g, '\n'); // Очистка от HTML тегов
        const ruleRegex = /^((\d{1,2}\.?)+)\s*(.*)$/gm;
        const rules = Array.from(content.matchAll(ruleRegex), m => ({ value: `${m[1]} ${m[3]}`, label: `${m[1]} ${m[3]}` }));
        res.json(rules);
    } catch (error) {
        console.error("Ошибка парсинга устава:", error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

app.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));
