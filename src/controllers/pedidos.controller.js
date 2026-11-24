const pedidos = require("../pedidos/pedidos.service");

async function crear(req, res, next) {
  try {
    res.status(201).json(await pedidos.crear(req.body));
  } catch (error) {
    if (error.codigo === "PEDIDO_INVALIDO") return res.status(error.status).json({ error: error.codigo, message: error.message });
    return next(error);
  }
}

async function recientes(req, res, next) {
  try {
    res.json(await pedidos.recientes());
  } catch (error) {
    next(error);
  }
}

module.exports = { crear, recientes };
