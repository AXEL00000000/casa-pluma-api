const { Router } = require("express");
const c = require("../controllers/etl.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");

const router = Router();
router.use(authenticate);
router.post("/ejecutar", authorize("admin", "inventario"), c.ejecutar);
router.get("/ultima", c.ultima);
router.get("/fuentes/:nombre", c.fuente);
module.exports = router;
