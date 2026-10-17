'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, setAuthToken } from '../../lib/api';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@algions.local');
  const [password, setPassword] = useState('Admin@123456');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fillRole = (e: string, p: string) => {
    setEmail(e);
    setPassword(p);
    setError('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.login(email, password);
      if (!res.success) throw new Error(res.error || 'Authentication failed');

      if (res.data.user.role === 'CUSTOMER') {
        throw new Error('Access denied: Staff or Administrator account required. Use customer sign in.');
      }

      setAuthToken(res.data.accessToken);
      setSuccess(`Authenticated as ${res.data.user.role} (${res.data.user.name}). Entering dashboard...`);
      setTimeout(() => router.push('/admin'), 700);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', color: '#f8fafc' }}>
      <div style={{ background: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', width: '100%', maxWidth: '460px', padding: '2.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#38bdf8' }}>🏢 ALGIONS Operations</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.35rem' }}>Retail Store Staff & Operations Portal</p>
        </div>

        {/* 1-Click Role Quick Fill */}
        <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', padding: '0.85rem 1rem', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', fontWeight: 700, marginBottom: '0.5rem' }}>
            ⚡ 1-Click Demo Staff Credentials:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
            <button
              type="button"
              style={{ background: '#334155', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', padding: '0.4rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
              onClick={() => fillRole('admin@algions.local', 'Admin@123456')}
            >
              👑 Administrator
            </button>
            <button
              type="button"
              style={{ background: '#334155', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', padding: '0.4rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
              onClick={() => fillRole('manager@algions.local', 'Staff@123456')}
            >
              📊 Operations Manager
            </button>
            <button
              type="button"
              style={{ background: '#334155', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', padding: '0.4rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
              onClick={() => fillRole('staff@algions.local', 'Staff@123456')}
            >
              📦 Inventory Staff
            </button>
            <button
              type="button"
              style={{ background: '#334155', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', padding: '0.4rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
              onClick={() => fillRole('rider@algions.local', 'Rider@123456')}
            >
              🛵 Delivery Rider
            </button>
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#fca5a5', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ background: 'rgba(34, 197, 94, 0.2)', border: '1px solid #22c55e', color: '#86efac', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {success}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label style={{ color: '#cbd5e1' }}>Employee Email</label>
            <input
              type="email"
              required
              style={{ background: '#0f172a', border: '1px solid #475569', color: '#fff' }}
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label style={{ color: '#cbd5e1' }}>Password</label>
            <input
              type="password"
              required
              style={{ background: '#0f172a', border: '1px solid #475569', color: '#fff' }}
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', background: '#0284c7', color: '#fff', border: 'none', padding: '0.85rem', borderRadius: '8px', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', marginTop: '0.5rem' }}
          >
            {loading ? 'Authenticating...' : 'Authenticate & Enter Dashboard →'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem', color: '#94a3b8' }}>
          Customer looking to shop? <Link href="/login" style={{ color: '#38bdf8', fontWeight: 600 }}>Customer Sign In</Link> &bull; <Link href="/" style={{ color: '#94a3b8' }}>Storefront</Link>
        </div>
      </div>
    </div>
  );
}
