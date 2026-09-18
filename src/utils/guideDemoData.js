import { GUIDE_ENABLED } from '../config/guide'

export function isGuideMode(route) {
  return GUIDE_ENABLED && String(route?.query?.guide || '') === '1'
}

export const GUIDE_CATEGORIES = [
  { id: 901, name: 'อาหารแมว', icon: '/images/category-icons/dry-cat-food.png' },
  { id: 902, name: 'ขนมแมว', icon: '/images/category-icons/cat-treats.png' },
  { id: 903, name: 'สินค้าแนะนำ', icon: '/images/category-icons/best-seller.png' },
]

export const GUIDE_PRODUCTS = [
  {
    id: 9901,
    name: 'Meowverse Tuna Delight',
    description: 'อาหารแมวเนื้อปลาทูน่า สูตรย่อยง่าย เหมาะสำหรับแมวโต',
    flavors: ['ทูน่า', 'แซลมอน'],
    flavorStock: { ทูน่า: 12, แซลมอน: 8 },
    flavorPrices: { ทูน่า: { readyPrice: 289, preorderPrice: 269 }, แซลมอน: { readyPrice: 299, preorderPrice: 279 } },
    price: 289,
    preorderPrice: 269,
    stock: 20,
    image: '/images/cat.jpg',
    imageUrls: ['/images/cat.jpg'],
    images: [{ url: '/images/cat.jpg', flavor: '' }],
    categoryId: 901,
    categoryName: 'อาหารแมว',
    readyToShipEnabled: true,
    preorderEnabled: true,
    isReadyToShip: true,
    isPreorder: true,
    isRecommended: true,
    preorderRoundId: 1,
    chinaShippingFeeThb: 35,
  },
  {
    id: 9902,
    name: 'Freeze-Dried Chicken Bites',
    description: 'ขนมแมวฟรีซดรายจากเนื้อไก่แท้ ชิ้นพอดีคำ',
    flavors: ['ไก่'],
    flavorStock: { ไก่: 24 },
    flavorPrices: { ไก่: { readyPrice: 159, preorderPrice: null } },
    price: 159,
    preorderPrice: 159,
    stock: 24,
    image: '/images/cat.jpg',
    imageUrls: ['/images/cat.jpg'],
    images: [{ url: '/images/cat.jpg', flavor: '' }],
    categoryId: 902,
    categoryName: 'ขนมแมว',
    readyToShipEnabled: true,
    preorderEnabled: false,
    isReadyToShip: true,
    isPreorder: false,
    isRecommended: true,
    preorderRoundId: null,
    chinaShippingFeeThb: 0,
  },
  {
    id: 9903,
    name: 'Cat Lounge Scratcher',
    description: 'ที่ลับเล็บและที่พักสำหรับเจ้าเหมียว',
    flavors: [],
    flavorStock: {},
    flavorPrices: {},
    price: 490,
    preorderPrice: 450,
    stock: 0,
    image: '/images/cat.jpg',
    imageUrls: ['/images/cat.jpg'],
    images: [{ url: '/images/cat.jpg', flavor: '' }],
    categoryId: 903,
    categoryName: 'สินค้าแนะนำ',
    readyToShipEnabled: false,
    preorderEnabled: true,
    isReadyToShip: false,
    isPreorder: true,
    isRecommended: true,
    preorderRoundId: 1,
    chinaShippingFeeThb: 80,
  },
]

export const GUIDE_CART_ITEMS = [
  {
    cart_id: 'guide-ready-1', user_id: 'guide-user', prod_id: 9902, qty: 2,
    name: 'Freeze-Dried Chicken Bites', price: 159, image: '/images/cat.jpg', flavor: 'ไก่', stock: 24,
    isPreorder: false, pre_item_id: null,
  },
  {
    cart_id: 'guide-preorder-1', user_id: 'guide-user', prod_id: 9901, qty: 1,
    name: 'Meowverse Tuna Delight', price: 269, image: '/images/cat.jpg', flavor: 'ทูน่า', stock: 999,
    isPreorder: true, pre_item_id: 99001, preorder_round_status: 'active', preorderRemaining: 20,
  },
]

export const GUIDE_ORDERS = [
  {
    order_id: 'DEMO-1001', Order_type: 'Ready', status: 'Shipped', created_at: '2026-09-18T10:30:00.000Z',
    total_amount: 318, tracking_number: 'TH1234567890', shipping_provider_name: 'Flash Express',
    items: [{ id: 'guide-order-item-1', name: 'Freeze-Dried Chicken Bites', flavor: 'ไก่', qty: 2, unit_price: 159, image: '/images/cat.jpg' }],
  },
  {
    order_id: 'DEMO-1002', Order_type: 'Preorder', status: 'Pending_import_fee', created_at: '2026-09-17T08:15:00.000Z',
    total_amount: 269, import_fee_total: 35, tracking_number: '', shipping_provider_name: '',
    items: [{ id: 'guide-order-item-2', name: 'Meowverse Tuna Delight', flavor: 'ทูน่า', qty: 1, unit_price: 269, image: '/images/cat.jpg' }],
  },
]
