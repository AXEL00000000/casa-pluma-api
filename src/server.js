const app = require("./app");
const env = require("./config/env");
const db = require("./database/postgres.database");

if (!env.jwtSecret || Buffer.byteLength(env.jwtSecret, "utf8") < 32) {
  throw new Error("JWT_SECRET debe configurarse con al menos 32 bytes");
}

const server = app.listen(env.port, () => {
  console.log(`[${env.serviceName}] escuchando en http://localhost:${env.port}`);
});
db.probarConexion().catch((e) => console.error("No se pudo conectar a PostgreSQL:", e.message));

function shutdown(signal) {
  console.log(`Recibido ${signal}. Cerrando servidor...`);
  server.close(async () => {
    await db.cerrarConexion().catch(() => {});
    process.exit(0);
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
