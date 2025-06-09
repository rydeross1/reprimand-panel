import React, { useState, useEffect } from 'react';
import ReactQuill from 'react-quill'; // Импортируем редактор
import 'react-quill/dist/quill.snow.css'; // Импортируем стили для редактора
import { useAuth } from './App';
import './CharterPage.css';

const API_URL = 'http://localhost:5001';

function CharterPage() {
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { hasPermission } = useAuth();
    const canEdit = hasPermission('charter.edit');

    useEffect(() => {
        const fetchCharter = async () => {
            try {
                const response = await fetch(`${API_URL}/api/charter`, { credentials: 'include' });
                const data = await response.json();
                setContent(data.content);
            } catch (error) {
                console.error("Ошибка загрузки устава:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchCharter();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            const response = await fetch(`${API_URL}/api/charter`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ content }),
            });
            if (!response.ok) throw new Error("Ошибка сохранения");
            alert("Устав успешно сохранен!");
        } catch (error) {
            console.error("Ошибка сохранения устава:", error);
            alert("Не удалось сохранить устав.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <h2>Загрузка устава...</h2>;

    return (
        <div className="charter-container">
            <div className="toolbar">
                <h1>Устав</h1>
                {canEdit && (
                    <button onClick={handleSave} disabled={saving} className="button-primary">
                        {saving ? 'Сохранение...' : 'Сохранить'}
                    </button>
                )}
            </div>
            <div className="editor-wrapper">
                <ReactQuill
                    theme="snow"
                    value={content}
                    onChange={setContent}
                    readOnly={!canEdit} // Редактор в режиме "только для чтения", если нет прав
                    modules={canEdit ? quillModules : { toolbar: false }} // Скрываем панель инструментов, если нет прав
                />
            </div>
        </div>
    );
}

// Настройки панели инструментов для редактора
const quillModules = {
    toolbar: [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{'list': 'ordered'}, {'list': 'bullet'}],
        ['link'],
        ['clean']
    ],
};

export default CharterPage;
