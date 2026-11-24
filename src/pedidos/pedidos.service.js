// Pedidos de la tienda: validan existencias, descuentan inventario y se
// registran como ventas del canal Web en la fecha de corte de los datos.
const db = require("../database/postgres.database");

const MAX_PARTIDAS = 20;
const MAX_CANTIDAD = 10;

function errorPedido(status, message) {
  return Object.assign(new Error(message), { status, codigo: "PEDIDO_INVALIDO" });
}

// Validación de forma (sin base de datos). Junta partidas repetidas del mismo producto.
function validarPedido(cuerpo) {
  const partidas = cuerpo?.partidas;
  if (!Array.isArray(partidas) || partidas.length === 0) throw errorPedido(400, "El pedido no tiene productos");
  if (partidas.length > MAX_PARTIDAS) throw errorPedido(400, `Máximo ${MAX_PARTIDAS} productos por pedido`);
  const juntas = new Map();
  for (const p of partidas) {
    const id = String(p?.idProducto ?? "").trim().toUpperCase();
    const cantidad = Number(p?.cantidad);
    if (!/^CP-\d{3}$/.test(id)) throw errorPedido(400, `Clave de producto inválida: "${p?.idProducto ?? ""}"`);
    if (!Number.isInteger(cantidad) || cantidad < 1) throw errorPedido(400, `Cantidad inválida para ${id}`);
    juntas.set(id, (juntas.get(id) ?? 0) + cantidad);
  }
  for (const [id, cantidad] of juntas) {
    if (cantidad > MAX_CANTIDAD) throw errorPedido(400, `Máximo ${MAX_CANTIDAD} unidades de ${id} por pedido`);
  }
  const cliente = String(cuerpo.cliente ?? "").trim().slice(0, 80) || null;
  return { cliente, partidas: [...juntas].map(([idProducto, cantidad]) => ({ idProducto, cantidad })) };
}

async function crear(cuerpo) {
  const { cliente, partidas } = validarPedido(cuerpo);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT p.id_producto, p.nombre, p.precio, i.stock_actual, i.fecha_actualizacion
       FROM productos p JOIN inventario i ON i.id_producto = p.id_producto
       WHERE p.id_producto = ANY($1) FOR UPDATE OF i`, [partidas.map((p) => p.idProducto)]);
    const porId = new Map(rows.map((r) => [r.id_producto, r]));

    const detalle = partidas.map(({ idProducto, cantidad }) => {
      const r = porId.get(idProducto);
      if (!r) throw errorPedido(404, `El producto ${idProducto} no existe en el catálogo`);
      if (r.stock_actual === null) throw errorPedido(409, `${r.nombre}: la existencia no está confirmada, no se puede vender`);
      if (r.stock_actual < cantidad) {
        throw errorPedido(409, r.stock_actual === 0 ? `${r.nombre} está agotado` : `${r.nombre}: solo quedan ${r.stock_actual} piezas`);
      }
      return { idProducto, nombre: r.nombre, cantidad, precio: Number(r.precio), importe: Number(r.precio) * cantidad, fecha: r.fecha_actualizacion };
    });
    const total = detalle.reduce((s, d) => s + d.importe, 0);
    const fecha = detalle[0].fecha;

    const ins = await client.query(
      "INSERT INTO pedidos (fecha, cliente, total, partidas) VALUES ($1, $2, $3, $4) RETURNING id",
      [fecha, cliente, total, JSON.stringify(detalle.map(({ fecha: _f, ...d }) => d))]);
    const folio = ins.rows[0].id;

    for (const [n, d] of detalle.entries()) {
      await client.query("UPDATE inventario SET stock_actual = stock_actual - $2 WHERE id_producto = $1", [d.idProducto, d.cantidad]);
      await client.query("INSERT INTO ventas (id_venta, id_producto, fecha, cantidad, canal) VALUES ($1, $2, $3, $4, 'Web')",
        [`P${folio}-${n + 1}`, d.idProducto, fecha, d.cantidad]);
    }
    await client.query("COMMIT");
    return {
      folio, cliente, total,
      fecha: new Date(fecha).toISOString().slice(0, 10),
      partidas: detalle.map(({ fecha: _f, ...d }) => d),
      nota: "Pedido simulado: se registró como venta del canal Web y ya se considera en el panel de reabastecimiento.",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function recientes(limite = 10) {
  const { rows } = await db.query(
    "SELECT id AS folio, to_char(fecha, 'YYYY-MM-DD') AS fecha, cliente, total, partidas FROM pedidos ORDER BY id DESC LIMIT $1", [limite]);
  return rows.map((r) => ({ ...r, total: Number(r.total) }));
}

module.exports = { validarPedido, crear, recientes, MAX_CANTIDAD };
