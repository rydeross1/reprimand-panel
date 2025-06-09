import React, { useState, useEffect } from 'react';
import { useAuth } from './App'; // Импортируем наш хук для проверки прав
import AddReprimandModal from './AddReprimandModal';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faTrash } from '@fortawesome/free-solid-svg-icons';

const API_URL = 'http://localhost:5001';

// Компонент таблицы с проверкой прав на кнопки
const ReprimandTable = ({ reprimands, onUpdateStatus, onDelete }) => {
    const { hasPermission } = useAuth();

    if (reprimands.length === 0) {
        return <p>Выговоров не найдено.</p>;
    }

    const showActionsColumn = hasPermission('reprimand.update.status') || hasPermission('reprimand.delete');

    return (
        <table className="reprimand-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Кто выдал</th>
                    <th>Кто получил</th>
                    <th>Тип</th>
                    <th>Причина</th>
                    <th>Задание</th>
                    <th>Статус</th>
                    <th>Дата выдачи</th>
                    <th>Срок отработки</th>
                    {showActionsColumn && <th>Действия</th>}
                </tr>
            </thead>
            <tbody>
                {reprimands.map(rep => (
                    <tr key={rep.id}>
                        <td>{rep.id}</td>
                        <td>{rep.issuer_name}</td>
                        <td>{rep.recipient_name}</td>
                        <td>{rep.punishment_type}</td>
                        <td>{rep.reason}</td>
                        <td>{rep.task}</td>
                        <td><span className={`status status-${rep.status}`}>{rep.status}</span></td>
                        <td>{new Date(rep.issued_at).toLocaleString()}</td>
                        <td>{rep.expires_at ? new Date(rep.expires_at).toLocaleString() : '—'}</td>
                        {showActionsColumn &&
                            <td>
                                <div className="action-buttons">
                                    {hasPermission('reprimand.update.status') &&
                                        <button className="action-button button-accept" title="Принять отработку" onClick={() => onUpdateStatus(rep.id, 'отработан')}>
                                            <FontAwesomeIcon icon={faCheck} />
                                        </button>
                                    }
                                    {hasPermission('reprimand.delete') &&
                                        <button className="action-button button-delete" title="Удалить выговор" onClick={() => onDelete(rep.id)}>
                                            <FontAwesomeIcon icon={faTrash} />
                                        </button>
                                    }
                                </div>
                            </td>
                        }
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

function HomePage() {
    const [reprimands, setReprimands] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const { hasPermission } = useAuth();

    useEffect(() => {
        const fetchReprimands = async () => {
            try {
                const response = await fetch(`${API_URL}/api/reprimands`, { credentials: 'include' });
                if (response.ok) {
                    setReprimands(await response.json());
                }
            } catch (error) {
                console.error("Ошибка загрузки выговоров:", error);
            }
        };
        fetchReprimands();
    }, []);

    const handleAddReprimand = async (newReprimandData) => {
        try {
            const response = await fetch(`${API_URL}/api/reprimands`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(newReprimandData),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Ошибка при добавлении выговора');
            }
            const addedReprimand = await response.json();
            setReprimands([addedReprimand, ...reprimands]);
            setIsModalOpen(false);
        } catch (error) {
            console.error(error);
            alert(error.message);
        }
    };

    const handleUpdateStatus = async (id, newStatus) => {
        try {
            const response = await fetch(`${API_URL}/api/reprimands/${id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ status: newStatus }),
            });
            if (!response.ok) {
                 const errorData = await response.json();
                throw new Error(errorData.message || 'Ошибка при обновлении статуса');
            }
            const updatedReprimand = await response.json();
            setReprimands(reprimands.map(r => r.id === id ? updatedReprimand : r));
        } catch (error) {
            console.error(error);
            alert(error.message);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm(`Вы уверены, что хотите удалить выговор #${id}? Это действие необратимо.`)) return;
        try {
            const response = await fetch(`${API_URL}/api/reprimands/${id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            if (!response.ok) {
                 const errorData = await response.json();
                throw new Error(errorData.message || 'Ошибка при удалении');
            }
            setReprimands(reprimands.filter(r => r.id !== id));
        } catch (error) {
            console.error(error);
            alert(error.message);
        }
    };

    return (
        <>
            <div className="toolbar">
                <h2>Список выговоров</h2>
                {hasPermission('reprimand.create') && (
                    <button className="button-primary" onClick={() => setIsModalOpen(true)}>
                        Выдать выговор
                    </button>
                )}
            </div>
            <ReprimandTable reprimands={reprimands} onUpdateStatus={handleUpdateStatus} onDelete={handleDelete} />
            {isModalOpen && <AddReprimandModal onClose={() => setIsModalOpen(false)} onAdd={handleAddReprimand} />}
        </>
    );
}

export default HomePage;
