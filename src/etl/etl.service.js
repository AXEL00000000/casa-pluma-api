// Orquesta Extract → Transform → Validate → Load y deja bitácora.
const db = require("../database/postgres.database");
const { extraer } = require("./fuentes");
const { REGLAS, transformar, validar } = require("./reglas");

function resumirCambios(cambios) {
  const porRegla = {};
  for (const c of cambios) porRegla[c.regla] = (porRegla[c.regla] || 0) + 1;
  return Object.entries(porRegla).sort().map(([regla, valores]) => ({ regla, descripcion: REGLAS[regla], valores }));
}

// Inserta en bloques de 200 filas por consulta (mucho más rápido contra una base remota)
async function insertar(client, tabla, filas, columnas) {
  for (let i = 0; i < filas.length; i += 200) {
    const bloque = filas.slice(i, i + 200);
    const valores = [];
    const marcas = bloque.map((f, j) => {
      columnas.forEach((c) => valores.push(f[c]));
      return `(${columnas.map((_, k) => `$${j * columnas.length + k + 1}`).join(", ")})`;
    });
    await client.query(`INSERT INTO ${tabla} (${columnas.join(", ")}) VALUES ${marcas.join(", ")}`, valores);
  }
}

async function ejecutarEtl({ usuario = "cli", carpeta } = {}) {
  // 1. Extract
  const fuentes = extraer(carpeta);
  const extraidos = Object.fromEntries(Object.entries(fuentes).map(([k, v]) => [k, v.length]));

  // 2. Transform
  const datos = transformar(fuentes);

  // 3. Validate
  const validaciones = validar(extraidos, datos);
  if (validaciones.some((v) => !v.cumple)) {
    const fallidas = validaciones.filter((v) => !v.cumple).map((v) => v.comprobacion);
    throw Object.assign(new Error(`El ETL no pasó las validaciones: ${fallidas.join("; ")}`), { status: 422, validaciones });
  }

  // 4. Load (todo o nada)
  const cargados = {
    productos: datos.productos.length,
    inventario: datos.inventario.length,
    ventas: datos.ventas.length,
    reposicion: datos.reposicion.length,
  };
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("TRUNCATE ventas, reposicion, inventario, productos");
    // Los pedidos simulados de la tienda se descartan junto con sus ventas al recargar los datos de prueba
    const { rows: [t] } = await client.query("SELECT to_regclass('pedidos') IS NOT NULL AS existe");
    if (t.existe) await client.query("TRUNCATE pedidos RESTART IDENTITY");
    await insertar(client, "productos", datos.productos, ["id_producto", "nombre", "lote", "presentacion", "categoria", "precio", "vida_util_dias"]);
    await insertar(client, "inventario", datos.inventario, ["id_producto", "stock_actual", "stock_minimo", "fecha_tostado", "fecha_actualizacion"]);
    await insertar(client, "ventas", datos.ventas, ["id_venta", "id_producto", "fecha", "cantidad", "canal"]);
    await insertar(client, "reposicion", datos.reposicion, ["id_producto", "proveedor", "tiempo_reposicion_dias", "disponibilidad"]);
    const { rows } = await client.query(
      `INSERT INTO etl_ejecuciones (ejecutado_por, fecha_corte, extraidos, cargados, transformaciones, validaciones)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, ejecutado_en`,
      [usuario, datos.fechaCorte, extraidos, cargados,
        JSON.stringify({ resumen: resumirCambios(datos.cambios), detalle: datos.cambios }), JSON.stringify(validaciones)]
    );
    const idEjecucion = rows[0].id;
    await insertar(client, "etl_incidencias", datos.incidencias.map((i) => ({ ...i, id_ejecucion: idEjecucion })),
      ["id_ejecucion", "tipo", "fuente", "identificador", "campo", "valor_original", "regla", "motivo", "accion"]);
    await client.query("COMMIT");
    return obtenerEjecucion(idEjecucion);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function obtenerEjecucion(id) {
  const filtro = id ? "WHERE id = $1" : "ORDER BY id DESC LIMIT 1";
  const { rows } = await db.query(`SELECT * FROM etl_ejecuciones ${filtro}`, id ? [id] : []);
  const e = rows[0];
  if (!e) return null;
  const inc = await db.query(
    "SELECT tipo, fuente, identificador, campo, valor_original, regla, motivo, accion FROM etl_incidencias WHERE id_ejecucion = $1 ORDER BY tipo, fuente, identificador",
    [e.id]
  );
  return {
    id: e.id,
    ejecutadoEn: e.ejecutado_en,
    ejecutadoPor: e.ejecutado_por,
    fechaCorte: e.fecha_corte,
    extraidos: e.extraidos,
    cargados: e.cargados,
    transformaciones: e.transformaciones,
    validaciones: e.validaciones,
    rechazados: inc.rows.filter((i) => i.tipo === "RECHAZADO"),
    enRevision: inc.rows.filter((i) => i.tipo === "REVISION"),
    reglas: REGLAS,
  };
}

module.exports = { ejecutarEtl, obtenerEjecucion };
