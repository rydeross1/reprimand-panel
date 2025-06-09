import 'dotenv/config';
import pg from 'pg';

const pgPool = new pg.Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

const createTablesQuery =`
DROP TABLE IF EXISTS reprimands;

CREATE TABLE reprimands (
    id BIGSERIAL PRIMARY KEY,
    issuer_id VARCHAR(255) NOT NULL,
    issuer_name VARCHAR(255) NOT NULL, -- Серверный никнейм того, кто выдал
    recipient_id VARCHAR(255) NOT NULL,
    recipient_name VARCHAR(255) NOT NULL, -- Серверный никнейм того, кто получил
    reason VARCHAR(255) NOT NULL,       -- Здесь будет только пункт устава
    task TEXT,                           -- Новое поле для задания на отработку
    evidence TEXT,                       -- Новое поле для доказательств
    punishment_type VARCHAR(100) NOT NULL, -- Новое поле для типа наказания
    status VARCHAR(50) NOT NULL DEFAULT 'активен',
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);
`;

async function setup() {
    console.log('Начинаю настройку базы данных...');
    const client = await pgPool.connect();
    try {
        console.log('✅ Успешно подключился к базе данных.');

        await client.query(createTablesQuery);
        console.log('✅ База данных успешно настроена!');
        console.log('✅ Таблицы созданы и тестовые данные добавлены.');

    } catch (error) {
        console.error('❌ Произошла ошибка во время настройки базы данных:', error);
        console.error(error.message); // Выведем только сообщение об ошибке для краткости
    } finally {
        client.release();
        console.log('Настройка завершена. Отключаюсь от БД.');
        await pgPool.end();
    }
}

setup();
