const dss = require("../dss/dss.service");

async function recomendaciones(req, res, next) {
  try {
    res.json(await dss.recomendaciones(req.query));
  } catch (error) {
    next(error);
  }
}

async function comparar(req, res, next) {
  try {
    res.json(await dss.comparar(req.query));
  } catch (error) {
    next(error);
  }
}

module.exports = { recomendaciones, comparar };
