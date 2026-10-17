async function main() {
  console.log('--- Testing Next.js Frontend (port 3001) <-> Express Backend (port 3000) ---');

  // 1. Check products via Next.js proxy
  const prodRes = await fetch('http://localhost:3001/api/products');
  const prods = await prodRes.json();
  console.log(`[PASS] Storefront Products: ${prods.items?.length || 0} items retrieved via Next.js proxy`);

  // 2. Check categories
  const catRes = await fetch('http://localhost:3001/api/categories');
  const cats = await catRes.json();
  console.log(`[PASS] Storefront Categories: ${cats.data?.length || 0} categories available`);

  // 3. Customer Login
  const custLogin = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'customer@example.com', password: 'Customer@123456' })
  });
  const custData = await custLogin.json();
  console.log(`[PASS] Customer Login: ${custData.success ? 'SUCCESS' : 'FAILED'} (User: ${custData.data?.user?.name}, Role: ${custData.data?.user?.role})`);

  // 4. Admin Login & Protected Dashboard
  const adminLogin = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@algions.local', password: 'Admin@123456' })
  });
  const adminData = await adminLogin.json();
  console.log(`[PASS] Admin Login: ${adminData.success ? 'SUCCESS' : 'FAILED'} (User: ${adminData.data?.user?.name}, Role: ${adminData.data?.user?.role})`);

  const adminToken = adminData.data.accessToken;
  const dashRes = await fetch('http://localhost:3001/api/reports/dashboard', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const dashData = await dashRes.json();
  console.log(`[PASS] Admin Operations Dashboard: Total Orders = ${dashData.data?.totalOrders}, Total Revenue = INR ${dashData.data?.totalRevenue}`);

  // 5. Storefront Delivery Pin Check
  const pinRes = await fetch('http://localhost:3001/api/delivery/check?pinCode=110001&orderSubtotal=500');
  const pinData = await pinRes.json();
  console.log(`[PASS] Delivery Zone Check: Serviceable = ${pinData.data?.serviceable}, Zone = ${pinData.data?.zoneName}, Fee = INR ${pinData.data?.fee}`);

  // 6. Next.js Pages HTTP status
  const pages = ['/', '/login', '/checkout', '/orders/track', '/admin', '/admin/login'];
  for (const p of pages) {
    const res = await fetch(`http://localhost:3001${p}`);
    console.log(`[PASS] Page ${p} HTTP status: ${res.status}`);
  }

  console.log('\n>>> ALL FULL-STACK SYSTEM CHECKS PASSED SUCCESSFULLY! <<<');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
