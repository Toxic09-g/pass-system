import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

// Права сотрудников. Права администратора здесь выдать нельзя — администратор один,
// его вход задаётся в backend/.env
const PERMISSIONS = [
  { key: 'can_register', label: 'Регистрация', hint: 'дежурный: оформление пропусков' },
  { key: 'can_view_journal', label: 'Журнал', hint: 'просмотр журнала посещений' },
];

const emptyForm = { full_name: '', institution_name: '', can_register: true, can_view_journal: false };

function permissionLabels(user) {
  return (
    PERMISSIONS.filter((p) => user[p.key])
      .map((p) => p.label)
      .join(', ') || '—'
  );
}

// Логин и пароль показываются один раз — сразу после создания или сброса пароля
function CredentialsCard({ credentials, onClose }) {
  return (
    <div className="card space-y-4 p-7">
      <p className="text-touch-base font-semibold">
        {credentials.isNew ? 'Сотрудник добавлен' : 'Пароль изменён'}: {credentials.user.full_name}
      </p>
      <p className="text-graphite">{credentials.user.institution_name}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-field bg-paper px-5 py-4">
          <p className="eyebrow">Логин</p>
          <p className="mt-1 select-text font-mono text-touch-lg font-bold">{credentials.user.login}</p>
        </div>
        <div className="rounded-field bg-paper px-5 py-4">
          <p className="eyebrow">Пароль</p>
          <p className="mt-1 select-text font-mono text-touch-lg font-bold">{credentials.password}</p>
        </div>
      </div>
      <p className="text-sm text-graphite">
        Передайте эти данные сотруднику. Пароль больше не будет показан — если его забудут, нажмите «Новый
        пароль».
      </p>
      <button
        type="button"
        onClick={onClose}
        className="btn-primary h-12"
      >
        Готово
      </button>
    </div>
  );
}

export default function UsersAdminTab() {
  const [users, setUsers] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);
  const [credentials, setCredentials] = useState(null);

  useEffect(() => {
    load();
  }, []);

  function load() {
    api.users.list().then(setUsers);
    api.users.institutions().then(setInstitutions);
  }

  function startEdit(user) {
    setEditingId(user.id);
    setForm({
      full_name: user.full_name,
      institution_name: user.institution_name,
      can_register: Boolean(user.can_register),
      can_view_journal: Boolean(user.can_view_journal),
    });
    setError(null);
    setCredentials(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setCredentials(null);
    try {
      if (editingId) {
        await api.users.update(editingId, form);
      } else {
        const result = await api.users.create(form);
        setCredentials({ ...result, isNew: true });
      }
      cancelEdit();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function run(action) {
    setError(null);
    setCredentials(null);
    try {
      await action();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-touch-lg font-semibold">Пользователи</h2>

      {credentials && <CredentialsCard credentials={credentials} onClose={() => setCredentials(null)} />}

      <form onSubmit={handleSubmit} className="card space-y-4 p-6">
        {error && <div className="alert-error">{error}</div>}

        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            placeholder="ФИО сотрудника, например: Иванов Иван Иванович"
            className="field"
          />
          {/* Подсказки из уже введённых учреждений — чтобы одно учреждение не записали по-разному */}
          <input
            value={form.institution_name}
            onChange={(e) => setForm((f) => ({ ...f, institution_name: e.target.value }))}
            list="known-institutions"
            placeholder="Учреждение, например: РОВД Есильского района города Астаны"
            className="field"
          />
          <datalist id="known-institutions">
            {institutions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>

        <div className="flex flex-wrap gap-3">
          {PERMISSIONS.map(({ key, label, hint }) => (
            <label
              key={key}
              className={`flex cursor-pointer items-center gap-4 rounded-field border-[1.5px] px-5 py-4 transition ${
                form[key] ? 'border-accent bg-accent-soft' : 'border-mist bg-surface'
              }`}
            >
              <input
                type="checkbox"
                checked={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                className="h-5 w-5 accent-accent"
              />
              <span>
                <span className="block font-semibold">{label}</span>
                <span className="block text-sm text-graphite">{hint}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-primary h-16">
            {editingId ? 'Сохранить' : 'Добавить сотрудника'}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={cancelEdit}
              className="btn-ghost h-16"
            >
              Отмена
            </button>
          ) : (
            <span className="text-sm text-graphite">Логин и пароль будут созданы автоматически</span>
          )}
        </div>
      </form>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Учреждение</th>
              <th>Логин</th>
              <th>Доступ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-graphite">
                  Сотрудников пока нет
                </td>
              </tr>
            )}
            {users.map((user) => (
              <tr key={user.id} className={user.is_active ? '' : 'text-mist'}>
                <td>{user.full_name}</td>
                <td>{user.institution_name || '—'}</td>
                <td className="font-mono">{user.login}</td>
                <td>{user.is_active ? permissionLabels(user) : 'Отключён'}</td>
                <td className="space-x-5 whitespace-nowrap text-right">
                  {user.is_active === 1 ? (
                    <>
                      <button type="button" onClick={() => startEdit(user)} className="link">
                        Изменить
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          run(async () => {
                            const result = await api.users.resetPassword(user.id);
                            setCredentials({ ...result, isNew: false });
                          })
                        }
                        className="link"
                      >
                        Новый пароль
                      </button>
                      <button
                        type="button"
                        onClick={() => run(() => api.users.update(user.id, { is_active: false }))}
                        className="link-danger"
                      >
                        Отключить
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => run(() => api.users.update(user.id, { is_active: true }))}
                      className="link"
                    >
                      Включить
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
