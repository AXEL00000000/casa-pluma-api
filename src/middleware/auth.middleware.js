const { verificarToken, usuarioActivo } = require("../services/auth.service");

function noAutorizado(res) {
  return res.status(401).json({ error: "UNAUTHORIZED", message: "Se requiere un token de acceso válido" });
}

async function authenticate(req, res, next) {
  const m = (req.get("authorization") || "").match(/^Bearer ([^\s]+)$/i);
  if (!m) return noAutorizado(res);
  let payload;
  try {
    payload = verificarToken(m[1]);
  } catch (error) {
    if (error.message.startsWith("JWT_SECRET")) {
      return res.status(500).json({ error: "AUTH_CONFIGURATION_ERROR", message: error.message });
    }
    return noAutorizado(res);
  }
  try {
    const usuario = await usuarioActivo(payload.sub);
    if (!usuario) return noAutorizado(res);
    req.user = usuario;
    return next();
  } catch (error) {
    return next(error);
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return noAutorizado(res);
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ error: "FORBIDDEN", message: "No tienes permisos para realizar esta acción" });
    }
    return next();
  };
}

module.exports = { authenticate, authorize };
