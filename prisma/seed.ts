import { PrismaClient, Role, DiscountType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding ALGIONS E-Commerce database...');

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.SEED_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD === 'Admin@123456') {
      console.error('CRITICAL SECURITY ERROR: Seeding default demo passwords in production is prohibited. Set SEED_ADMIN_PASSWORD in environment.');
      process.exit(1);
    }
  }

  const adminPass = process.env.SEED_ADMIN_PASSWORD || 'Admin@123456';
  const passwordHash = await bcrypt.hash(adminPass, 12);
  const staffPasswordHash = await bcrypt.hash(process.env.SEED_STAFF_PASSWORD || 'Staff@123456', 12);
  const riderPasswordHash = await bcrypt.hash(process.env.SEED_RIDER_PASSWORD || 'Rider@123456', 12);
  const custPasswordHash = await bcrypt.hash(process.env.SEED_CUST_PASSWORD || 'Customer@123456', 12);

  // 1. Users
  const admin = await prisma.user.upsert({
    where: { email: 'admin@algions.local' },
    update: {},
    create: {
      email: 'admin@algions.local',
      passwordHash,
      name: 'System Administrator',
      phone: '+919876500001',
      role: Role.ADMIN,
      isActive: true,
      emailVerified: true
    }
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager@algions.local' },
    update: {},
    create: {
      email: 'manager@algions.local',
      passwordHash: staffPasswordHash,
      name: 'Store Operations Manager',
      phone: '+919876500002',
      role: Role.MANAGER,
      isActive: true,
      emailVerified: true
    }
  });

  const staff = await prisma.user.upsert({
    where: { email: 'staff@algions.local' },
    update: {},
    create: {
      email: 'staff@algions.local',
      passwordHash: staffPasswordHash,
      name: 'Retail Inventory Staff',
      phone: '+919876500003',
      role: Role.STAFF,
      isActive: true,
      emailVerified: true
    }
  });

  const rider = await prisma.user.upsert({
    where: { email: 'rider@algions.local' },
    update: {},
    create: {
      email: 'rider@algions.local',
      passwordHash: riderPasswordHash,
      name: 'Ramesh Kumar (Express Delivery)',
      phone: '+919876500004',
      role: Role.DELIVERY,
      isActive: true,
      emailVerified: true
    }
  });

  const customer = await prisma.user.upsert({
    where: { email: 'customer@example.com' },
    update: {},
    create: {
      email: 'customer@example.com',
      passwordHash: custPasswordHash,
      name: 'Priya Sharma',
      phone: '+919876500005',
      role: Role.CUSTOMER,
      isActive: true,
      emailVerified: true
    }
  });

  console.log('Default accounts created (Admin, Manager, Staff, Delivery Rider, Customer)');

  // 2. Categories
  const catGroceries = await prisma.category.upsert({
    where: { slug: 'groceries' },
    update: {},
    create: {
      name: 'Groceries & Daily Essentials',
      slug: 'groceries',
      description: 'Daily fresh grocery items, pulses, oils, flours and staples'
    }
  });

  const catSweets = await prisma.category.upsert({
    where: { slug: 'sweets' },
    update: {},
    create: {
      name: 'Traditional Sweets & Confectionery',
      slug: 'sweets',
      description: 'Fresh ghee sweets, regional delicacies, and festive treats'
    }
  });

  const catClothing = await prisma.category.upsert({
    where: { slug: 'clothing' },
    update: {},
    create: {
      name: 'Clothing & Everyday Apparel',
      slug: 'clothing',
      description: 'Pure cotton casual shirts, comfortable t-shirts, and apparel'
    }
  });

  const catElectronics = await prisma.category.upsert({
    where: { slug: 'electronics' },
    update: {},
    create: {
      name: 'Electronics & Fast Accessories',
      slug: 'electronics',
      description: 'Chargers, audio gear, cables, and home tech accessories'
    }
  });

  // 3. Products, Variants & Inventory
  const productsData = [
    {
      name: 'Organic Royal Basmati Rice',
      slug: 'organic-royal-basmati-rice',
      description: 'Aged long-grain aromatic basmati rice for biryanis and everyday royal dining.',
      basePrice: 145.0,
      sku: 'GROC-RICE-01',
      categoryId: catGroceries.id,
      images: JSON.stringify(['https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=400&q=80']),
      variants: [
        { name: '1 kg Pouch', sku: 'GROC-RICE-1KG', price: 145.0, stock: 50 },
        { name: '5 kg Family Bag', sku: 'GROC-RICE-5KG', price: 680.0, stock: 25 }
      ]
    },
    {
      name: 'Cold-Pressed Pure Mustard Oil',
      slug: 'cold-pressed-mustard-oil',
      description: 'Traditional wood-pressed kachi ghani mustard oil with intense natural aroma and pungency.',
      basePrice: 180.0,
      sku: 'GROC-OIL-01',
      categoryId: catGroceries.id,
      images: JSON.stringify(['https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=400&q=80']),
      variants: [
        { name: '1 Litre Bottle', sku: 'GROC-OIL-1L', price: 180.0, stock: 40 }
      ]
    },
    {
      name: 'Royal Cashew Kaju Katli',
      slug: 'royal-cashew-kaju-katli',
      description: 'Exquisite diamond-shaped melt-in-mouth sweets prepared with prime grade cashews and pure silver vark.',
      basePrice: 280.0,
      sku: 'SWT-KAJU-01',
      categoryId: catSweets.id,
      images: JSON.stringify(['https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=400&q=80']),
      variants: [
        { name: '250 grams Gift Box', sku: 'SWT-KAJU-250G', price: 280.0, stock: 35 },
        { name: '500 grams Festive Box', sku: 'SWT-KAJU-500G', price: 540.0, stock: 20 }
      ]
    },
    {
      name: 'Shahi Pure Ghee Besan Ladoo',
      slug: 'shahi-pure-ghee-besan-ladoo',
      description: 'Aromatic roasted gram flour ladoos enriched with deshi cow ghee, cardamom, and chopped almonds.',
      basePrice: 220.0,
      sku: 'SWT-LADOO-01',
      categoryId: catSweets.id,
      images: JSON.stringify(['https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=400&q=80']),
      variants: [
        { name: '400 grams Box', sku: 'SWT-LADOO-400G', price: 220.0, stock: 30 }
      ]
    },
    {
      name: 'Premium Combed Cotton Crewneck T-Shirt',
      slug: 'premium-combed-cotton-tshirt',
      description: 'Super-soft 180 GSM bio-washed breathable cotton t-shirt for effortless all-day comfort.',
      basePrice: 499.0,
      sku: 'APP-TSHIRT-01',
      categoryId: catClothing.id,
      images: JSON.stringify(['https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=400&q=80']),
      variants: [
        { name: 'Medium - Navy Blue', sku: 'APP-TSHIRT-M-NV', price: 499.0, stock: 25 },
        { name: 'Large - Navy Blue', sku: 'APP-TSHIRT-L-NV', price: 499.0, stock: 25 },
        { name: 'XL - Navy Blue', sku: 'APP-TSHIRT-XL-NV', price: 499.0, stock: 15 }
      ]
    },
    {
      name: '65W GaN Ultra-Fast Dual USB-C Charger',
      slug: '65w-gan-fast-charger',
      description: 'Compact Gallium Nitride (GaN) fast charger compatible with laptops, phones, and tablets.',
      basePrice: 1299.0,
      sku: 'ELEC-GAN-65W',
      categoryId: catElectronics.id,
      images: JSON.stringify(['https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=400&q=80']),
      variants: [
        { name: 'Standard White', sku: 'ELEC-GAN-65W-W', price: 1299.0, stock: 18 }
      ]
    }
  ];

  for (const p of productsData) {
    const existing = await prisma.product.findUnique({ where: { slug: p.slug } });
    if (!existing) {
      const created = await prisma.product.create({
        data: {
          name: p.name,
          slug: p.slug,
          description: p.description,
          basePrice: p.basePrice,
          sku: p.sku,
          categoryId: p.categoryId,
          images: p.images
        }
      });

      for (const v of p.variants) {
        const variant = await prisma.productVariant.create({
          data: {
            productId: created.id,
            sku: v.sku,
            name: v.name,
            price: v.price
          }
        });

        await prisma.inventoryItem.create({
          data: {
            variantId: variant.id,
            stockQuantity: v.stock,
            reservedQuantity: 0,
            lowStockThreshold: 5
          }
        });

        await prisma.inventoryLog.create({
          data: {
            variantId: variant.id,
            changeAmount: v.stock,
            previousStock: 0,
            newStock: v.stock,
            reason: 'INITIAL_SEED',
            performedBy: admin.id
          }
        });
      }
    }
  }

  console.log('Sample retail products, variants and inventory items generated.');

  // 4. Delivery Zones
  await prisma.deliveryZone.createMany({
    data: [
      {
        name: 'Central City Sector',
        pinCodes: '560001, 560002, 560025, 560009',
        deliveryFee: 30.0,
        minOrderForFreeDelivery: 350.0,
        estimatedDeliveryHours: 4
      },
      {
        name: 'East District & Tech Corridor',
        pinCodes: '560038, 560075, 560008, 560066',
        deliveryFee: 40.0,
        minOrderForFreeDelivery: 500.0,
        estimatedDeliveryHours: 6
      },
      {
        name: 'South Sector & Residential Enclave',
        pinCodes: '560034, 560095, 560068, 560076',
        deliveryFee: 45.0,
        minOrderForFreeDelivery: 600.0,
        estimatedDeliveryHours: 8
      }
    ]
  });

  // 5. Promotional Coupons
  await prisma.coupon.createMany({
    data: [
      {
        code: 'SAVE10',
        discountType: DiscountType.PERCENTAGE,
        discountValue: 10.0,
        minOrderAmount: 200.0,
        maxDiscountAmount: 150.0,
        usageLimit: 1000
      },
      {
        code: 'WELCOME50',
        discountType: DiscountType.FIXED,
        discountValue: 50.0,
        minOrderAmount: 300.0,
        usageLimit: 500
      },
      {
        code: 'FESTIVE20',
        discountType: DiscountType.PERCENTAGE,
        discountValue: 20.0,
        minOrderAmount: 800.0,
        maxDiscountAmount: 300.0,
        usageLimit: 200
      }
    ]
  });

  console.log('Delivery service zones and coupons seeded successfully.');
  console.log('Database seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
