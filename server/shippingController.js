// ใช้ pool จากไฟล์หลัก หรือเชื่อมต่อใหม่ตามโครงสร้างของคุณ
const getShippingOrders = async (req, res) => {
  const pool = req.app.locals.db; // ดึง database pool จาก app
  try {
    // 1. Query JOIN 4 ตาราง เพื่อดึงข้อมูลออเดอร์ ที่อยู่ และชื่อสินค้า
    const sql = `
      SELECT 
        o.order_id, o.Order_type, o.Order_date, o.total_amount, o.status,
        s.address, s.Shipping_Carrier,
        od.detail_id, od.flavor, od.qty,
        p.prod_name
      FROM orders o
      JOIN shipping s ON o.order_id = s.order_id
      JOIN order_details od ON o.order_id = od.order_id
      LEFT JOIN products p ON od.prod_id = p.prod_id
      WHERE o.status IN ('Paid', 'Ready_to_Ship')
      ORDER BY o.Order_date DESC
    `;

    const [rows] = await pool.query(sql);

    // 2. จัดกลุ่มข้อมูล (Transform) ให้มี details เป็นอาร์เรย์ซ้อนอยู่ข้างใน
    const formattedOrders = rows.reduce((acc, row) => {
      let order = acc.find(o => o.order_id === row.order_id);
      if (!order) {
        order = {
          order_id: row.order_id,
          Order_type: row.Order_type,
          Order_date: row.Order_date,
          total_amount: row.total_amount,
          address: row.address,
          Shipping_Carrier: row.Shipping_Carrier,
          details: [] 
        };
        acc.push(order);
      }
      order.details.push({
        detail_id: row.detail_id,
        prod_name: row.prod_name,
        flavor: row.flavor,
        qty: row.qty
      });
      return acc;
    }, []);

    res.json(formattedOrders);
  } catch (error) {
    console.error('Shipping API Error:', error);
    res.status(500).json({ error: error.message });
  }
};

export default { getShippingOrders };