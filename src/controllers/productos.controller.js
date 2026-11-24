const db = require("../database/postgres.database");

// Catálogo público de la tienda (no expone el stock exacto; maximo_pedido se limita a 10)
async function listar(req, res, next) {
  try {
    const { rows } = await db.query(`
      SELECT p.id_producto, p.nombre, p.lote, p.presentacion, p.categoria, p.precio,
             CASE WHEN i.stock_actual IS NULL THEN 'Consultar'
                  WHEN i.stock_actual = 0 THEN 'Agotado'
                  WHEN i.stock_actual < i.stock_minimo THEN 'Últimas piezas'
                  ELSE 'Disponible' END AS disponibilidad,
             CASE WHEN i.stock_actual IS NULL THEN 0 ELSE LEAST(i.stock_actual, 10) END AS maximo_pedido,
             to_char(i.fecha_tostado, 'YYYY-MM-DD') AS fecha_tostado
      FROM productos p JOIN inventario i ON i.id_producto = p.id_producto
      ORDER BY CASE p.categoria WHEN 'Grano' THEN 1 WHEN 'Molido' THEN 2 ELSE 3 END, p.id_producto`);
    res.json(rows.map((r) => ({ ...r, precio: Number(r.precio) })));
  } catch (error) {
    next(error);
  }
}

module.exports = { listar };
