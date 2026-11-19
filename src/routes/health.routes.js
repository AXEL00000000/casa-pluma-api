const { Router } = require("express");
const router = Router();
router.get("/", (req, res) => res.json({ status: "ok", servicio: "casa-pluma-api" }));
module.exports = router;
