'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../lib/api';

interface TrackedItem {
  productName: string;
  variantName: string;
  quantity: number;
}

interface TrackedOrder {
  orderNumber: string;
  status: string;
  deliveryType: string;
  createdAt: string;
  itemCount: number;
  items: TrackedItem[];
}

const ORDER_STEPS = ['PENDING', 'CONFIRMED', 'PROCESSING', 'OUT_FOR_DELIVERY', 'DELIVERED'];

function TrackOrderContent() {
  const searchParams = useSearchParams();
  const initialOrderNumber = searchParams.get('orderNumber') || '';

  const [orderNumberInput, setOrderNumberInput] = useState(initialOrderNumber);
  const [orderData, setOrderData] = useState<TrackedOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTracking = async (numberToTrack: string) => {
    if (!numberToTrack.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.trackOrder(numberToTrack.trim());
      if (res.success && res.data) {
        setOrderData(res.data);
      } else {
        setError(res.error || 'Order not found. Please verify the order number.');
        setOrderData(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch order tracking status.');
      setOrderData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialOrderNumber) {
      fetchTracking(initialOrderNumber);
    }
  }, [initialOrderNumber]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTracking(orderNumberInput);
  };

  const getStepStatus = (step: string) => {
    if (!orderData) return 'pending';
    if (orderData.status === 'CANCELLED') return 'cancelled';
    const currentIndex = ORDER_STEPS.indexOf(orderData.status);
    const stepIndex = ORDER_STEPS.indexOf(step);
    if (currentIndex >= stepIndex) return 'complete';
    return 'pending';
  };

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '0 20px' }}>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href="/" className="btn btn-secondary" style={{ fontSize: '13px' }}>
          &larr; Back to Store
        </Link>
        <span style={{ fontSize: '13px', color: '#64748b' }}>Algions Live Fulfillment Tracker</span>
      </div>

      <div className="card" style={{ padding: '32px', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>Track Your Order</h1>
        <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>
          Enter your order reference number to check fulfillment and real-time dispatch progress.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <input
            type="text"
            className="input"
            placeholder="e.g. ORD-20261017-XXXX"
            value={orderNumberInput}
            onChange={(e) => setOrderNumberInput(e.target.value)}
            style={{ flex: 1, textTransform: 'uppercase' }}
            required
          />
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ minWidth: '120px' }}>
            {loading ? 'Searching...' : 'Track'}
          </button>
        </form>

        {error && (
          <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '14px', marginTop: '16px' }}>
            {error}
          </div>
        )}
      </div>

      {orderData && (
        <div className="card" style={{ padding: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '20px', marginBottom: '24px' }}>
            <div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Tracking Reference</span>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: '4px 0 0 0' }}>{orderData.orderNumber}</h2>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className={`badge ${orderData.status === 'DELIVERED' ? 'badge-in-stock' : orderData.status === 'CANCELLED' ? 'badge-out-of-stock' : 'badge-low-stock'}`} style={{ fontSize: '14px', padding: '6px 14px' }}>
                {orderData.status.replace(/_/g, ' ')}
              </span>
              <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>
                Placed: {new Date(orderData.createdAt).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Fulfillment Stepper */}
          {orderData.status !== 'CANCELLED' ? (
            <div style={{ margin: '32px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
                {ORDER_STEPS.map((step, idx) => {
                  const status = getStepStatus(step);
                  const isDone = status === 'complete';
                  return (
                    <div key={step} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, zIndex: 1 }}>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: isDone ? '#2563eb' : '#e2e8f0',
                          color: isDone ? '#fff' : '#64748b',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '13px',
                          fontWeight: 700,
                          marginBottom: '8px'
                        }}
                      >
                        {isDone ? '✓' : idx + 1}
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: isDone ? '#0f172a' : '#94a3b8', textAlign: 'center' }}>
                        {step.replace(/_/g, ' ')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ padding: '16px', background: '#fef2f2', color: '#991b1b', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', fontWeight: 600 }}>
              This order has been cancelled. If you believe this is an error, please contact support.
            </div>
          )}

          {/* Items Summary */}
          <div style={{ marginTop: '24px', borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px', color: '#334155' }}>
              Order Contents ({orderData.itemCount} items)
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {orderData.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', fontSize: '14px' }}>
                  <div>
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{item.productName}</span>
                    <span style={{ color: '#64748b', marginLeft: '8px', fontSize: '12px' }}>({item.variantName})</span>
                  </div>
                  <span style={{ fontWeight: 700, color: '#475569' }}>Qty: {item.quantity}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TrackOrderPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading tracker...</div>}>
      <TrackOrderContent />
    </Suspense>
  );
}
