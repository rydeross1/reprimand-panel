import React, { useState, useEffect } from 'react';
import './SettingsPage.css';
import LogicSettings from './LogicSettings';

const API_URL = 'http://localhost:5001';

const ALL_PERMISSIONS = [
    { key: 'reprimand.create', label: 'Выдавать выговоры' },
    { key: 'reprimand.update.status', label: 'Менять статус' },
    { key: 'reprimand.delete', label: 'Удалять выговоры' },
    { key: 'settings.view', label: 'Просматривать настройки' },
    { key: 'settings.edit', label: 'Редактировать права' },
    { key: 'charter.view', label: 'Просматривать устав' },
    { key: 'charter.edit', label: 'Редактировать устав' },
    { key: 'logs.view', label: 'Просматривать логи действий' },
    { key: 'settings.edit.logic', label: 'Редактировать логику выговоров' },
];

function SettingsPage() {
    const [roles, setRoles] = useState([]);
    const [permissions, setPermissions] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [rolesRes, permsRes] = await Promise.all([
                    fetch(`${API_URL}/api/settings/roles`, { credentials: 'include' }),
                    fetch(`${API_URL}/api/settings/permissions`, { credentials: 'include' }),
                ]);
                if (!rolesRes.ok || !permsRes.ok) throw new Error("Ошибка загрузки данных");

                const rolesData = await rolesRes.json();
                const permsData = await permsRes.json();
                setRoles(rolesData.sort((a,b) => a.name.localeCompare(b.name)));
                setPermissions(permsData);
            } catch (error) {
                console.error("Ошибка загрузки данных для настроек:", error);
                alert("Не удалось загрузить данные для настроек.");
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleCheckboxChange = (roleId, permKey) => {
        setPermissions(prev => {
            const currentPerms = prev[roleId] || [];
            const newPerms = currentPerms.includes(permKey)
                ? currentPerms.filter(p => p !== permKey)
                : [...currentPerms, permKey];
            return { ...prev, [roleId]: newPerms };
        });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const response = await fetch(`${API_URL}/api/settings/permissions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(permissions),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Ошибка сохранения');
            }
            alert('Права успешно сохранены!');
        } catch (error) {
            console.error("Ошибка сохранения прав:", error);
            alert(error.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <h2>Загрузка ролей и прав...</h2>;

    return (
      <>
        <div className="settings-container">
            <h1>Управление правами доступа</h1>
            <p>Отметьте, какие действия может выполнять каждая роль. Изменения вступят в силу после повторного входа пользователя в панель.</p>
            <div className="permissions-table-wrapper">
                <table className="permissions-table">
                    <thead>
                        <tr>
                            <th>Роль Discord</th>
                            {ALL_PERMISSIONS.map(p => <th key={p.key}>{p.label}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {roles.map(role => (
                            <tr key={role.id}>
                                <td>{role.name}</td>
                                {ALL_PERMISSIONS.map(p => (
                                    <td key={p.key}>
                                        <input
                                            type="checkbox"
                                            checked={permissions[role.id]?.includes(p.key) || false}
                                            onChange={() => handleCheckboxChange(role.id, p.key)}
                                        />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <button onClick={handleSave} disabled={saving} className="button-primary save-button">
                {saving ? 'Сохранение...' : 'Сохранить изменения'}
            </button>
            <LogicSettings />
        </div>
      </>
    );
}

export default SettingsPage;
