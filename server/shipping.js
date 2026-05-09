import express from 'express';
import shippingController from './shippingController.js';

const router = express.Router();

// กำหนด URL ให้ตรงกับที่เรียกในหน้า Vue
router.get('/shipping-orders', shippingController.getShippingOrders);

export default router;