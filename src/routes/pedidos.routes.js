const { Router } = require("express");
const c = require("../controllers/pedidos.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = Router();
// { cliente?, partidas: [{ idProducto, cantidad }] } -> pedido simulado registrado como venta Web
router.post("/", c.crear);
router.get("/", authenticate, c.recientes);
module.exports = router;
