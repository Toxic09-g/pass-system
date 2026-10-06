import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

const emptyForm = { full_name: '', department_id: '', position_id: '' };

export default function EmployeesAdminTab() {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    load();
    api.departments.list().then(setDepartments);
    api.positions.list().then(setPositions);
  }, []);

  function load() {
    api.employees.list().then(setEmployees);
  }

  function startEdit(employee) {
    setEditingId(employee.id);
    setForm({
      full_name: employee.full_name,
      department_id: String(employee.department_id),
      position_id: String(employee.position_id),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!form.full_name.trim() || !form.department_id || !form.position_id) {
      setError('Заполните ФИО, управление и должность');
      return;
    }

    try {
      const payload = {
        full_name: form.full_name,
        department_id: Number(form.department_id),
        position_id: Number(form.position_id),
      };
      if (editingId) {
        await api.employees.update(editingId, payload);
      } else {
        await api.employees.create(payload);
      }
      cancelEdit();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeactivate(employee) {
    await api.employees.remove(employee.id);
    load();
  }

  return (
    <div className="space-y-6">
      <h2 className="text-touch-lg font-semibold">Сотрудники</h2>

      <form onSubmit={handleSubmit} className="card grid gap-4 p-6 sm:grid-cols-3">
        {error && (
          <div className="alert-error sm:col-span-3">
            {error}
          </div>
        )}
        <input
          type="text"
          placeholder="ФИО"
          value={form.full_name}
          onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
          className="field"
        />
        <select
          value={form.department_id}
          onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}
          className="field"
        >
          <option value="">Управление/департамент</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
        <select
          value={form.position_id}
          onChange={(e) => setForm((f) => ({ ...f, position_id: e.target.value }))}
          className="field"
        >
          <option value="">Должность</option>
          {positions.map((position) => (
            <option key={position.id} value={position.id}>
              {position.name}
            </option>
          ))}
        </select>
        <div className="flex gap-3 sm:col-span-3">
          <button type="submit" className="btn-primary h-16">
            {editingId ? 'Сохранить изменения' : 'Добавить сотрудника'}
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
        </div>
      </form>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Должность</th>
              <th>Управление</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.id}>
                <td>{employee.full_name}</td>
                <td>{employee.position_name}</td>
                <td>{employee.department_name}</td>
                <td>
                  {employee.is_active ? (
                    <span className="pill-live">Активен</span>
                  ) : (
                    <span className="pill-muted">Неактивен</span>
                  )}
                </td>
                <td className="whitespace-nowrap text-right">
                  <button type="button" onClick={() => startEdit(employee)} className="link mr-5">
                    Изменить
                  </button>
                  {employee.is_active === 1 && (
                    <button type="button" onClick={() => handleDeactivate(employee)} className="link-danger">
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
