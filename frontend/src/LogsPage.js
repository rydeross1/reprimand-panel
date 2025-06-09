import React, { useState, useEffect } from 'react';
import './LogsPage.css';

const API_URL = 'http://localhost:5001';

// Функция для красивого отображения логов
const formatLogDetails = (log) => {
    switch (log.action_type) {
        case 'REPRIMAND_CREATE':
            return `Выдал выговор #${log.details.reprimandId} пользователю с ID ${log.details.recipientId} по причине: "${log.details.reason}"`;
        case 'REPRIMAND_UPDATE_STATUS':
            return `Изменил статус выговора #${log.details.reprimandId} на "${log.details.newStatus}"`;
        case 'REPRIMAND_DELETE':
            return `Удалил выговор #${log.details.reprimandId} (получатель: ${log.details.recipientId})`;
        case 'PERMISSIONS_UPDATE':
            return 'Обновил права доступа ролей';
        case 'CHARTER_UPDATE':
            return 'Обновил устав';
        default:
            return JSON.stringify(log.details);
    }
};

function LogsPage() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const response = await fetch(`${API_URL}/api/logs`, { credentials: 'include' });
                if (response.ok) {
                    setLogs(await response.json());
                }
            } catch (error) {
                console.error("Ошибка загрузки логов:", error);
                alert("Не удалось загрузить логи.");
            } finally {
                setLoading(false);
            }
        };
        fetchLogs();
    }, []);

    if (loading) return <h2>Загрузка логов...</h2>;

    return (
        <div className="logs-container">
            <h1>Логи Действий</h1>
            <table className="logs-table">
                <thead>
                    <tr>
                        <th>Дата и время</th>
                        <th>Пользователь</th>
                        <th>Действие</th>
                    </tr>
                </thead>
                <tbody>
                    {logs.map(log => (
                        <tr key={log.id}>
                            <td>{new Date(log.created_at).toLocaleString()}</td>
                            <td>{log.user_name} ({log.user_id})</td>
                            <td>{formatLogDetails(log)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default LogsPage;
