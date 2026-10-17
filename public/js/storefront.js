let currentCategory = '';
let currentSearch = '';
let currentUser = null;
let currentCart = null;
let selectedVariantId = null;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  loadCategories();
  loadProducts();
  fetchCart();

  // Search input debounce
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        currentSearch = e.target.value.trim();
        loadProducts();
      }, 300);
    });
  }
});

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.background = isError ? '#ef4444' : '#0f172a';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// Authentication
async function checkAuth() {
  const token = localStorage.getItem('token');
  if (!token) {
    renderAuthButtons(null);
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success && data.data) {
      currentUser = data.data;
      renderAuthButtons(currentUser);
    } else {
      localStorage.removeItem('token');
      renderAuthButtons(null);
    }
  } catch {
    renderAuthButtons(null);
  }
}

function renderAuthButtons(user) {
  const container = document.getElementById('authNavContainer');
  if (user) {
    container.innerHTML = `
      <span style="font-size: 0.9rem; font-weight: 600; color: #475569;">Hi, ${user.name}</span>
      <button class="btn btn-outline btn-sm" onclick="logout()">Logout</button>
      ${user.role !== 'CUSTOMER' ? '<a href="/admin/" class="btn btn-primary btn-sm">Admin Portal</a>' : ''}
    `;
  } else {
    container.innerHTML = `
      <button class="btn btn-outline btn-sm" onclick="openModal('authModal')">Login / Register</button>
      <a href="/admin/" class="btn btn-outline btn-sm">Staff Login</a>
    `;
  }
}

async function loginUser(event) {
  event.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    localStorage.setItem('token', data.data.accessToken);
    currentUser = data.data.user;
    renderAuthButtons(currentUser);
    closeModal('authModal');
    showToast(`Welcome back, ${currentUser.name}!`);
    fetchCart();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function registerUser(event) {
  event.preventDefault();
  const name = document.getElementById('regName').value;
  const email = document.getElementById('regEmail').value;
  const password = document.getElementById('regPassword').value;
  const phone = document.getElementById('regPhone').value;

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, phone })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    localStorage.setItem('token', data.data.accessToken);
    currentUser = data.data.user;
    renderAuthButtons(currentUser);
    closeModal('authModal');
    showToast('Registration successful! Welcome to ALGIONS Store.');
    fetchCart();
  } catch (err) {
    showToast(err.message, true);
  }
}

function logout() {
  localStorage.removeItem('token');
  currentUser = null;
  renderAuthButtons(null);
  showToast('Logged out successfully');
  fetchCart();
}

// Categories & Products
async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const data = await res.json();
    if (data.success) {
      const container = document.getElementById('categoryNav');
      const pills = [
        `<button class="cat-pill ${currentCategory === '' ? 'active' : ''}" onclick="selectCategory('')">All Products</button>`
      ];

      data.data.forEach((cat) => {
        pills.push(
          `<button class="cat-pill ${currentCategory === cat.id ? 'active' : ''}" onclick="selectCategory('${cat.id}')">${cat.name}</button>`
        );
      });

      container.innerHTML = pills.join('');
    }
  } catch (err) {
    console.error('Failed to load categories', err);
  }
}

function selectCategory(catId) {
  currentCategory = catId;
  loadCategories();
  loadProducts();
}

