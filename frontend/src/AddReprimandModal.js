import React, { useState } from 'react';
import Select from 'react-select'; // Обычный Select для типа
import AsyncSelect from 'react-select/async'; // Для пользователей и устава

const API_URL = 'http://localhost:5001';

// Стили для нашего селекта, чтобы он вписывался в темную тему
const selectStyles = {
    control: (provided) => ({
        ...provided,
        backgroundColor: '#202225',
        borderColor: '#1a1b1e',
        color: 'white',
    }),
    menu: (provided) => ({
        ...provided,
        backgroundColor: '#2f3136',
    }),
    option: (provided, state) => ({
        ...provided,
        backgroundColor: state.isFocused ? '#3a3d44' : '#2f3136',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
    }),
    singleValue: (provided) => ({
        ...provided,
        color: 'white',
        display: 'flex',
        alignItems: 'center',
    }),
    input: (provided) => ({
        ...provided,
        color: 'white',
    }),
};

const PUNISHMENT_TYPES = [
    { value: 'Предупреждение', label: 'Предупреждение' },
    { value: 'Первичный выговор', label: 'Первичный выговор' },
    { value: 'Вторичный выговор', label: 'Вторичный выговор' },
    { value: 'Увольнение', label: 'Увольнение' },
];

// Компонент для красивого отображения опции с аватаром
const formatOptionLabel = ({ displayName, name, avatarURL }) => (
    <div style={{ display: 'flex', alignItems: 'center' }}>
        <img src={avatarURL} alt="avatar" style={{ width: 24, height: 24, borderRadius: '50%', marginRight: 10 }} />
        <span>{displayName} ({name})</span>
    </div>
);


function AddReprimandModal({ onClose, onAdd }) {
    const [selectedUser, setSelectedUser] = useState(null);
    const [punishmentType, setPunishmentType] = useState(null);
    const [charterRule, setCharterRule] = useState(null);
    const [evidence, setEvidence] = useState('');

    const loadUsers = async (q) => { /* ... код без изменений ... */ };
    const loadCharterRules = async (q) => {
        try {
            const res = await fetch(`${API_URL}/api/charter/rules`, { credentials: 'include' });
            let rules = await res.json();
            if (q) {
                rules = rules.filter(r => r.label.toLowerCase().includes(q.toLowerCase()));
            }
            return rules;
        } catch (e) { return []; }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!selectedUser || !punishmentType || !charterRule) {
            alert('Заполните все обязательные поля!');
            return;
        }
        onAdd({
            recipient_id: selectedUser.id,
            punishment_type: punishmentType.value,
            reason: charterRule,
            evidence: evidence,
        });
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h2>Выдача нового выговора</h2>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Пользователь:</label>
                        <AsyncSelect onChange={setSelectedUser} value={selectedUser} loadOptions={loadUsers} /* ... props ... */ />
                    </div>
                    <div className="form-group">
                        <label>Тип наказания:</label>
                        <Select options={PUNISHMENT_TYPES} onChange={setPunishmentType} value={punishmentType} styles={selectStyles} placeholder="Выберите тип..."/>
                    </div>
                    <div className="form-group">
                        <label>Пункт устава:</label>
                        <AsyncSelect onChange={setCharterRule} value={charterRule} loadOptions={loadCharterRules} defaultOptions cacheOptions placeholder="Найдите пункт устава..." styles={selectStyles}/>
                    </div>
                    <div className="form-group">
                        <label>Доказательства (ссылка или текст):</label>
                        <textarea value={evidence} onChange={e => setEvidence(e.target.value)} rows="3" />
                    </div>
                    <div className="modal-actions">
                        <button type="button" onClick={onClose} className="button-cancel">Отмена</button>
                        <button type="submit" className="button-primary">Выдать</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
export default AddReprimandModal;
