const { autenticar } = require("../services/auth.service");

async function login(req, res, next) {
  const { usuario, password } = req.body || {};
  if (typeof usuario !== "string" || typeof password !== "string" || !usuario.trim() || !password) {
    return res.status(400).json({ error: "BAD_REQUEST", message: "Usuario y contraseña son obligatorios" });
  }
  try {
    const sesion = await autenticar(usuario.trim(), password);
    if (!sesion) return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Usuario o contraseña incorrectos" });
    return res.json(sesion);
  } catch (error) {
    return next(error);
  }
}

function perfil(req, res) {
  res.json(req.user);
}

module.exports = { login, perfil };
