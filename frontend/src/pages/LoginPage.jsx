import { useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import BrandMark from '../components/BrandMark.jsx';

export default function LoginPage() {
  const { institutionName, adminConfigured, refresh } = useAuth();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.auth.login(login, password);
      await refresh();
    } catch (err) {
      setError(err.message);
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="card w-full max-w-md space-y-6 p-10 shadow-float">
        <div className="space-y-6">
          <BrandMark size={48} />
          <div>
            <p className="eyebrow">{institutionName}</p>
            <h1 className="mt-2 text-touch-xl font-semibold">Бюро пропусков</h1>
          </div>
        </div>
        {!adminConfigured && (
          <div className="alert-note">
            Пост ещё не настроен: вход администратора не задан. Обратитесь к администратору системы.
          </div>
        )}
        {error && <div className="alert-error">{error}</div>}
        <label className="block">
          <span className="label">Логин</span>
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoFocus
            autoComplete="username"
            className="field"
          />
        </label>
        <label className="block">
          <span className="label">Пароль</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="field"
          />
        </label>
        <button
          type="submit"
          disabled={submitting || !login || !password}
          className="btn-primary h-[4.5rem] w-full text-touch-lg"
        >
          {submitting ? 'Вход…' : 'Войти'}
        </button>
      </form>
    </div>
  );
}
