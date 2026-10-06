import { useEffect, useState } from 'react';

export default function DictionaryManager({ title, api, placeholder }) {
  const [items, setItems] = useState([]);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function load() {
    api.list().then(setItems);
  }

  function startEdit(item) {
    setEditingId(item.id);
    setName(item.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setName('');
    setError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      if (editingId) {
        await api.update(editingId, { name });
      } else {
        await api.create({ name });
      }
      cancelEdit();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeactivate(item) {
    await api.remove(item.id);
    load();
  }

  return (
    <div className="space-y-6">
      <h2 className="text-touch-lg font-semibold">{title}</h2>

      <form onSubmit={handleSubmit} className="card flex flex-wrap gap-3 p-6">
        {error && (
          <div className="alert-error w-full">{error}</div>
        )}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
          className="field min-w-[240px] flex-1"
        />
        <button type="submit" className="btn-primary h-16">
          {editingId ? 'Сохранить' : 'Добавить'}
        </button>
        {editingId && (
          <button
            type="button"
            onClick={cancelEdit}
            className="btn-ghost h-16"
          >
            Отмена
          </button>
        )}
      </form>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>
                  {item.is_active ? (
                    <span className="pill-live">Активно</span>
                  ) : (
                    <span className="pill-muted">Неактивно</span>
                  )}
                </td>
                <td className="whitespace-nowrap text-right">
                  <button type="button" onClick={() => startEdit(item)} className="link mr-5">
                    Изменить
                  </button>
                  {item.is_active === 1 && (
                    <button type="button" onClick={() => handleDeactivate(item)} className="link-danger">
                      Деактивировать
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
