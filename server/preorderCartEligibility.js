// Include orders already created for this round so removing other cart rows
// cannot make a successfully ordered product appear below its minimum.
export async function getBelowMinimumCartIds(db, cartIds) {
  if (!cartIds.length) return new Set()
  const [rows] = await db.query(
    `SELECT c.cart_id
     FROM cart c
     JOIN preorder_rounds r ON r.round_id = c.preorder_round_id
     JOIN preorder_round_products prp
       ON prp.round_id = c.preorder_round_id AND prp.prod_id = c.prod_id
     WHERE c.cart_id IN (?) AND c.item_type = 'preorder'
       AND LOWER(r.status) IN ('closed', 'archived')
       AND COALESCE(prp.minimum_order_qty, 0) > (
         COALESCE((SELECT SUM(reserved.qty) FROM cart reserved
           WHERE reserved.preorder_round_id = c.preorder_round_id
             AND reserved.prod_id = c.prod_id AND reserved.item_type = 'preorder'), 0)
         + COALESCE((SELECT SUM(od.qty) FROM order_details od
           WHERE od.preorder_round_id = c.preorder_round_id
             AND od.prod_id = c.prod_id AND od.item_type = 'preorder'), 0)
       )`,
    [cartIds],
  )
  return new Set(rows.map((row) => Number(row.cart_id)))
}
