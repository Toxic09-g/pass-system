const BASE_URL = '/api';

// Событие окна «визиты изменились» (например, отмечен выход по скану) —
// открытые списки визитов перезагружаются
export const VISITS_CHANGED_EVENT = 'visits-changed';

// Сервер ответил 401 — сессия истекла или пользователя отключили; приложение покажет вход
export const AUTH_REQUIRED_EVENT = 'auth-required';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => null);
  if (res.status === 401 && !path.startsWith('/auth/')) {
    window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
  }
  if (!res.ok) {
    throw new Error(data?.error || 'Ошибка запроса к серверу');
  }
  return data;
}

function createDictionaryApi(resource) {
  return {
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/${resource}${query ? `?${query}` : ''}`);
    },
    create: (payload) => request(`/${resource}`, { method: 'POST', body: JSON.stringify(payload) }),
    update: (id, payload) => request(`/${resource}/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id) => request(`/${resource}/${id}`, { method: 'DELETE' }),
  };
}

const post = (path, payload) => request(path, { method: 'POST', body: JSON.stringify(payload ?? {}) });

export const api = {
  auth: {
    me: () => request('/auth/me'),
    login: (login, password) => post('/auth/login', { login, password }),
    logout: () => post('/auth/logout'),
  },
  users: {
    list: () => request('/users'),
    create: (payload) => post('/users', payload),
    update: (id, payload) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    resetPassword: (id) => post(`/users/${id}/reset-password`),
    institutions: () => request('/users/institutions'),
  },
  employees: {
    ...createDictionaryApi('employees'),
    search: (query, departmentId) => {
      const params = new URLSearchParams({ activeOnly: '1' });
      if (query) params.set('search', query);
      if (departmentId) params.set('department_id', departmentId);
      return request(`/employees?${params.toString()}`);
    },
  },
  departments: createDictionaryApi('departments'),
  positions: createDictionaryApi('positions'),
  governmentBodies: createDictionaryApi('government-bodies'),
  settings: {
    get: () => request('/settings'),
    update: (payload) => request('/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  },
  visits: {
    organizations: () => request('/visits/organizations'),
    recent: () => request('/visits/recent'),
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/visits${query ? `?${query}` : ''}`);
    },
    create: (payload) => request('/visits', { method: 'POST', body: JSON.stringify(payload) }),
    print: (id) => request(`/visits/${id}/print`, { method: 'POST' }),
    graph: (params) => request(`/visits/graph?${new URLSearchParams(params).toString()}`),
    checkout: (qrCodeValue) =>
      request('/visits/checkout', { method: 'POST', body: JSON.stringify({ qr_code_value: qrCodeValue }) }),
  },
};