async function loadProducts() {
  const grid = document.getElementById('productGrid');
  grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem;">Loading products...</div>';

  try {
    let url = `/api/products?page=1&limit=50`;
    if (currentCategory) url += `&categoryId=${encodeURIComponent(currentCategory)}`;
    if (currentSearch) url += `&search=${encodeURIComponent(currentSearch)}`;

    const res = await fetch(url);
    const data = await res.json();

    if (!data.success || data.items.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: #64748b;">No products found matching your search.</div>';
      return;
    }

    grid.innerHTML = data.items
      .map((product) => {
        let tagHtml = '<span class="product-tag tag-stock">In Stock</span>';
        if (product.availableStock <= 0) {
          tagHtml = '<span class="product-tag tag-out">Out of Stock</span>';
        } else if (product.availableStock <= 5) {
          tagHtml = `<span class="product-tag tag-low">Only ${product.availableStock} Left</span>`;
        }

        const displayImg = product.images[0] || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80';

        return `
        <div class="product-card">
          <div class="product-img">
            ${tagHtml}
            <img src="${displayImg}" alt="${product.name}" onerror="this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80'" />
          </div>
          <div class="product-info">
            <span class="product-category">${product.category?.name || 'Retail'}</span>
            <h3 class="product-title">${product.name}</h3>
            <div class="product-meta">
              <span class="product-price">₹${product.basePrice.toFixed(2)}</span>
              ${product.averageRating ? `<span style="font-size: 0.85rem; color: #f59e0b;">★ ${product.averageRating.toFixed(1)} (${product.reviewCount})</span>` : ''}
            </div>
            <p style="font-size: 0.85rem; color: #64748b; margin-bottom: 1rem; flex: 1;">${(product.description || '').substring(0, 75)}...</p>
            <button class="btn btn-primary" onclick="openProductQuickView('${product.slug}')">
              ${product.availableStock > 0 ? 'Select & Add to Cart' : 'Out of Stock'}
            </button>
          </div>
        </div>
      `;
      })
      .join('');
  } catch (err) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #ef4444;">Error loading catalogue items.</div>';
  }
}

// Product Quick View Modal
async function openProductQuickView(slug) {
  try {
    const res = await fetch(`/api/products/${slug}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const product = data.data;
    document.getElementById('modalProductTitle').textContent = product.name;
    document.getElementById('modalProductDesc').textContent = product.description || 'No description available.';
    document.getElementById('modalProductPrice').textContent = `₹${product.basePrice.toFixed(2)}`;

    const variantContainer = document.getElementById('modalVariantsContainer');
    if (product.variants.length > 0) {
      selectedVariantId = product.variants[0].id;
      variantContainer.innerHTML = product.variants
        .map((v, idx) => `
          <label style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; cursor: pointer; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 6px;">
            <input type="radio" name="modalVariant" value="${v.id}" ${idx === 0 ? 'checked' : ''} onchange="selectedVariantId = '${v.id}'; document.getElementById('modalProductPrice').textContent = '₹${v.price.toFixed(2)}';" />
            <div style="flex: 1;">
              <strong>${v.name}</strong> (${v.sku})
              <div style="font-size: 0.8rem; color: #64748b;">Available: ${v.availableQuantity} units</div>
            </div>
            <strong style="color: #2563eb;">₹${v.price.toFixed(2)}</strong>
          </label>
        `)
        .join('');
    } else {
      variantContainer.innerHTML = '<div>Standard Variant</div>';
    }

    openModal('quickViewModal');
  } catch (err) {
    showToast(err.message, true);
  }
}

async function addQuickViewItemToCart() {
  if (!selectedVariantId) {
    showToast('Please select a variant', true);
    return;
  }
  const qty = parseInt(document.getElementById('modalProductQty').value, 10) || 1;
  await addToCart(selectedVariantId, qty);
  closeModal('quickViewModal');
}

// Shopping Cart
function getAuthHeader() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchCart() {
  try {
    const res = await fetch('/api/cart', {
      headers: { ...getAuthHeader() }
    });
    const data = await res.json();
    if (data.success) {
      currentCart = data.data;
      renderCart(currentCart);
    }
  } catch (err) {
    console.error('Failed to fetch cart', err);
  }
}

function renderCart(cart) {
  const countBadge = document.getElementById('cartCountBadge');
  countBadge.textContent = cart.itemCount;

  const itemsContainer = document.getElementById('cartDrawerItems');
  if (cart.items.length === 0) {
    itemsContainer.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem; color: #64748b;">
        <p style="font-size: 1.1rem; margin-bottom: 1rem;">Your shopping cart is empty.</p>
        <button class="btn btn-outline" onclick="toggleCartDrawer()">Explore Catalog</button>
      </div>
    `;
    document.getElementById('cartDrawerSubtotal').textContent = '₹0.00';
    document.getElementById('cartDrawerDiscount').textContent = '-₹0.00';
    document.getElementById('cartDrawerTax').textContent = '₹0.00';
    document.getElementById('cartDrawerTotal').textContent = '₹0.00';
    return;
  }

  itemsContainer.innerHTML = cart.items
    .map((item) => `
      <div class="cart-item">
        <img class="cart-item-img" src="${item.image || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=150&q=80'}" alt="${item.productName}" />
        <div class="cart-item-details">
          <div class="cart-item-name">${item.productName}</div>
          <div class="cart-item-variant">${item.variantName} (${item.sku})</div>
          <div style="font-weight: 700; color: #2563eb; margin-bottom: 0.4rem;">₹${item.unitPrice.toFixed(2)}</div>
          <div class="cart-item-qty">
            <button class="qty-btn" onclick="updateCartItemQty('${item.id}', ${item.quantity - 1})">-</button>
            <span style="font-weight: 600; font-size: 0.9rem;">${item.quantity}</span>
            <button class="qty-btn" onclick="updateCartItemQty('${item.id}', ${item.quantity + 1})">+</button>
            <button class="btn-icon" style="margin-left: auto; color: #ef4444;" onclick="removeCartItem('${item.id}')" title="Remove">✕</button>
          </div>
        </div>
      </div>
    `)
    .join('');

  document.getElementById('cartDrawerSubtotal').textContent = `₹${cart.subtotal.toFixed(2)}`;
  document.getElementById('cartDrawerDiscount').textContent = `-₹${cart.discountAmount.toFixed(2)}`;
  document.getElementById('cartDrawerTax').textContent = `₹${cart.taxAmount.toFixed(2)}`;
  document.getElementById('cartDrawerTotal').textContent = `₹${cart.totalAmount.toFixed(2)}`;
}

async function addToCart(variantId, quantity = 1) {
  try {
    const res = await fetch('/api/cart/items', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ variantId, quantity })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    currentCart = data.data;
    renderCart(currentCart);
    showToast('Item added to cart!');
    toggleCartDrawer(true);
  } catch (err) {
    showToast(err.message, true);
  }
}

