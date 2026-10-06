import { useState } from 'react';
import EmployeesAdminTab from '../components/EmployeesAdminTab.jsx';
import DictionaryManager from '../components/DictionaryManager.jsx';
import UsersAdminTab from '../components/UsersAdminTab.jsx';
import { api } from '../api/client.js';

const TABS = [
  { id: 'employees', label: 'Сотрудники' },
  { id: 'departments', label: 'Управления' },
  { id: 'positions', label: 'Должности' },
  { id: 'governmentBodies', label: 'Гос. органы' },
  { id: 'users', label: 'Пользователи' },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('employees');

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 p-8">
      <h1 className="text-touch-xl font-semibold">Справочники</h1>

      <div className="segmented">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`segment ${activeTab === tab.id ? 'segment-active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'employees' && <EmployeesAdminTab />}
      {activeTab === 'departments' && (
        <DictionaryManager
          title="Управления/департаменты"
          api={api.departments}
          placeholder="Например: Следственный департамент"
        />
      )}
      {activeTab === 'positions' && (
        <DictionaryManager title="Должности" api={api.positions} placeholder="Например: Следователь" />
      )}
      {activeTab === 'governmentBodies' && (
        <DictionaryManager
          title="Гос. органы посетителей"
          api={api.governmentBodies}
          placeholder="Например: Акимат города Астаны"
        />
      )}
      {activeTab === 'users' && <UsersAdminTab />}
    </div>
  );
}
