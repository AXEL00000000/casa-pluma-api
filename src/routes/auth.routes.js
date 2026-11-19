const { Router } = require("express");
const { login, perfil } = require("../controllers/auth.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = Router();
router.post("/login", login);       // { usuario, password } -> { accessToken, usuario }
router.get("/perfil", authenticate, perfil);
module.exports = router;
