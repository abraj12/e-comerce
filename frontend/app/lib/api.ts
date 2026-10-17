// Reusable API client connecting to backend through Next.js rewrite proxy (/api)

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export function setAuthToken(token: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('token', token);
  }
}

export function removeAuthToken(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
  }
}

function getHeaders(isJson = true): HeadersInit {
  const headers: Record<string, string> = {};
  if (isJson) headers['Content-Type'] = 'application/json';
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export const api = {
  // Products
  async getProducts(params?: { categoryId?: string; search?: string; page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.categoryId) query.set('categoryId', params.categoryId);
    if (params?.search) query.set('search', params.search);
    if (params?.page) query.set('page', String(params.page));
    query.set('limit', String(params?.limit || 50));

    const res = await fetch(`/api/products?${query.toString()}`);
    return res.json();
  },

  async getProductBySlug(slug: string) {
    const res = await fetch(`/api/products/${encodeURIComponent(slug)}`);
    return res.json();
  },

  // Categories
  async getCategories() {
    const res = await fetch('/api/categories');
    return res.json();
  },

  // Cart
  async getCart() {
    const res = await fetch('/api/cart', { headers: getHeaders(false) });
    return res.json();
  },

  async addToCart(variantId: string, quantity = 1) {
    const res = await fetch('/api/cart/items', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ variantId, quantity })
    });
    return res.json();
  },

  async updateCartItem(itemId: string, quantity: number) {
    const res = await fetch(`/api/cart/items/${itemId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ quantity })
    });
    return res.json();
  },

  async removeCartItem(itemId: string) {
    const res = await fetch(`/api/cart/items/${itemId}`, {
      method: 'DELETE',
      headers: getHeaders(false)
    });
    return res.json();
  },

  async applyCoupon(code: string) {
    const res = await fetch('/api/promotions/validate', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ code })
    });
    return res.json();
  },

  // Delivery
  async checkDeliveryPin(pinCode: string, orderSubtotal = 0) {
    const res = await fetch(`/api/delivery/check?pinCode=${encodeURIComponent(pinCode)}&orderSubtotal=${orderSubtotal}`);
    return res.json();
  },

  // Orders & Checkout
  async checkout(payload: any) {
    const res = await fetch('/api/orders/checkout', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  async trackOrder(orderNumber: string) {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderNumber)}/track`);
    return res.json();
  },

  // Payments (Razorpay)
  async createRazorpayOrder(orderId: string) {
    const res = await fetch('/api/payments/create-order', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ orderId })
    });
    return res.json();
  },

  async verifyRazorpayPayment(payload: {
    orderId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }) {
    const res = await fetch('/api/payments/verify', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  // Auth
  async login(email: string, password: string) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    return res.json();
  },

  async register(payload: { name: string; email: string; password: string; phone?: string }) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  async getMe() {
    const res = await fetch('/api/auth/me', { headers: getHeaders(false) });
    return res.json();
  },

  // Admin Reports
  async getAdminDashboard() {
    const res = await fetch('/api/reports/dashboard', { headers: getHeaders(false) });
    return res.json();
  }
};