async function updateCartItemQty(itemId, newQty) {
  if (newQty <= 0) {
    await removeCartItem(itemId);
    return;
  }

  try {
    const res = await fetch(`/api/cart/items/${itemId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ quantity: newQty })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    currentCart = data.data;
    renderCart(currentCart);
  } catch (err) {
    showToast(err.message, true);
  }
}

async function removeCartItem(itemId) {
  try {
    const res = await fetch(`/api/cart/items/${itemId}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() }
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    currentCart = data.data;
    renderCart(currentCart);
    showToast('Item removed from cart');
  } catch (err) {
    showToast(err.message, true);
  }
}

async function applyCoupon() {
  const code = document.getElementById('couponInput').value.trim();
  if (!code) return;

  try {
    const res = await fetch('/api/cart/coupon', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ couponCode: code })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    currentCart = data.data;
    renderCart(currentCart);
    showToast(`Coupon '${code.toUpperCase()}' applied successfully!`);
  } catch (err) {
    showToast(err.message, true);
  }
}

// Checkout & Delivery Checking
function proceedToCheckout() {
  if (!currentCart || currentCart.items.length === 0) {
    showToast('Shopping cart is empty', true);
    return;
  }
  toggleCartDrawer(false);

  // Pre-fill user data if logged in
  if (currentUser) {
    document.getElementById('checkoutEmail').value = currentUser.email || '';
    document.getElementById('checkoutName').value = currentUser.name || '';
  }

  updateCheckoutSummary();
  openModal('checkoutModal');
}

