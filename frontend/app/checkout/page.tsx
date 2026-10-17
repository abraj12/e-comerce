'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, getAuthToken } from '../lib/api';

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function CheckoutPage() {
  const router = useRouter();
  const [cart, setCart] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Form Fields
  const [deliveryType, setDeliveryType] = useState<'LOCAL_DELIVERY' | 'STORE_PICKUP'>('LOCAL_DELIVERY');
  const [paymentMethod, setPaymentMethod] = useState<'CASH_ON_DELIVERY' | 'ONLINE_RAZORPAY'>('CASH_ON_DELIVERY');
  const [name, setName] = useState('Priya Sharma');
  const [email, setEmail] = useState('customer@example.com');
  const [phone, setPhone] = useState('+919876543210');
  const [address, setAddress] = useState('Flat 402, Green Glen Layout, Bellandur');
  const [city, setCity] = useState('Bengaluru');
  const [state, setState] = useState('Karnataka');
  const [pinCode, setPinCode] = useState('560001');
  const [notes, setNotes] = useState('');

  // Delivery check state
  const [pinNotice, setPinNotice] = useState<{ text: string; color: string; fee: number }>({
    text: '',
    color: '#64748b',
    fee: 0
  });

  // Placed order success state
  const [placedOrder, setPlacedOrder] = useState<any>(null);

  useEffect(() => {
    loadCart();
  }, []);

  const loadCart = async () => {
    try {
      const res = await api.getCart();
      if (res.success) {
        setCart(res.data);
        if (res.data.items?.length === 0) {
          router.push('/');
        }
      }
    } catch (err: any) {
      setError('Failed to load shopping cart');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckPin = async (pin: string) => {
    setPinCode(pin);
    if (pin.length < 3) return;

    try {
      const res = await api.checkDeliveryPin(pin, cart?.subtotal || 0);
      if (res.success && res.data.serviceable) {
        const d = res.data;
        const feeText = d.isFreeDelivery ? 'FREE Delivery Eligible!' : `Delivery Fee: ₹${d.deliveryFee}`;
        setPinNotice({
          text: `✔ Serviceable Zone: ${d.zoneName} (${feeText}, Est. ~${d.estimatedDeliveryHours}h)`,
          color: '#16a34a',
          fee: d.deliveryFee
        });
      } else {
        setPinNotice({
          text: `✖ Sorry, PIN ${pin} is outside our delivery zones. Store pickup is available.`,
          color: '#dc2626',
          fee: 0
        });
      }
    } catch {
      setPinNotice({ text: 'Error checking PIN code serviceability', color: '#dc2626', fee: 0 });
    }
  };

  const effectiveDeliveryFee = deliveryType === 'STORE_PICKUP' ? 0 : pinNotice.fee;
  const grandTotal = cart ? Math.max(0, cart.subtotal - cart.discountAmount + cart.taxAmount + effectiveDeliveryFee) : 0;

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const payload = {
      deliveryType,
      paymentMethod,
      customerEmail: email,
      customerPhone: phone,
      notes: notes || undefined,
      shippingAddress: deliveryType === 'LOCAL_DELIVERY' ? {
        recipientName: name,
        phone,
        streetAddress: address,
        city,
        state,
        pinCode
      } : undefined
    };

    try {
      const res = await api.checkout(payload);
      if (!res.success) throw new Error(res.error || 'Failed to place order');

      const order = res.data;
      setPlacedOrder(order);

      // If Razorpay online payment selected, launch modal
      if (paymentMethod === 'ONLINE_RAZORPAY') {
        launchRazorpay(order);
      }
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  const launchRazorpay = async (order: any) => {
    try {
      const rzpRes = await api.createRazorpayOrder(order.id);
      if (!rzpRes.success) throw new Error(rzpRes.error || 'Failed to initialize payment gateway');

      const options = {
        key: rzpRes.data.keyId,
        amount: rzpRes.data.amount,
        currency: rzpRes.data.currency,
        name: 'ALGIONS Retail Mart',
        description: `Order #${order.orderNumber}`,
        order_id: rzpRes.data.razorpayOrderId,
        prefill: {
          email: order.customerEmail,
          contact: order.customerPhone
        },
        handler: async function (response: any) {
          try {
            const vRes = await api.verifyRazorpayPayment({
              orderId: order.id,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature
            });
            if (!vRes.success) throw new Error(vRes.error || 'Payment verification failed');
            setPlacedOrder((prev: any) => ({ ...prev, paymentStatus: 'COMPLETED', status: 'PAID' }));
          } catch (vErr: any) {
            setError('Payment verification failed: ' + vErr.message);
          }
        },
        theme: { color: '#2563eb' }
      };

      if (typeof window !== 'undefined' && window.Razorpay) {
        const rzp = new window.Razorpay(options);
        rzp.open();
      } else {
        setError('Razorpay SDK not loaded in browser.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '5rem 1rem', fontSize: '1.1rem', color: '#64748b' }}>
        Loading checkout...
      </div>
    );
  }

  // Order Confirmed Screen
  if (placedOrder) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
        <header className="header">
          <div className="nav-container">
            <Link href="/" className="brand">🛒 ALGIONS</Link>
          </div>
        </header>

        <main className="container" style={{ maxWidth: '640px', marginTop: '2rem' }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '2.5rem', textAlign: 'center', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#16a34a', marginBottom: '0.5rem' }}>
              Order Placed Successfully!
            </h1>
            <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>
              Thank you for shopping with ALGIONS Retail Mart.
            </p>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.25rem', textAlign: 'left', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: '#64748b' }}>Order Number:</span>
                <strong>{placedOrder.orderNumber}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: '#64748b' }}>Total Paid/Payable:</span>
                <strong>₹{placedOrder.totalAmount?.toFixed(2)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: '#64748b' }}>Payment Status:</span>
                <span style={{ fontWeight: 700, color: placedOrder.paymentStatus === 'COMPLETED' ? '#16a34a' : '#d97706' }}>
                  {placedOrder.paymentStatus} ({placedOrder.paymentMethod})
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <Link href="/" className="btn btn-outline">
                ← Return to Storefront
              </Link>
              <Link
                href={`/orders/track`}
                className="btn btn-primary"
              >
                Track Fulfillment
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      <header className="header">
        <div className="nav-container">
          <Link href="/" className="brand">
            🛒 ALGIONS
            <span className="brand-badge">Next.js Checkout</span>
          </Link>
          <Link href="/" className="btn btn-outline btn-sm">
            ← Back to Store
          </Link>
        </div>
      </header>

      <main className="container" style={{ maxWidth: '960px' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: '1.5rem 0' }}>Complete Your Order</h1>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmitOrder} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
          {/* Left Column: Form Details */}
          <div>
            {/* Delivery Method */}
            <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>1. Delivery Mode</h2>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <label style={{ flex: 1, padding: '0.75rem', border: deliveryType === 'LOCAL_DELIVERY' ? '2px solid #2563eb' : '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', background: deliveryType === 'LOCAL_DELIVERY' ? '#eff6ff' : '#fff' }}>
                  <input
                    type="radio"
                    name="delType"
                    checked={deliveryType === 'LOCAL_DELIVERY'}
                    onChange={() => setDeliveryType('LOCAL_DELIVERY')}
                  />
                  <span style={{ fontWeight: 600, marginLeft: '0.5rem' }}>🚚 Local Delivery</span>
                </label>
                <label style={{ flex: 1, padding: '0.75rem', border: deliveryType === 'STORE_PICKUP' ? '2px solid #2563eb' : '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', background: deliveryType === 'STORE_PICKUP' ? '#eff6ff' : '#fff' }}>
                  <input
                    type="radio"
                    name="delType"
                    checked={deliveryType === 'STORE_PICKUP'}
                    onChange={() => setDeliveryType('STORE_PICKUP')}
                  />
                  <span style={{ fontWeight: 600, marginLeft: '0.5rem' }}>🏪 Store Pickup</span>
                </label>
              </div>
            </div>

            {/* Customer & Address Details */}
            <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>2. Contact & Address</h2>
              <div className="form-group">
                <label>Recipient Full Name</label>
                <input type="text" required className="form-control" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Email Address</label>
                  <input type="email" required className="form-control" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Phone Number</label>
                  <input type="tel" required className="form-control" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>

              {deliveryType === 'LOCAL_DELIVERY' && (
                <>
                  <div className="form-group">
                    <label>Street Address</label>
                    <input type="text" required className="form-control" value={address} onChange={(e) => setAddress(e.target.value)} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                    <div className="form-group">
                      <label>City</label>
                      <input type="text" required className="form-control" value={city} onChange={(e) => setCity(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>State</label>
                      <input type="text" required className="form-control" value={state} onChange={(e) => setState(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>PIN Code</label>
                      <input type="text" required className="form-control" value={pinCode} onChange={(e) => handleCheckPin(e.target.value)} />
                    </div>
                  </div>
                  {pinNotice.text && (
                    <div style={{ fontSize: '0.85rem', color: pinNotice.color, fontWeight: 600, marginTop: '0.25rem' }}>
                      {pinNotice.text}
                    </div>
                  )}
                </>
              )}

              <div className="form-group" style={{ marginTop: '0.75rem' }}>
                <label>Order Instructions (Optional)</label>
                <input type="text" className="form-control" placeholder="Leave at gate, call on arrival, etc." value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            {/* Payment Method */}
            <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>3. Payment Method</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem', border: paymentMethod === 'CASH_ON_DELIVERY' ? '2px solid #2563eb' : '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', background: paymentMethod === 'CASH_ON_DELIVERY' ? '#eff6ff' : '#fff' }}>
                  <input
                    type="radio"
                    name="payMethod"
                    checked={paymentMethod === 'CASH_ON_DELIVERY'}
                    onChange={() => setPaymentMethod('CASH_ON_DELIVERY')}
                  />
                  <div>
                    <span style={{ fontWeight: 700 }}>💵 Cash on Delivery</span>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Pay in cash or UPI upon delivery</div>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem', border: paymentMethod === 'ONLINE_RAZORPAY' ? '2px solid #2563eb' : '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', background: paymentMethod === 'ONLINE_RAZORPAY' ? '#eff6ff' : '#fff' }}>
                  <input
                    type="radio"
                    name="payMethod"
                    checked={paymentMethod === 'ONLINE_RAZORPAY'}
                    onChange={() => setPaymentMethod('ONLINE_RAZORPAY')}
                  />
                  <div>
                    <span style={{ fontWeight: 700 }}>💳 Pay Online via Razorpay</span>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Instant payment via UPI (GPay/PhonePe), Credit/Debit Card, NetBanking</div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Right Column: Order Summary */}
          <div>
            <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', position: 'sticky', top: '5rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>Order Summary</h2>

              <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '1rem' }}>
                {cart?.items.map((i: any) => (
                  <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.4rem 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span>{i.variant?.product?.name} ({i.variant?.name}) × {i.quantity}</span>
                    <strong>₹{(i.unitPrice * i.quantity).toFixed(2)}</strong>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                <span>Subtotal:</span>
                <strong>₹{cart?.subtotal.toFixed(2)}</strong>
              </div>

              {cart?.discountAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.5rem', color: '#16a34a' }}>
                  <span>Discount:</span>
                  <strong>-₹{cart.discountAmount.toFixed(2)}</strong>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                <span>Delivery Fee:</span>
                <span>{effectiveDeliveryFee > 0 ? `₹${effectiveDeliveryFee.toFixed(2)}` : 'FREE'}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.75rem', color: '#64748b' }}>
                <span>GST (5%):</span>
                <span>₹{cart?.taxAmount.toFixed(2)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.3rem', fontWeight: 800, borderTop: '2px solid #cbd5e1', paddingTop: '0.75rem', marginBottom: '1.5rem', color: '#2563eb' }}>
                <span>Total Amount:</span>
                <span>₹{grandTotal.toFixed(2)}</span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.9rem', fontSize: '1rem', fontWeight: 700 }}
              >
                {submitting ? 'Processing Order...' : paymentMethod === 'ONLINE_RAZORPAY' ? 'Proceed to Razorpay Payment →' : 'Confirm Cash on Delivery Order →'}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
