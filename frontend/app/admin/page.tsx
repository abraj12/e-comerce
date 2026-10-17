'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, getAuthToken, removeAuthToken } from '../lib/api';

export default function AdminDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    if (!getAuthToken()) {
      router.push('/admin/login');
      return;
    }

    try {
      const userRes = await api.getMe();
      if (!userRes.success || !userRes.data || userRes.data.role === 'CUSTOMER') {
        removeAuthToken();
        router.push('/admin/login');
        return;
      }
      setUser(userRes.data);

      const dashRes = await api.getAdminDashboard();
      if (dashRes.success) {
        setStats(dashRes.data);
      }
    } catch {
      router.push('/admin/login');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    removeAuthToken();
    router.push('/admin/login');
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Loading Admin Operations Center...
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f8fafc', display: 'flex' }}>
      {/* Sidebar */}
      <aside style={{ width: '260px', background: '#1e293b', borderRight: '1px solid rgba(255,255,255,0.08)', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#38bdf8', marginBottom: '2rem' }}>
          🏢 ALGIONS LABS
        </div>

        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ background: '#0284c7', color: '#fff', padding: '0.75rem 1rem', borderRadius: '8px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span>📊</span> Dashboard
          </div>
          <Link href="/" target="_blank" style={{ color: '#94a3b8', padding: '0.75rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span>🏪</span> View Live Storefront
          </Link>
          <a href="http://localhost:3000/api-docs" target="_blank" style={{ color: '#94a3b8', padding: '0.75rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span>📖</span> OpenAPI Swagger
          </a>
        </nav>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Logged in as:</div>
          <div style={{ fontWeight: 700, color: '#fff' }}>{user?.name}</div>
          <div style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 600 }}>{user?.role}</div>
          <button
            onClick={handleLogout}
            style={{ width: '100%', marginTop: '0.75rem', background: '#334155', color: '#fff', border: 'none', padding: '0.5rem', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer' }}
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Retail Operations Center</h1>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Real-time shop metrics, inventory reservations & fulfillment</p>
          </div>
        </header>

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
          <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '1.5rem' }}>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Total Revenue</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#38bdf8', marginTop: '0.25rem' }}>
              ₹{stats?.totalRevenue?.toFixed(2) || '0.00'}
            </div>
          </div>

          <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '1.5rem' }}>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Total Orders</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#fff', marginTop: '0.25rem' }}>
              {stats?.totalOrders || 0}
            </div>
          </div>

          <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '1.5rem' }}>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Active Catalogue</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#fff', marginTop: '0.25rem' }}>
              {stats?.activeProducts || 0} items
            </div>
          </div>

          <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '1.5rem' }}>
            <div style={{ fontSize: '0.85rem', color: '#ef4444', textTransform: 'uppercase', fontWeight: 700 }}>Low Stock Alerts</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#ef4444', marginTop: '0.25rem' }}>
              {stats?.lowStockItems || 0}
            </div>
          </div>
        </div>

        {/* Recent Orders Card */}
        <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '1.75rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1.25rem' }}>Recent Customer Orders</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
                  <th style={{ padding: '0.75rem' }}>Order Number</th>
                  <th style={{ padding: '0.75rem' }}>Customer Email</th>
                  <th style={{ padding: '0.75rem' }}>Amount</th>
                  <th style={{ padding: '0.75rem' }}>Status</th>
                  <th style={{ padding: '0.75rem' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {stats?.recentOrders?.map((o: any) => (
                  <tr key={o.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 700, color: '#38bdf8' }}>{o.orderNumber}</td>
                    <td style={{ padding: '0.75rem' }}>{o.customerEmail}</td>
                    <td style={{ padding: '0.75rem', fontWeight: 700 }}>₹{o.totalAmount?.toFixed(2)}</td>
                    <td style={{ padding: '0.75rem' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          background: o.status === 'PAID' ? 'rgba(34,197,94,0.2)' : o.status === 'PROCESSING' ? 'rgba(2,132,199,0.2)' : 'rgba(234,179,8,0.2)',
                          color: o.status === 'PAID' ? '#86efac' : o.status === 'PROCESSING' ? '#7dd3fc' : '#fde047'
                        }}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', color: '#94a3b8' }}>{new Date(o.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