async function checkPinCodeAvailability() {
  const pin = document.getElementById('checkoutPin').value.trim();
  const notice = document.getElementById('pinCodeNotice');
  if (pin.length < 3) return;

  notice.textContent = 'Checking delivery zones...';
  notice.style.color = '#64748b';

  try {
    const res = await fetch(`/api/delivery/check?pinCode=${encodeURIComponent(pin)}&orderSubtotal=${currentCart.subtotal}`);
    const data = await res.json();

    if (data.success && data.data.serviceable) {
      const info = data.data;
      const feeText = info.isFreeDelivery ? 'FREE Delivery Eligible!' : `Delivery Fee: ₹${info.deliveryFee}`;
      notice.textContent = `✔ Serviceable Zone: ${info.zoneName} (${feeText}, Est. ~${info.estimatedDeliveryHours}h)`;
      notice.style.color = '#16a34a';
      updateCheckoutSummary(info.deliveryFee);
    } else {
      notice.textContent = `✖ Sorry, PIN ${pin} is outside our local delivery zone. Store pickup is available.`;
      notice.style.color = '#dc2626';
      updateCheckoutSummary(0);
    }
  } catch {
    notice.textContent = 'Unable to check PIN code availability';
  }
}

function updateCheckoutSummary(deliveryFee = 0) {
  if (!currentCart) return;
  const isPickup = document.getElementById('deliveryTypePickup')?.checked;
  const effectiveDeliveryFee = isPickup ? 0 : deliveryFee;

  document.getElementById('checkoutSubtotal').textContent = `₹${currentCart.subtotal.toFixed(2)}`;
  document.getElementById('checkoutDiscount').textContent = `-₹${currentCart.discountAmount.toFixed(2)}`;
  document.getElementById('checkoutDeliveryFee').textContent = effectiveDeliveryFee > 0 ? `₹${effectiveDeliveryFee.toFixed(2)}` : 'FREE';
  document.getElementById('checkoutTax').textContent = `₹${currentCart.taxAmount.toFixed(2)}`;

  const finalTotal = currentCart.subtotal - currentCart.discountAmount + currentCart.taxAmount + effectiveDeliveryFee;
  document.getElementById('checkoutGrandTotal').textContent = `₹${Math.max(0, finalTotal).toFixed(2)}`;
}

async function submitOrder(event) {
  event.preventDefault();

  const isPickup = document.getElementById('deliveryTypePickup').checked;
  const deliveryType = isPickup ? 'STORE_PICKUP' : 'LOCAL_DELIVERY';
  const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;

  const payload = {
    deliveryType,
    paymentMethod,
    customerEmail: document.getElementById('checkoutEmail').value,
    customerPhone: document.getElementById('checkoutPhone').value,
    notes: document.getElementById('checkoutNotes').value,
    shippingAddress: !isPickup
      ? {
          recipientName: document.getElementById('checkoutName').value,
          phone: document.getElementById('checkoutPhone').value,
          streetAddress: document.getElementById('checkoutAddress').value,
          city: document.getElementById('checkoutCity').value,
          state: document.getElementById('checkoutState').value,
          pinCode: document.getElementById('checkoutPin').value
        }
      : undefined
  };

  try {
    const res = await fetch('/api/orders/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const order = data.data;
    closeModal('checkoutModal');
    fetchCart();

    // Order confirmation modal
    document.getElementById('confirmedOrderNumber').textContent = order.orderNumber;
    document.getElementById('confirmedTotal').textContent = `₹${order.totalAmount.toFixed(2)}`;
    document.getElementById('confirmedPaymentMethod').textContent = order.paymentMethod;
    const invoiceUrl = `/api/invoices/${order.id}/render${order.guestAccessToken ? `?token=${encodeURIComponent(order.guestAccessToken)}` : ''}`;
    document.getElementById('viewInvoiceLink').href = invoiceUrl;

    // Razorpay online payment integration
    const razorpayBtn = document.getElementById('razorpayPayNowBtn');
    const mockPayBtn = document.getElementById('mockPayNowBtn');
    if (order.paymentMethod === 'ONLINE_RAZORPAY' || order.paymentMethod === 'ONLINE_STRIPE') {
      razorpayBtn.style.display = 'inline-block';
      razorpayBtn.onclick = () => triggerRazorpayPayment(order);
    } else {
      razorpayBtn.style.display = 'none';
    }
    if (mockPayBtn) mockPayBtn.style.display = 'none';

    openModal('orderSuccessModal');
    showToast(`Order #${order.orderNumber} placed successfully!`);
  } catch (err) {
    showToast(err.message, true);
  }
}

async function triggerRazorpayPayment(order) {
  try {
    const res = await fetch('/api/payments/create-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ orderId: order.id })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const rzpOptions = {
      key: data.data.keyId,
      amount: data.data.amount,
      currency: data.data.currency,
      name: 'ALGIONS Retail Mart',
      description: `Payment for Order #${order.orderNumber}`,
      order_id: data.data.razorpayOrderId,
      prefill: {
        email: order.customerEmail,
        contact: order.customerPhone
      },
      handler: async function (response) {
        try {
          const verifyRes = await fetch('/api/payments/verify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...getAuthHeader()
            },
            body: JSON.stringify({
              orderId: order.id,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature
            })
          });
          const verifyData = await verifyRes.json();
          if (!verifyData.success) throw new Error(verifyData.error);

          showToast('Payment verified successfully! Order marked as PAID.');
          document.getElementById('confirmedPaymentMethod').textContent = 'ONLINE_RAZORPAY (PAID)';
          const rzpBtn = document.getElementById('razorpayPayNowBtn');
          if (rzpBtn) rzpBtn.style.display = 'none';
        } catch (vErr) {
          showToast('Payment verification failed: ' + vErr.message, true);
        }
      },
      theme: { color: '#2563eb' }
    };

    if (typeof Razorpay !== 'undefined') {
      const rzp = new Razorpay(rzpOptions);
      rzp.open();
    } else {
      showToast('Razorpay Checkout SDK not loaded. Please refresh.', true);
    }
  } catch (err) {
    showToast(err.message, true);
  }
}

