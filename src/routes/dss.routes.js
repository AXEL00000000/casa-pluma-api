const { Router } = require("express");
const c = require("../controllers/dss.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = Router();
router.use(authenticate);
// ?factorDemanda=1.2&margenSeguridad=3&diasVentana=30
router.get("/recomendaciones", c.recomendaciones);
// ?factorBase=1&factorEscenario=1.2&margenSeguridad=3&diasVentana=30
router.get("/comparar", c.comparar);
module.exports = router;
