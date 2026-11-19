const { Router } = require("express");
const { listar } = require("../controllers/productos.controller");
const router = Router();
router.get("/", listar);            // catálogo público
module.exports = router;
