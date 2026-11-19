const { Pool } = require("pg");
const env = require("../config/env");

// Supabase exige SSL; en PostgreSQL local se desactiva con DB_SSL=false.
const pool = new Pool({
  connectionString: env.URL_DB,
  ssl: env.dbSsl ? { rejectUnauthorized: false } : false,
});

if (!/^[a-z_][a-z0-9_]*$/.test(env.dbSchema)) {
  throw new Error("DB_SCHEMA solo admite minúsculas, números y guion bajo");
}
const ESQUEMA = env.dbSchema;

// Cada conexión trabaja dentro del esquema del proyecto: se fija una sola vez
// por conexión y antes de cualquier otra consulta.
const preparadas = new WeakSet();
async function prepararCliente(client) {
  if (!preparadas.has(client)) {
    await client.query(`SET search_path TO ${ESQUEMA}, public`);
    preparadas.add(client);
  }
  return client;
}

let closePromise;

function validarUrlDb() {
  if (!env.URL_DB) {
    throw new Error("Falta configurar URL_DB en el archivo .env");
  }
}

async function connect() {
  validarUrlDb();
  return prepararCliente(await pool.connect());
}

async function query(...args) {
  const client = await connect();
  try {
    return await client.query(...args);
  } finally {
    client.release();
  }
}

async function probarConexion() {
  const r = await query("SELECT NOW() AS fecha");
  console.log("Conexión a PostgreSQL exitosa:", r.rows[0].fecha);
}

async function cerrarConexion() {
  if (!closePromise) closePromise = pool.end();
  await closePromise;
}

pool.on("error", (error) => {
  console.error("Error inesperado en el pool de PostgreSQL:", error);
});

module.exports = { pool, query, connect, probarConexion, cerrarConexion, ESQUEMA };
