// Consulta los datos ya cargados por el ETL y aplica el modelo de decisión.
const db = require("../database/postgres.database");
const { PARAMETROS_BASE, evaluarProducto, ordenar, resumir } = require("./modelo");

function leerParametros(q = {}) {
  const num = (v, def, min, max) => {
    const n = Number(v);
    return v === undefined || v === "" || !Number.isFinite(n) ? def : Math.min(max, Math.max(min, n));
  };
  return {
    factorDemanda: num(q.factorDemanda, PARAMETROS_BASE.factorDemanda, 0.1, 5),
    margenSeguridad: num(q.margenSeguridad, PARAMETROS_BASE.margenSeguridad, 0, 30),
    diasVentana: Math.round(num(q.diasVentana, PARAMETROS_BASE.diasVentana, 7, 90)),
    minimoVentas: PARAMETROS_BASE.minimoVentas,
  };
}

const SQL = `
WITH corte AS (SELECT MAX(fecha_actualizacion) AS fecha FROM inventario),
v AS (
  SELECT ve.id_producto, COUNT(*)::int AS num_ventas, COALESCE(SUM(ve.cantidad), 0)::int AS unidades
  FROM ventas ve, corte
  WHERE ve.fecha > corte.fecha - $1::int AND ve.fecha <= corte.fecha
  GROUP BY ve.id_producto
)
SELECT p.id_producto, p.nombre, p.categoria, p.vida_util_dias, p.precio,
       i.stock_actual, i.stock_minimo, i.fecha_tostado, i.fecha_actualizacion,
       r.proveedor, r.tiempo_reposicion_dias, r.disponibilidad,
       COALESCE(v.num_ventas, 0) AS num_ventas, COALESCE(v.unidades, 0) AS unidades,
       to_char(corte.fecha, 'YYYY-MM-DD') AS fecha_corte,
       to_char(corte.fecha - $1::int + 1, 'YYYY-MM-DD') AS desde
FROM productos p
JOIN inventario i ON i.id_producto = p.id_producto
LEFT JOIN reposicion r ON r.id_producto = p.id_producto
LEFT JOIN v ON v.id_producto = p.id_producto
CROSS JOIN corte
ORDER BY p.id_producto`;

const fecha = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

async function evaluar(parametros) {
  const { rows } = await db.query(SQL, [parametros.diasVentana]);
  return rows.map((r) => evaluarProducto({
    idProducto: r.id_producto,
    nombre: r.nombre,
    categoria: r.categoria,
    vidaUtil: r.vida_util_dias,
    stockActual: r.stock_actual,
    stockMinimo: r.stock_minimo,
    fechaTostado: fecha(r.fecha_tostado),
    fechaActualizacion: fecha(r.fecha_actualizacion),
    proveedor: r.proveedor,
    tiempoReposicion: r.tiempo_reposicion_dias,
    disponibilidad: r.disponibilidad,
    numVentas: r.num_ventas,
    unidadesVendidas: r.unidades,
    fechaCorte: r.fecha_corte,
    desde: r.desde,
  }, parametros));
}

async function recomendaciones(query) {
  const parametros = leerParametros(query);
  const resultados = ordenar(await evaluar(parametros));
  return {
    origenDatos: "Datos simulados con fines académicos (no son ventas reales).",
    fechaCorte: resultados[0]?.trazabilidad.fechaCorte ?? null,
    parametros,
    resumen: resumir(resultados),
    resultados,
  };
}

// Compara dos escenarios (por ejemplo, demanda normal contra +20 %)
async function comparar(query) {
  const base = leerParametros({ ...query, factorDemanda: query.factorBase ?? 1 });
  const escenario = leerParametros({ ...query, factorDemanda: query.factorEscenario ?? 1.2 });
  const [a, b] = await Promise.all([evaluar(base), evaluar(escenario)]);
  const porId = new Map(a.map((r) => [r.idProducto, r]));
  const cambios = b.map((r) => {
    const antes = porId.get(r.idProducto);
    return {
      idProducto: r.idProducto,
      nombre: r.nombre,
      prioridadBase: antes.prioridad,
      prioridadEscenario: r.prioridad,
      coberturaBase: antes.indicadores.coberturaDias,
      coberturaEscenario: r.indicadores.coberturaDias,
      cantidadBase: antes.cantidadSugerida,
      cantidadEscenario: r.cantidadSugerida,
      cambia: antes.prioridad !== r.prioridad,
    };
  });
  return { base: { parametros: base, resumen: resumir(a) }, escenario: { parametros: escenario, resumen: resumir(b) }, cambios };
}

module.exports = { leerParametros, recomendaciones, comparar };
