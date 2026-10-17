let currentAdminUser = null;

document.addEventListener('DOMContentLoaded', () => {
  checkAdminAuth();
});

function getAuthHeader() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function checkAdminAuth() {
  const token = localStorage.getItem('token');
  if (!token) {
    showLoginModal();
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();

    if (!data.success || !data.data || data.data.role === 'CUSTOMER') {
      localStorage.removeItem('token');
      showLoginModal();
      return;
    }

    currentAdminUser = data.data;
    document.getElementById('adminUserName').textContent = currentAdminUser.name;
    document.getElementById('adminUserRole').textContent = currentAdminUser.role;
    hideLoginModal();
    loadDashboard();
  } catch {
    showLoginModal();
  }
}

function showLoginModal() {
  document.getElementById('loginModalOverlay').classList.add('active');
}

function hideLoginModal() {
  document.getElementById('loginModalOverlay').classList.remove('active');
}

async function handleAdminLogin(event) {
  event.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const errorMsg = document.getElementById('loginErrorMsg');
  errorMsg.textContent = '';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (!data.success) throw new Error(data.error);

    if (data.data.user.role === 'CUSTOMER') {
      throw new Error('Access denied: Staff or Administrator account required');
    }

    localStorage.setItem('token', data.data.accessToken);
    currentAdminUser = data.data.user;
    document.getElementById('adminUserName').textContent = currentAdminUser.name;
    document.getElementById('adminUserRole').textContent = currentAdminUser.role;
    hideLoginModal();
    loadDashboard();
  } catch (err) {
    errorMsg.textContent = err.message;
  }
}

function adminLogout() {
  localStorage.removeItem('token');
  location.reload();
}

function switchTab(sectionId, element) {
  document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach((i) => i.classList.remove('active'));

  const target = document.getElementById(sectionId);
  if (target) target.classList.add('active');
  if (element) element.classList.add('active');

  if (sectionId === 'secDashboard') loadDashboard();
  if (sectionId === 'secProducts') loadProducts();
  if (sectionId === 'secCategories') loadCategories();
  if (sectionId === 'secInventory') loadInventory();
  if (sectionId === 'secOrders') loadOrders();
  if (sectionId === 'secDelivery') loadDelivery();
  if (sectionId === 'secCoupons') loadCoupons();
  if (sectionId === 'secAudit') loadAuditLogs();
}

// 1. Dashboard
async function loadDashboard() {
  try {
    const res = await fetch('/api/reports/dashboard', { headers: getAuthHeader() });
    const data = await res.json();
    if (!data.success) return;

    const s = data.data;
    document.getElementById('statRevenue').textContent = `₹${s.totalRevenue.toFixed(2)}`;
    document.getElementById('statOrders').textContent = s.totalOrders;
    document.getElementById('statProducts').textContent = s.activeProducts;
    document.getElementById('statLowStock').textContent = s.lowStockItems;

    // Recent orders table
    const tableBody = document.getElementById('dashboardRecentOrders');
    tableBody.innerHTML = s.recentOrders
      .map(
        (o) => `
        <tr>
          <td><strong>${o.orderNumber}</strong></td>
          <td>${o.customerEmail}</td>
          <td>₹${o.totalAmount.toFixed(2)}</td>
          <td><span class="status-badge badge-${o.status.toLowerCase()}">${o.status}</span></td>
          <td>${new Date(o.createdAt).toLocaleDateString()}</td>
        </tr>
      `
      )
      .join('');
  } catch (err) {
    console.error('Failed to load dashboard', err);
  }
}

// 2. Products
async function loadProducts() {
  try {
    const res = await fetch('/api/products?limit=100');
    const data = await res.json();
    if (!data.success) return;

    const tbody = document.getElementById('productsTableBody');
    tbody.innerHTML = data.items
      .map(
        (p) => `
        <tr>
          <td>
            <strong>${p.name}</strong>
            <div style="font-size: 0.8rem; color: #64748b;">${p.slug}</div>
          </td>
          <td><code>${p.sku}</code></td>
          <td>${p.category?.name || 'Unassigned'}</td>
          <td>₹${p.basePrice.toFixed(2)}</td>
          <td><strong>${p.availableStock}</strong> units (${p.variantsCount} variants)</td>
          <td>
            <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')">Delete</button>
          </td>
        </tr>
      `
      )
      .join('');
  } catch (err) {
    console.error(err);
  }
}

