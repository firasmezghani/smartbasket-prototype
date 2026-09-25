import { useMemo, useState } from 'react';
import { AdminCashierPage } from './AdminCashierPage.jsx';
import { AdminOverviewPage } from './AdminOverviewPage.jsx';
import { AdminSettingsPage } from './AdminSettingsPage.jsx';
import './admin.css';

// Staff layout. Tabs depend on the role, but the server also checks every admin request.
export function AdminApp({ user }) {
  const isAdmin = user?.role === 'ADMIN';

  const tabs = useMemo(() => {
    const base = [{ key: 'cashier', label: 'Cashier validation' }];
    if (isAdmin) {
      base.push(
        { key: 'overview', label: 'Admin overview' },
        { key: 'settings', label: 'Settings' },
      );
    }
    return base;
  }, [isAdmin]);

  const [active, setActive] = useState('cashier');
  const current = tabs.some((t) => t.key === active) ? active : 'cashier';

  return (
    <div className="sb-admin">
      {tabs.length > 1 ? (
        <nav className="sb-admin-nav" aria-label="Admin sections">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              aria-current={current === tab.key ? 'page' : undefined}
              onClick={() => setActive(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      ) : null}

      {current === 'cashier' ? <AdminCashierPage user={user} /> : null}
      {current === 'overview' && isAdmin ? (
        <AdminOverviewPage user={user} onNavigate={setActive} />
      ) : null}
      {current === 'settings' && isAdmin ? <AdminSettingsPage /> : null}
    </div>
  );
}
