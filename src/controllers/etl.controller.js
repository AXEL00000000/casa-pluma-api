const { ejecutarEtl, obtenerEjecucion } = require("../etl/etl.service");
const { FUENTES, leerFuente } = require("../etl/fuentes");

async function ejecutar(req, res, next) {
  try {
    res.status(201).json(await ejecutarEtl({ usuario: req.user.usuario }));
  } catch (error) {
    next(error);
  }
}

async function ultima(req, res, next) {
  try {
    const e = await obtenerEjecucion();
    if (!e) return res.status(404).json({ error: "NOT_FOUND", message: "Aún no se ha ejecutado el ETL" });
    return res.json(e);
  } catch (error) {
    return next(error);
  }
}

// Vista previa de una fuente original, sin transformar
function fuente(req, res) {
  if (!FUENTES.includes(req.params.nombre)) {
    return res.status(404).json({ error: "NOT_FOUND", message: `Fuentes disponibles: ${FUENTES.join(", ")}` });
  }
  const filas = leerFuente(req.params.nombre).map(({ _fila, ...r }) => ({ fila: _fila, ...r }));
  return res.json({ fuente: req.params.nombre, total: filas.length, filas });
}

module.exports = { ejecutar, ultima, fuente };
