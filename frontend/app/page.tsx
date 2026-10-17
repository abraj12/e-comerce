'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api, getAuthToken, removeAuthToken } from './lib/api';

interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  price: number;
  availableQuantity: number;
}

interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  basePrice: number;
  category?: { name: string };
  images: string[];
  availableStock: number;
  variants: ProductVariant[];
  averageRating?: number;
  reviewCount?: number;
}

interface CartItem {
  id: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  variant?: {
    name: string;
    product?: { name: string; images: string[] };
  };
}

interface Cart {
  cartId: string;
  itemCount: number;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  items: CartItem[];
}

export default function StorefrontPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [cart, setCart] = useState<Cart | null>(null);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null);

  // Quick view state
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [quickViewQty, setQuickViewQty] = useState<number>(1);

  // Coupon state
  const [couponCode, setCouponCode] = useState<string>('');

  // Track order modal state
  const [isTrackModalOpen, setIsTrackModalOpen] = useState<boolean>(false);
  const [trackOrderNumber, setTrackOrderNumber] = useState<string>('');
  const [trackingResult, setTrackingResult] = useState<any>(null);

  const showToast = (message: string, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    loadUser();
    loadCategories();
    loadProducts();
    loadCart();
  }, [selectedCategory]);

  const loadUser = async () => {
    if (!getAuthToken()) {
      setUser(null);
      return;
    }
    try {
      const res = await api.getMe();
      if (res.success && res.data) setUser(res.data);
      else setUser(null);
    } catch {
      setUser(null);
    }
  };

  const loadCategories = async () => {
    try {
      const res = await api.getCategories();
      if (res.success) setCategories(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadProducts = async () => {
    try {
      const res = await api.getProducts({
        categoryId: selectedCategory || undefined,
        search: search || undefined
      });
      if (res.success) setProducts(res.items || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadCart = async () => {
    try {
      const res = await api.getCart();
      if (res.success) setCart(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadProducts();
  };

  const openQuickView = (prod: Product) => {
    setQuickViewProduct(prod);
    setSelectedVariantId(prod.variants[0]?.id || '');
    setQuickViewQty(1);
  };

  const handleAddToCart = async (variantId: string, qty = 1) => {
    try {
      const res = await api.addToCart(variantId, qty);
      if (res.success) {
        showToast('Added to shopping cart!');
        loadCart();
        setIsCartOpen(true);
        setQuickViewProduct(null);
      } else {
        showToast(res.error || 'Failed to add item', true);
      }
    } catch (err: any) {
      showToast(err.message, true);
    }
  };

  const handleUpdateCartQty = async (itemId: string, newQty: number) => {
    if (newQty <= 0) {
      await api.removeCartItem(itemId);
    } else {
      await api.updateCartItem(itemId, newQty);
    }
    loadCart();
  };

  const handleApplyCoupon = async () => {
    if (!couponCode) return;
    try {
      const res = await api.applyCoupon(couponCode);
      if (res.success) {
        showToast(`Coupon applied! Saved ₹${res.data.discountAmount}`);
        loadCart();
      } else {
        showToast(res.error || 'Invalid coupon', true);
      }
    } catch (err: any) {
      showToast(err.message, true);
    }
  };

  const handleTrackOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackOrderNumber) return;
    try {
      const res = await api.trackOrder(trackOrderNumber);
      if (res.success) {
        setTrackingResult(res.data);
      } else {
        setTrackingResult({ error: res.error || 'Order not found' });
      }
    } catch (err: any) {
      setTrackingResult({ error: err.message });
    }
  };

  const handleLogout = () => {
    removeAuthToken();
    setUser(null);
    showToast('Signed out successfully');
  };

  return (
    <>
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            right: '1.5rem',
            background: toast.isError ? '#dc2626' : '#0f172a',
            color: '#fff',
            padding: '0.85rem 1.25rem',
            borderRadius: '8px',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)',
            zIndex: 9999,
            fontWeight: 600,
            fontSize: '0.9rem'
          }}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <header className="header">
        <div className="nav-container">
          <Link href="/" className="brand">
            🛒 ALGIONS
            <span className="brand-badge">Next.js Retail</span>
          </Link>

          <form className="search-box" onSubmit={handleSearch}>
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search groceries, sweets, clothing, electronics..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>

          <div className="nav-actions">
            <button className="btn btn-outline btn-sm" onClick={() => setIsTrackModalOpen(true)}>
              📍 Track Order
            </button>

            {user ? (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>
                  Hi, {user.name}
                </span>
                <button className="btn btn-outline btn-sm" onClick={handleLogout}>
                  Logout
                </button>
                {user.role !== 'CUSTOMER' && (
                  <Link href="/admin" className="btn btn-primary btn-sm">
                    Admin Portal
                  </Link>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Link href="/login" className="btn btn-outline btn-sm">
                  Sign In
                </Link>
                <Link href="/admin/login" className="btn btn-outline btn-sm">
                  Staff Login
                </Link>
              </div>
            )}

            <button className="btn-icon" onClick={() => setIsCartOpen(true)} title="View Shopping Cart">
              <span style={{ fontSize: '1.25rem' }}>🛍️</span>
              <span className="badge">{cart?.itemCount || 0}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="container">
        {/* Hero Banner */}
        <section className="hero">
          <div>
            <h1>Fresh Local Goods, Delivered to Your Door</h1>
            <p>
              Your neighborhood destination for fresh groceries, confectionery sweets, cotton apparel,
              and fast electronics. Fast local delivery across our service zones.
            </p>
          </div>
          <div className="promo-badge">
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>
              Special Promo
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0.2rem 0' }}>
              USE: <code>SAVE10</code>
            </div>
            <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>10% off on orders above ₹200</div>
          </div>
        </section>

        {/* Category Filter Pills */}
        <div className="category-nav">
          <button
            className={`cat-pill ${selectedCategory === '' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('')}
          >
            All Products
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              className={`cat-pill ${selectedCategory === c.id ? 'active' : ''}`}
              onClick={() => setSelectedCategory(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        <div className="product-grid">
          {products.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: '#64748b' }}>
              No products found.
            </div>
          ) : (
            products.map((prod) => {
              const displayImg =
                prod.images?.[0] ||
                'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80';
              const isLowStock = prod.availableStock > 0 && prod.availableStock <= 5;
              const isOutOfStock = prod.availableStock <= 0;

              return (
                <div key={prod.id} className="product-card">
                  <div style={{ position: 'relative' }}>
                    <span
                      className={`product-tag ${
                        isOutOfStock ? 'tag-out' : isLowStock ? 'tag-low' : 'tag-stock'
                      }`}
                    >
                      {isOutOfStock ? 'Out of Stock' : isLowStock ? `Only ${prod.availableStock} Left` : 'In Stock'}
                    </span>
                    <img src={displayImg} alt={prod.name} className="product-img" />
                  </div>
                  <div className="product-info">
                    <span className="product-category">{prod.category?.name || 'Retail'}</span>
                    <h3 className="product-title">{prod.name}</h3>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <span className="product-price">₹{prod.basePrice.toFixed(2)}</span>
                      {prod.averageRating && (
                        <span style={{ fontSize: '0.85rem', color: '#f59e0b', fontWeight: 600 }}>
                          ★ {prod.averageRating.toFixed(1)} ({prod.reviewCount})
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem', flex: 1 }}>
                      {prod.description?.substring(0, 80)}...
                    </p>
                    <button
                      className="btn btn-primary"
                      disabled={isOutOfStock}
                      onClick={() => openQuickView(prod)}
                    >
                      {isOutOfStock ? 'Out of Stock' : 'Select Option & Buy'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* Cart Drawer Backdrop */}
      <div
        className={`drawer-backdrop ${isCartOpen ? 'active' : ''}`}
        onClick={() => setIsCartOpen(false)}
      />

      {/* Slide-over Shopping Cart Drawer */}
      <aside className={`cart-drawer ${isCartOpen ? 'active' : ''}`}>
        <div className="drawer-header">
          <div className="drawer-title">Shopping Cart ({cart?.itemCount || 0})</div>
          <button className="btn-icon" onClick={() => setIsCartOpen(false)}>
            ✕
          </button>
        </div>

        <div className="drawer-body">
          {!cart || cart.items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
              Your shopping cart is empty.
            </div>
          ) : (
            cart.items.map((item) => (
              <div key={item.id} className="cart-item">
                <div style={{ flex: 1 }}>
                  <div className="cart-item-title">{item.variant?.product?.name || 'Product'}</div>
                  <div className="cart-item-variant">{item.variant?.name || 'Standard Variant'}</div>
                  <div style={{ fontWeight: 700, marginTop: '0.2rem' }}>₹{item.unitPrice.toFixed(2)}</div>
                  <div className="cart-item-qty">
                    <button
                      className="qty-btn"
                      onClick={() => handleUpdateCartQty(item.id, item.quantity - 1)}
                    >
                      -
                    </button>
                    <span style={{ fontWeight: 600, padding: '0 0.4rem' }}>{item.quantity}</span>
                    <button
                      className="qty-btn"
                      onClick={() => handleUpdateCartQty(item.id, item.quantity + 1)}
                    >
                      +
                    </button>
                    <button
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        marginLeft: '0.5rem'
                      }}
                      onClick={() => handleUpdateCartQty(item.id, 0)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div style={{ fontWeight: 800 }}>
                  ₹{(item.unitPrice * item.quantity).toFixed(2)}
                </div>
              </div>
            ))
          )}
        </div>

        {cart && cart.items.length > 0 && (
          <div className="drawer-footer">
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="Promo Code (SAVE10)"
                className="form-control"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              />
              <button className="btn btn-outline btn-sm" onClick={handleApplyCoupon}>
                Apply
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.35rem' }}>
              <span>Subtotal:</span>
              <strong>₹{cart.subtotal.toFixed(2)}</strong>
            </div>

            {cart.discountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.35rem', color: '#16a34a' }}>
                <span>Discount:</span>
                <strong>-₹{cart.discountAmount.toFixed(2)}</strong>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.5rem', color: '#64748b' }}>
              <span>GST (5%):</span>
              <span>₹{cart.taxAmount.toFixed(2)}</span>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '1.2rem',
                fontWeight: 800,
                borderTop: '1px solid #cbd5e1',
                paddingTop: '0.75rem',
                marginBottom: '1rem',
                color: '#2563eb'
              }}
            >
              <span>Total:</span>
              <span>₹{cart.total.toFixed(2)}</span>
            </div>

            <Link
              href="/checkout"
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.85rem' }}
              onClick={() => setIsCartOpen(false)}
            >
              Proceed to Checkout →
            </Link>
          </div>
        )}
      </aside>

      {/* Quick View Modal */}
      {quickViewProduct && (
        <div className="modal-overlay" onClick={() => setQuickViewProduct(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
              <h2>{quickViewProduct.name}</h2>
              <button className="btn-icon" onClick={() => setQuickViewProduct(null)}>✕</button>
            </div>

            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#2563eb', marginBottom: '1rem' }}>
              ₹{quickViewProduct.basePrice.toFixed(2)}
            </div>

            <p style={{ color: '#475569', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
              {quickViewProduct.description}
            </p>

            <div className="form-group">
              <label>Select Option / Variant:</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {quickViewProduct.variants.map((v) => (
                  <label
                    key={v.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.65rem 0.85rem',
                      border: selectedVariantId === v.id ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: selectedVariantId === v.id ? '#eff6ff' : '#fff'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="radio"
                        name="productVariant"
                        checked={selectedVariantId === v.id}
                        onChange={() => setSelectedVariantId(v.id)}
                      />
                      <span style={{ fontWeight: 600 }}>{v.name}</span>
                    </div>
                    <span style={{ fontWeight: 700 }}>₹{v.price.toFixed(2)}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="form-group" style={{ maxWidth: '140px' }}>
              <label>Quantity:</label>
              <input
                type="number"
                min="1"
                max="20"
                className="form-control"
                value={quickViewQty}
                onChange={(e) => setQuickViewQty(Number(e.target.value))}
              />
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.85rem', marginTop: '1rem' }}
              onClick={() => handleAddToCart(selectedVariantId, quickViewQty)}
            >
              Add to Shopping Cart
            </button>
          </div>
        </div>
      )}

      {/* Track Order Modal */}
      {isTrackModalOpen && (
        <div className="modal-overlay" onClick={() => setIsTrackModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <h2>📍 Track Order</h2>
              <button className="btn-icon" onClick={() => setIsTrackModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleTrackOrder}>
              <div className="form-group">
                <label>Order Reference Number:</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ORD-20261017-XXXX"
                    className="form-control"
                    value={trackOrderNumber}
                    onChange={(e) => setTrackOrderNumber(e.target.value.trim())}
                  />
                  <button type="submit" className="btn btn-primary">
                    Search
                  </button>
                </div>
              </div>
            </form>

            {trackingResult && (
              <div style={{ marginTop: '1.25rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                {trackingResult.error ? (
                  <div style={{ color: '#dc2626' }}>{trackingResult.error}</div>
                ) : (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Order #{trackingResult.orderNumber}</div>
                    <div style={{ marginTop: '0.5rem' }}>
                      Status: <strong style={{ color: '#2563eb' }}>{trackingResult.status}</strong>
                    </div>
                    <div>Payment: <strong>{trackingResult.paymentStatus}</strong> ({trackingResult.paymentMethod})</div>
                    <div>Total Amount: <strong>₹{trackingResult.totalAmount?.toFixed(2)}</strong></div>
                    <div>Placed On: {new Date(trackingResult.createdAt).toLocaleDateString()}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer>
        <p>© 2026 <strong>ALGIONS AI LABS PRIVATE LIMITED</strong>. Reusable Component-Based Commerce Architecture.</p>
        <p style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
          <Link href="/login" style={{ color: '#2563eb', marginRight: '1rem' }}>Customer Login</Link>
          <Link href="/admin/login" style={{ color: '#2563eb', marginRight: '1rem' }}>Staff Login</Link>
          <a href="http://localhost:3000/api-docs" target="_blank" style={{ color: '#2563eb' }}>Backend API Docs (Swagger)</a>
        </p>
      </footer>
    </>
  );
}
