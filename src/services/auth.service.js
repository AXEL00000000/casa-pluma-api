const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../database/postgres.database");
const env = require("../config/env");

const TOKEN_LIFETIME = "8h";

function getJwtSecret() {
  if (!env.jwtSecret || Buffer.byteLength(env.jwtSecret, "utf8") < 32) {
    throw new Error("JWT_SECRET debe configurarse con al menos 32 bytes");
  }
  return env.jwtSecret;
}

async function autenticar(usuario, password) {
  const { rows } = await db.query(
    "SELECT id, usuario, nombre, password_hash, rol FROM usuarios WHERE usuario = $1 AND activo",
    [usuario]
  );
  const u = rows[0];
  // Se compara aunque el usuario no exista para no revelar cuáles existen.
  const hash = u ? u.password_hash : "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv";
  const ok = await bcrypt.compare(password, hash);
  if (!u || !ok) return null;
  const accessToken = jwt.sign({ rol: u.rol }, getJwtSecret(), {
    subject: String(u.id),
    expiresIn: TOKEN_LIFETIME,
  });
  return { accessToken, usuario: { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol } };
}

function verificarToken(token) {
  return jwt.verify(token, getJwtSecret());
}

async function usuarioActivo(id) {
  const { rows } = await db.query(
    "SELECT id, usuario, nombre, rol FROM usuarios WHERE id = $1 AND activo",
    [id]
  );
  return rows[0] || null;
}

module.exports = { autenticar, verificarToken, usuarioActivo };
