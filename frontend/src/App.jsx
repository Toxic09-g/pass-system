import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import RegistrationPage from './pages/RegistrationPage.jsx';
import JournalPage from './pages/JournalPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import BrandMark from './components/BrandMark.jsx';
import ScanCheckoutNotifier from './components/ScanCheckoutNotifier.jsx';
import { useAuth } from './auth/AuthContext.jsx';

// Экраны и право, которое к ним пускает (администратор — ко всем; проверяет и backend)
const PAGES = [
  { path: '/', label: 'Регистрация', allowed: (user) => user.can_register, element: <RegistrationPage /> },
  { path: '/journal', label: 'Журнал', allowed: (user) => user.can_view_journal, element: <JournalPage /> },
  { path: '/admin', label: 'Справочники', allowed: (user) => user.is_admin, element: <AdminPage /> },
];

function NavBar({ pages }) {
  const location = useLocation();
  const { user, institutionName, logout } = useAuth();

  return (
    <nav className="flex h-24 shrink-0 items-center gap-4 px-10">
      <BrandMark />
      <div className="leading-tight">
        <p className="text-lg font-semibold">Бюро пропусков</p>
        <p className="max-w-[18rem] truncate text-sm text-graphite">{institutionName}</p>
      </div>

      {/* Одну вкладку (у дежурного — только регистрация) меню не показывает */}
      {pages.length > 1 && (
        <div className="ml-6 flex gap-1 rounded-full bg-surface/60 p-1.5">
          {pages.map((page) => (
            <Link
              key={page.path}
              to={page.path}
              className={`rounded-full px-5 py-2.5 text-[15px] transition ${
                location.pathname === page.path
                  ? 'bg-surface font-semibold text-ink shadow-[0_2px_8px_-4px_rgba(21,35,43,0.3)]'
                  : 'text-graphite active:bg-surface/60'
              }`}
            >
              {page.label}
            </Link>
          ))}
        </div>
      )}

      <div className="ml-auto flex items-center gap-4">
        <p className="max-w-[16rem] truncate text-[15px] text-graphite">{user.full_name}</p>
        <button type="button" onClick={logout} className="btn-quiet h-11 px-5 text-sm">
          Выйти
        </button>
      </div>
    </nav>
  );
}

export default function App() {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return <div className="flex h-screen items-center justify-center text-graphite">Загрузка…</div>;
  }
  if (status === 'login') return <LoginPage />;

  const pages = PAGES.filter((page) => page.allowed(user));

  return (
    <div className="flex h-screen flex-col">
      <NavBar pages={pages} />
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Routes>
          {pages.map((page) => (
            <Route key={page.path} path={page.path} element={page.element} />
          ))}
          {/* Недоступный или неизвестный адрес — на первый разрешённый экран */}
          <Route path="*" element={<Navigate to={pages[0]?.path ?? '/'} replace />} />
        </Routes>
      </main>
      <ScanCheckoutNotifier showPopups={user.can_register} />
    </div>
  );
}
