import 'dotenv/config';
import pg from 'pg';
import { Client, GatewayIntentBits } from 'discord.js';

// --- НАСТРОЙТЕ ЭТУ ПЕРЕМЕННУЮ ---
const ADMIN_ROLE_ID = '1374790252903796847';
// ------------------------------------

const ADMIN_PERMISSIONS = [
    'settings.view',
    'settings.edit',
    'reprimand.create',
    'reprimand.update.status',
    'reprimand.delete'
];

if (ADMIN_ROLE_ID.startsWith('СЮДА')) {
    console.error('❌ ОШИБКА: Пожалуйста, откройте файл grantAdmin.js и вставьте реальный ID вашей роли в переменную ADMIN_ROLE_ID.');
    process.exit(1);
}

const pgPool = new pg.Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

const bot = new Client({
    intents: [GatewayIntentBits.Guilds],
});

async function run() {
    console.log('Подключаемся к Discord...');
    await bot.login(process.env.DISCORD_BOT_TOKEN);
    console.log('✅ Бот в сети.');

    const dbClient = await pgPool.connect();
    console.log('✅ Подключились к базе данных.');

    try {
        // --- ШАГ 1: Синхронизация ролей ---
        console.log('Запрашиваем роли с сервера Discord...');
        const guild = await bot.guilds.fetch(process.env.DISCORD_GUILD_ID);
        const roles = await guild.roles.fetch();
        const rolesData = roles
            .filter(role => !role.managed && role.name !== '@everyone')
            .map(role => ({ id: role.id, name: role.name, guild_id: guild.id }));

        console.log(`Найдено ${rolesData.length} ролей. Синхронизируем с БД...`);

        await dbClient.query('BEGIN');
        for (const role of rolesData) {
            await dbClient.query(
                `INSERT INTO discord_roles (id, name, guild_id) VALUES ($1, $2, $3)
                 ON CONFLICT (id) DO UPDATE SET name = $2`,
                [role.id, role.name, role.guild_id]
            );
        }
        await dbClient.query('COMMIT');
        console.log('✅ Роли успешно синхронизированы.');

        // --- ШАГ 2: Выдача прав ---
        console.log(`Выдаем права администратора для роли ID: ${ADMIN_ROLE_ID}`);
        await dbClient.query('BEGIN');
        for (const perm of ADMIN_PERMISSIONS) {
            await dbClient.query(
                'INSERT INTO permissions (role_id, permission_key) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [ADMIN_ROLE_ID, perm]
            );
        }
        await dbClient.query('COMMIT');
        console.log('✅ Права успешно выданы!');
        console.log('Теперь выйдите и снова войдите в панель, чтобы увидеть изменения.');

    } catch (error) {
        await dbClient.query('ROLLBACK');
        console.error('❌ Произошла фатальная ошибка:', error);
    } finally {
        dbClient.release();
        await pgPool.end();
        await bot.destroy();
        console.log('Отключились от БД и Discord.');
    }
}

run();
