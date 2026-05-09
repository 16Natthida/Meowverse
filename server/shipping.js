import express from 'express';
import shippingController from './shippingController.js';

const router = express.Router();

// ดึงข้อมูลรายการ (มีอยู่แล้ว)
router.get('/shipping-orders', shippingController.getShippingOrders);

// --- เพิ่มส่วนนี้: สำหรับอัปเดตสถานะ ---
router.patch('/orders/:orderId/status', shippingController.updateOrderStatus);

export default router;