// Track Order Lookup using Safe Public Tracking Endpoint
async function trackOrder() {
  const orderNum = document.getElementById('trackOrderInput').value.trim();
  if (!orderNum) return;

  const resultContainer = document.getElementById('trackOrderResult');
  resultContainer.innerHTML = 'Searching order record...';

  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderNum)}/track`);
    const data = await res.json();

    if (!data.success) {
      resultContainer.innerHTML = `<span style="color: #ef4444;">Order not found. Check order number and try again.</span>`;
      return;
    }

    const o = data.data;
    resultContainer.innerHTML = `
      <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 1rem; margin-top: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <strong>Order: ${o.orderNumber}</strong>
          <span class="product-tag tag-stock">${o.status}</span>
        </div>
        <div style="font-size: 0.9rem; color: #475569;">Placed: ${new Date(o.createdAt).toLocaleString()}</div>
        <div style="font-size: 0.9rem; color: #475569;">Delivery Mode: ${o.deliveryType} (${o.itemCount} item(s))</div>
      </div>
    `;
  } catch (err) {
    resultContainer.innerHTML = `<span style="color: #ef4444;">Error retrieving order tracking.</span>`;
  }
}

// UI Controls
function toggleCartDrawer(forceOpen) {
  const drawer = document.getElementById('cartDrawer');
  const backdrop = document.getElementById('drawerBackdrop');
  const open = forceOpen !== undefined ? forceOpen : !drawer.classList.contains('active');

  if (open) {
    drawer.classList.add('active');
    backdrop.classList.add('active');
  } else {
    drawer.classList.remove('active');
    backdrop.classList.remove('active');
  }
}

function openModal(id) {
  const modal = document.getElementById(id);
  const backdrop = document.getElementById('drawerBackdrop');
  if (modal) {
    modal.classList.add('active');
    backdrop.classList.add('active');
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  const backdrop = document.getElementById('drawerBackdrop');
  if (modal) modal.classList.remove('active');
  if (backdrop && !document.getElementById('cartDrawer').classList.contains('active')) {
    backdrop.classList.remove('active');
  }
}
