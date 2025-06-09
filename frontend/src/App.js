import React, { useState, useEffect, createContext, useContext } from 'react';
import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import './App.css';


// Импортируем наши страницы и компоненты
import HomePage from './HomePage';
import SettingsPage from './SettingsPage';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import CharterPage from './CharterPage';
import LogsPage from './LogsPage';
import { faCog, faBook, faHistory } from '@fortawesome/free-solid-svg-icons'; // Добавили faHistory

const API_URL = 'http://localhost:5001';

// Создаем контекст для хранения прав доступа
export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function App() {
    const [user, setUser] = useState(null);
    const [userRoles, setUserRoles] = useState([]);
    const [permissions, setPermissions] = useState({});
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    // Загружаем данные о пользователе и его правах
    useEffect(() => {
        const fetchInitialData = async () => {
            setLoading(true);
            try {
                // Запрос на получение данных пользователя
                const userResponse = await fetch(`${API_URL}/api/user`, { credentials: 'include' });

                if (userResponse.ok) {
                    const data = await userResponse.json();
                    setUser(data);

                    const guildData = data.guilds.find(g => g.id === process.env.REACT_APP_DISCORD_GUILD_ID);
                    if (guildData && guildData.roles) {
                        setUserRoles(guildData.roles);
                    }

                    // Загружаем разрешения только если пользователь авторизован
                    const permsResponse = await fetch(`${API_URL}/api/settings/permissions`, { credentials: 'include' });
                    if (permsResponse.ok) {
                        setPermissions(await permsResponse.json());
                    }

                } else {
                    setUser(null);
                }
            } catch (error) {
                console.error("Ошибка при получении данных:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchInitialData();
    }, []);

    const handleLogin = () => { window.location.href = `${API_URL}/api/auth/discord`; };
    const handleLogout = async () => {
        await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
        setUser(null);
        setUserRoles([]);
        setPermissions({});
        navigate('/'); // Перекидываем на главную после выхода
    };

    // Главная функция проверки прав
    const hasPermission = (permKey) => {
        if (!userRoles || userRoles.length === 0) return false;
        // Проверяем, есть ли хотя бы у одной роли пользователя нужное право
        return userRoles.some(roleId => permissions[roleId]?.includes(permKey));
    };

    // --- ОТЛАДОЧНЫЙ БЛОК ---
    console.log("--- DEBUG INFO ---");
    console.log("1. User Object (должен быть не null):", user);
    console.log("2. User Roles on Server (должен быть массив с ID):", userRoles);
    console.log("3. All Permissions Loaded (должен быть объект с правами):", permissions);
    console.log("4. РЕЗУЛЬТАТ ПРОВЕРКИ 'settings.view':", hasPermission('settings.view'));
    console.log("--------------------");
    // -------------------------

    if (loading) return <div className="App-container"><h1>Загрузка...</h1></div>;

    return (
        <AuthContext.Provider value={{ user, hasPermission }}>
            <div className="App">
                <header className="App-header">
                    <Link to="/" className="logo-link"><h1>Панель Выговоров</h1></Link>
                    {user ? (
                        <div className="user-info">
                            {hasPermission('logs.view') && (
                                <Link to="/logs" className="settings-link" title="Логи">
                                    <FontAwesomeIcon icon={faHistory} />
                                </Link>
                            )}
                            {hasPermission('charter.view') && (
                                <Link to="/charter" className="settings-link" title="Устав">
                                    <FontAwesomeIcon icon={faBook} />
                                </Link>
                            )}
                            {hasPermission('settings.view') && (
                                <Link to="/settings" className="settings-link" title="Настройки">
                                    <FontAwesomeIcon icon={faCog} />
                                </Link>
                            )}
                            <span>Добро пожаловать, **{user.username}**!</span>
                            <img src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`} alt="avatar" />
                            <button onClick={handleLogout} className="logout-button">Выйти</button>
                        </div>
                    ) : (
                        <button onClick={handleLogin}>Войти через Discord</button>
                    )}
                </header>
                <main className="App-container">
                    <Routes>
                        <Route path="/" element={user ? <HomePage /> : <h2>Пожалуйста, войдите, чтобы использовать панель.</h2>} />
                        {hasPermission('settings.view') && <Route path="/settings" element={<SettingsPage />} />}
                        {hasPermission('charter.view') && <Route path="/charter" element={<CharterPage />} />}
                        {hasPermission('logs.view') && <Route path="/logs" element={<LogsPage />} />}
                        <Route path="*" element={<h2>404: Страница не найдена</h2>} />
                    </Routes>
                </main>
            </div>
        </AuthContext.Provider>
    );
}

export default App;
