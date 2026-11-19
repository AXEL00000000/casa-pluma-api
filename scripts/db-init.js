// Crea las tablas y el usuario administrador (definido en .env).
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const env = require("../src/config/env");
const db = require("../src/database/postgres.database");

(async () => {
  try {
    const client = await db.connect();
    try {
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${db.ESQUEMA}`);
      await client.query(`SET search_path TO ${db.ESQUEMA}`);
      await client.query(fs.readFileSync(path.join(__dirname, "..", "src", "database", "schema.sql"), "utf8"));
    } finally {
      client.release();
    }
    console.log(`Tablas creadas o ya existentes en el esquema "${db.ESQUEMA}".`);
    if (!env.adminPassword || env.adminPassword.length < 8) {
      throw new Error("Define ADMIN_PASSWORD (mínimo 8 caracteres) en el .env");
    }
    const hash = await bcrypt.hash(env.adminPassword, 10);
    await db.query(
      `INSERT INTO usuarios (usuario, nombre, password_hash, rol) VALUES ($1, 'Administrador', $2, 'admin')
       ON CONFLICT (usuario) DO UPDATE SET password_hash = EXCLUDED.password_hash, activo = TRUE`,
      [env.adminUsuario, hash]
    );
    console.log(`Usuario "${env.adminUsuario}" listo.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await db.cerrarConexion();
  }
})();
