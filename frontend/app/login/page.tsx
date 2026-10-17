'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, setAuthToken } from '../lib/api';

export default function CustomerLoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('customer@example.com');
  const [password, setPassword] = useState('Customer@123456');

  // Registration state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPhone, setRegPhone] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fillDemoCustomer = () => {
    setTab('login');
    setEmail('customer@example.com');
    setPassword('Customer@123456');
    setError('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.login(email, password);
      if (!res.success) throw new Error(res.error || 'Login failed');

      setAuthToken(res.data.accessToken);
      setSuccess(`Welcome back, ${res.data.user.name}! Redirecting...`);
      setTimeout(() => router.push('/'), 700);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.register({
        name: regName,
        email: regEmail,
        password: regPassword,
        phone: regPhone || undefined
      });
      if (!res.success) throw new Error(res.error || 'Registration failed');

      setAuthToken(res.data.accessToken);
      setSuccess('Account created successfully! Redirecting...');
      setTimeout(() => router.push('/'), 700);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
      <header className="header">
        <div className="nav-container" style={{ justifyContent: 'space-between' }}>
          <Link href="/" className="brand">
            🛒 ALGIONS
            <span className="brand-badge">Next.js Retail</span>
          </Link>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Link href="/" className="btn btn-outline btn-sm">← Storefront</Link>
            <Link href="/admin/login" className="btn btn-outline btn-sm">Staff Login →</Link>
          </div>
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
            maxWidth: '440px',
            width: '100%',
            padding: '2.25rem'
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>🛒 Customer Sign In</h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.25rem' }}>
              Access your cart, order history & saved addresses
            </p>
          </div>

          {/* Quick Fill Demo Box */}
          <div
            style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '10px',
              padding: '0.75rem 1rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.85rem'
            }}
          >
            <div>
              <strong>⚡ Demo Customer Account</strong><br />
              <span style={{ color: '#475569', fontSize: '0.8rem' }}>customer@example.com</span>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={fillDemoCustomer}
            >
              Fill Demo
            </button>
          </div>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
              {success}
            </div>
          )}

          <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: '1.5rem' }}>
            <button
              type="button"
              style={{
                flex: 1,
                padding: '0.6rem',
                border: 'none',
                background: 'transparent',
                fontWeight: 700,
                color: tab === 'login' ? '#2563eb' : '#64748b',
                borderBottom: tab === 'login' ? '2px solid #2563eb' : 'none',
                cursor: 'pointer'
              }}
              onClick={() => { setTab('login'); setError(''); }}
            >
              Sign In
            </button>
            <button
              type="button"
              style={{
                flex: 1,
                padding: '0.6rem',
                border: 'none',
                background: 'transparent',
                fontWeight: 700,
                color: tab === 'register' ? '#2563eb' : '#64748b',
                borderBottom: tab === 'register' ? '2px solid #2563eb' : 'none',
                cursor: 'pointer'
              }}
              onClick={() => { setTab('register'); setError(''); }}
            >
              Create Account
            </button>
          </div>

          {tab === 'login' ? (
            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  required
                  className="form-control"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  required
                  className="form-control"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.8rem', marginTop: '0.5rem' }}
              >
                {loading ? 'Authenticating...' : 'Sign In to Shop'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  required
                  className="form-control"
                  placeholder="Aarav Sharma"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  required
                  className="form-control"
                  placeholder="name@example.com"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Password (min 8 chars)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  className="form-control"
                  placeholder="••••••••"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Phone Number</label>
                <input
                  type="tel"
                  className="form-control"
                  placeholder="+91 9876543210"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.8rem', marginTop: '0.5rem' }}
              >
                {loading ? 'Creating Account...' : 'Register Account'}
              </button>
            </form>
          )}

          <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem', color: '#64748b' }}>
            Store operations or rider? <Link href="/admin/login" style={{ color: '#2563eb', fontWeight: 600 }}>Staff Portal Sign In</Link>
          </div>
        </div>
      </main>

      <footer>
        <p>© 2026 <strong>ALGIONS AI LABS PRIVATE LIMITED</strong> &bull; Next.js E-Commerce</p>
      </footer>
    </div>
  );
}
