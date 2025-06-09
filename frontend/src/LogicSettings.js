import React, { useState, useEffect } from 'react';
import { useAuth } from './App';

const API_URL = 'http://localhost:5001';

function LogicSettings() {
    const [settings, setSettings] = useState(null);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const { hasPermission } = useAuth();

    // Типы наказаний, для которых можно настроить отработку
    const PUNISHMENT_TYPES = [ 'Предупреждение', 'Первичный выговор', 'Вторичный выговор' ];

    // Загрузка настроек и ролей
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [settingsRes, rolesRes] = await Promise.all([
                    fetch(`${API_URL}/api/settings/logic`, { credentials: 'include' }),
                    fetch(`${API_URL}/api/settings/roles`, { credentials: 'include' }),
                ]);
                const settingsData = await settingsRes.json();
                // Убедимся, что deadline_rules всегда является массивом
                if (!settingsData.deadline_rules) {
                    settingsData.deadline_rules = [];
                }
                setSettings(settingsData);
                setRoles(await rolesRes.json());
            } catch (error) {
                console.error("Ошибка загрузки данных для настроек логики:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleSave = async () => {
        try {
            await fetch(`${API_URL}/api/settings/logic`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(settings),
            });
            alert('Настройки логики сохранены!');
        } catch (error) {
            alert('Ошибка сохранения настроек логики.');
        }
    };

    // Функции для управления правилами
    const addRule = () => {
        const newRule = { punishment_type: '', rank_role_id: '', department_role_id: '', days: 3, task: '' };
        setSettings(prev => ({...prev, deadline_rules: [...prev.deadline_rules, newRule]}));
    };

    const updateRule = (index, field, value) => {
        const newRules = [...settings.deadline_rules];
        const updatedValue = field === 'days' ? parseInt(value) || 0 : value;
        newRules[index][field] = updatedValue;
        setSettings(prev => ({...prev, deadline_rules: newRules}));
    };

    const deleteRule = (index) => {
        const newRules = settings.deadline_rules.filter((_, i) => i !== index);
        setSettings(prev => ({...prev, deadline_rules: newRules}));
    };

    // Рендерим компонент только после загрузки данных и при наличии прав
    if (loading || !hasPermission('settings.edit.logic')) return null;

    return (
        <div className="logic-settings-section">
            <hr/>
            <h2>Настройка логики выговоров</h2>

            {/* В будущем здесь можно добавить настройку арифметики */}

            <h3>Правила сроков и отработок</h3>
            <p>Система применит первое сверху вниз правило, которое подойдет под все условия (тип, ранг, отдел).</p>

            {/* Используем стили от таблицы прав для единого вида */}
            <div className="permissions-table-wrapper">
                <table className="permissions-table">
                    <thead>
                        <tr>
                            <th>Тип наказания</th>
                            <th>Ранг</th>
                            <th>Отдел</th>
                            <th>Срок (дней)</th>
                            <th>Задание на отработку</th>
                            <th>Действие</th>
                        </tr>
                    </thead>
                    <tbody>
                        {settings.deadline_rules.map((rule, index) => (
                            <tr key={index}>
                                <td>
                                    <select value={rule.punishment_type || ''} onChange={e => updateRule(index, 'punishment_type', e.target.value)}>
                                        <option value="">Любой</option>
                                        {PUNISHMENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                                    </select>
                                </td>
                                <td>
                                    <select value={rule.rank_role_id || ''} onChange={e => updateRule(index, 'rank_role_id', e.target.value)}>
                                        <option value="">Любой</option>
                                        {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                    </select>
                                </td>
                                <td>
                                    <select value={rule.department_role_id || ''} onChange={e => updateRule(index, 'department_role_id', e.target.value)}>
                                        <option value="">Любой</option>
                                        {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                    </select>
                                </td>
                                <td>
                                    <input
                                        type="number"
                                        value={rule.days}
                                        onChange={e => updateRule(index, 'days', e.target.value)}
                                        placeholder="Дней"
                                        style={{ width: '80px' }}
                                    />
                                </td>
                                <td>
                                    <input
                                        type="text"
                                        value={rule.task}
                                        onChange={e => updateRule(index, 'task', e.target.value)}
                                        placeholder="Описание отработки"
                                        style={{ minWidth: '250px' }}
                                    />
                                </td>
                                <td>
                                    <button onClick={() => deleteRule(index)} className="button-delete-rule" title="Удалить правило">Х</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="logic-actions">
                <button onClick={addRule} className="button-secondary">Добавить правило</button>
                <button onClick={handleSave} className="button-primary save-button">Сохранить логику</button>
            </div>
        </div>
    );
}

export default LogicSettings;