async function handleCreateProduct(event) {
  event.preventDefault();
  const name = document.getElementById('prodName').value;
  const sku = document.getElementById('prodSku').value;
  const basePrice = parseFloat(document.getElementById('prodPrice').value);
  const categoryId = document.getElementById('prodCategory').value || undefined;
  const initialStock = parseInt(document.getElementById('prodStock').value, 10) || 10;
  const description = document.getElementById('prodDesc').value;

  // Check if image file was selected
  const imageInput = document.getElementById('prodImageFile');
  let imageUrls = [];

  if (imageInput.files.length > 0) {
    const formData = new FormData();
    formData.append('image', imageInput.files[0]);

    try {
      const uploadRes = await fetch('/api/products/upload-image', {
        method: 'POST',
        headers: getAuthHeader(),
        body: formData
      });
      const uploadData = await uploadRes.json();
      if (uploadData.success) {
        imageUrls.push(uploadData.data.url);
      }
    } catch (err) {
      console.warn('Image upload error', err);
    }
  }

  const payload = {
    name,
    sku,
    basePrice,
    categoryId,
    description,
    images: imageUrls,
    variants: [
      {
        name: 'Standard',
        sku,
        price: basePrice,
        initialStock,
        lowStockThreshold: 5
      }
    ]
  };

  try {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    alert('Product created successfully!');
    document.getElementById('createProductForm').reset();
    closeAdminModal('addProductModal');
    loadProducts();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteProduct(id) {
  if (!confirm('Are you sure you want to delete this product?')) return;

  try {
    const res = await fetch(`/api/products/${id}`, {
      method: 'DELETE',
      headers: getAuthHeader()
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    loadProducts();
  } catch (err) {
    alert(err.message);
  }
}

// 3. Categories
async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const data = await res.json();
    if (!data.success) return;

    // Populate table
    const tbody = document.getElementById('categoriesTableBody');
    tbody.innerHTML = data.data
      .map(
        (c) => `
        <tr>
          <td><strong>${c.name}</strong></td>
          <td><code>${c.slug}</code></td>
          <td>${c._count?.products || 0} items</td>
          <td>
            <button class="btn btn-danger btn-sm" onclick="deleteCategory('${c.id}')">Delete</button>
          </td>
        </tr>
      `
      )
      .join('');

    // Populate select in product creation form
    const sel = document.getElementById('prodCategory');
    sel.innerHTML = '<option value="">Select Category...</option>' +
      data.data.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
  } catch (err) {
    console.error(err);
  }
}

async function handleCreateCategory(event) {
  event.preventDefault();
  const name = document.getElementById('catName').value;
  const description = document.getElementById('catDesc').value;

  try {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ name, description })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    document.getElementById('createCategoryForm').reset();
    closeAdminModal('addCategoryModal');
    loadCategories();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteCategory(id) {
  if (!confirm('Delete this category?')) return;
  try {
    const res = await fetch(`/api/categories/${id}`, {
      method: 'DELETE',
      headers: getAuthHeader()
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    loadCategories();
  } catch (err) {
    alert(err.message);
  }
}

// 4. Inventory
async function loadInventory() {
  try {
    const [lowRes, logRes] = await Promise.all([
      fetch('/api/inventory/low-stock', { headers: getAuthHeader() }),
      fetch('/api/inventory/logs?limit=25', { headers: getAuthHeader() })
    ]);

    const lowData = await lowRes.json();
    const logData = await logRes.json();

    const lowTbody = document.getElementById('lowStockTableBody');
    if (lowData.success) {
      if (lowData.data.length === 0) {
        lowTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #16a34a; padding: 1.5rem;">All items are well stocked above thresholds!</td></tr>';
      } else {
        lowTbody.innerHTML = lowData.data
          .map(
            (item) => `
            <tr>
              <td><strong>${item.productName}</strong></td>
              <td><code>${item.sku}</code></td>
              <td>${item.stockQuantity}</td>
              <td>${item.reservedQuantity}</td>
              <td><span style="color: #b91c1c; font-weight: 700;">${item.availableQuantity}</span></td>
              <td>
                <button class="btn btn-primary btn-sm" onclick="openRestockModal('${item.variantId}', '${item.productName}')">Restock</button>
              </td>
            </tr>
          `
          )
          .join('');
      }
    }

    const logTbody = document.getElementById('inventoryLogsTableBody');
    if (logData.success) {
      logTbody.innerHTML = logData.data
        .map(
          (l) => `
          <tr>
            <td>${new Date(l.createdAt).toLocaleTimeString()}</td>
            <td>${l.variant?.product?.name || 'Variant'} (${l.variant?.sku})</td>
            <td><strong>${l.changeAmount > 0 ? '+' : ''}${l.changeAmount}</strong></td>
            <td>${l.previousStock} → ${l.newStock}</td>
            <td><span class="status-badge badge-processing">${l.reason}</span></td>
            <td>${l.referenceId || '-'}</td>
          </tr>
        `
        )
        .join('');
    }
  } catch (err) {
    console.error(err);
  }
}

function openRestockModal(variantId, name) {
  document.getElementById('restockVariantId').value = variantId;
  document.getElementById('restockProductName').textContent = name;
  openAdminModal('restockModal');
}

async function handleStockAdjustment(event) {
  event.preventDefault();
  const variantId = document.getElementById('restockVariantId').value;
  const quantityChange = parseInt(document.getElementById('restockQty').value, 10);
  const reason = document.getElementById('restockReason').value;

  try {
    const res = await fetch('/api/inventory/adjust', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ variantId, quantityChange, reason })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    alert('Stock updated successfully!');
    closeAdminModal('restockModal');
    loadInventory();
  } catch (err) {
    alert(err.message);
  }
}

// 5. Orders
async function loadOrders() {
  try {
    const res = await fetch('/api/orders?limit=50', { headers: getAuthHeader() });
    const data = await res.json();
    if (!data.success) return;

    const tbody = document.getElementById('ordersTableBody');
    tbody.innerHTML = data.orders
      .map(
        (o) => `
        <tr>
          <td><strong>${o.orderNumber}</strong></td>
          <td>
            ${o.customerEmail}
            <div style="font-size: 0.8rem; color: #64748b;">${o.customerPhone}</div>
          </td>
          <td>₹${o.totalAmount.toFixed(2)} (${o.paymentMethod})</td>
          <td>
            <select class="form-control" style="padding: 0.3rem;" onchange="updateOrderStatus('${o.id}', this.value)">
              <option value="PENDING" ${o.status === 'PENDING' ? 'selected' : ''}>PENDING</option>
              <option value="PAID" ${o.status === 'PAID' ? 'selected' : ''}>PAID</option>
              <option value="PROCESSING" ${o.status === 'PROCESSING' ? 'selected' : ''}>PROCESSING</option>
              <option value="DISPATCHED" ${o.status === 'DISPATCHED' ? 'selected' : ''}>DISPATCHED</option>
              <option value="DELIVERED" ${o.status === 'DELIVERED' ? 'selected' : ''}>DELIVERED</option>
              <option value="CANCELLED" ${o.status === 'CANCELLED' ? 'selected' : ''}>CANCELLED</option>
            </select>
          </td>
          <td>
            ${o.deliveryStaff?.name || '<button class="btn btn-outline btn-sm" onclick="openAssignStaffModal(\'' + o.id + '\')">Assign Staff</button>'}
          </td>
          <td>
            <a href="/api/invoices/${o.id}/render" target="_blank" class="btn btn-outline btn-sm">Invoice</a>
          </td>
        </tr>
      `
      )
      .join('');
  } catch (err) {
    console.error(err);
  }
}

async function updateOrderStatus(orderId, status) {
  try {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    alert(`Order status updated to ${status}`);
    loadOrders();
  } catch (err) {
    alert(err.message);
  }
}

async function openAssignStaffModal(orderId) {
  document.getElementById('assignOrderId').value = orderId;
  const select = document.getElementById('assignStaffSelect');
  select.innerHTML = '<option>Loading delivery personnel...</option>';

  try {
    const res = await fetch('/api/delivery/staff', { headers: getAuthHeader() });
    const data = await res.json();
    if (data.success && data.data.length > 0) {
      select.innerHTML = data.data.map((s) => `<option value="${s.id}">${s.name} (${s.phone || 'Active'})</option>`).join('');
    } else {
      select.innerHTML = '<option value="">No delivery staff registered yet</option>';
    }
    openAdminModal('assignStaffModal');
  } catch (err) {
    alert('Failed to load staff');
  }
}

async function handleAssignDeliveryStaff(event) {
  event.preventDefault();
  const orderId = document.getElementById('assignOrderId').value;
  const deliveryStaffId = document.getElementById('assignStaffSelect').value;

  try {
    const res = await fetch('/api/delivery/assign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ orderId, deliveryStaffId })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    alert('Staff assigned successfully!');
    closeAdminModal('assignStaffModal');
    loadOrders();
  } catch (err) {
    alert(err.message);
  }
}

// 6. Delivery Zones
async function loadDelivery() {
  try {
    const res = await fetch('/api/delivery/zones');
    const data = await res.json();
    if (!data.success) return;

    const tbody = document.getElementById('zonesTableBody');
    tbody.innerHTML = data.data
      .map(
        (z) => `
        <tr>
          <td><strong>${z.name}</strong></td>
          <td><code style="word-break: break-all;">${z.pinCodes.join(', ')}</code></td>
          <td>₹${z.deliveryFee.toFixed(2)}</td>
          <td>${z.minOrderForFreeDelivery ? 'Free above ₹' + z.minOrderForFreeDelivery : 'Standard fee applies'}</td>
          <td>~${z.estimatedDeliveryHours} hours</td>
        </tr>
      `
      )
      .join('');
  } catch (err) {
    console.error(err);
  }
}

async function handleCreateZone(event) {
  event.preventDefault();
  const name = document.getElementById('zoneName').value;
  const pinCodes = document.getElementById('zonePins').value.split(',').map((p) => p.trim());
  const deliveryFee = parseFloat(document.getElementById('zoneFee').value);
  const minOrderForFreeDelivery = parseFloat(document.getElementById('zoneFreeMin').value) || null;

  try {
    const res = await fetch('/api/delivery/zones', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ name, pinCodes, deliveryFee, minOrderForFreeDelivery })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    document.getElementById('createZoneForm').reset();
    closeAdminModal('addZoneModal');
    loadDelivery();
  } catch (err) {
    alert(err.message);
  }
}

// 7. Coupons
async function loadCoupons() {
  try {
    const res = await fetch('/api/promotions', { headers: getAuthHeader() });
    const data = await res.json();
    if (!data.success) return;

    const tbody = document.getElementById('couponsTableBody');
    tbody.innerHTML = data.data
      .map(
        (c) => `
        <tr>
          <td><strong>${c.code}</strong></td>
          <td>${c.discountType === 'PERCENTAGE' ? c.discountValue + '%' : '₹' + c.discountValue}</td>
          <td>₹${c.minOrderAmount}</td>
          <td>${c.usageCount} / ${c.usageLimit || '∞'}</td>
          <td><span class="status-badge ${c.isActive ? 'badge-paid' : 'badge-cancelled'}">${c.isActive ? 'Active' : 'Inactive'}</span></td>
        </tr>
      `
      )
      .join('');
  } catch (err) {
    console.error(err);
  }
}

async function handleCreateCoupon(event) {
  event.preventDefault();
  const code = document.getElementById('coupCode').value;
  const discountType = document.getElementById('coupType').value;
  const discountValue = parseFloat(document.getElementById('coupValue').value);
  const minOrderAmount = parseFloat(document.getElementById('coupMin').value) || 0;
  const usageLimit = parseInt(document.getElementById('coupLimit').value, 10) || undefined;

  try {
    const res = await fetch('/api/promotions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ code, discountType, discountValue, minOrderAmount, usageLimit })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    document.getElementById('createCouponForm').reset();
    closeAdminModal('addCouponModal');
    loadCoupons();
  } catch (err) {
    alert(err.message);
  }
}

// 8. Audit Logs
async function loadAuditLogs() {
  try {
    const res = await fetch('/api/reports/audit-logs?limit=50', { headers: getAuthHeader() });
    const data = await res.json();
    if (!data.success) return;

    const tbody = document.getElementById('auditTableBody');
    tbody.innerHTML = data.logs
      .map(
        (l) => `
        <tr>
          <td>${new Date(l.createdAt).toLocaleString()}</td>
          <td><strong>${l.action}</strong></td>
          <td>${l.user?.name || 'SYSTEM / GUEST'} (${l.user?.role || '-'})</td>
          <td>${l.entityType} (${l.entityId || '-'})</td>
          <td><code>${l.ipAddress || '127.0.0.1'}</code></td>
        </tr>
      `
      )
      .join('');
  } catch (err) {
    console.error(err);
  }
}

// Modal Helpers
function openAdminModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeAdminModal(id) {
  document.getElementById(id).classList.remove('active');
}
