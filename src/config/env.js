// Variables de entorno (archivo .env). Ver .env.example.
require("dotenv").config({ quiet: true });

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 3000,
  URL_DB: process.env.URL_DB,
  dbSsl: process.env.DB_SSL !== "false",
  // Esquema propio para no chocar con tablas de otros proyectos en la misma base
  dbSchema: process.env.DB_SCHEMA || "casa_pluma",
  jwtSecret: process.env.JWT_SECRET,
  corsOrigin: process.env.CORS_ORIGIN || "*",
  adminUsuario: process.env.ADMIN_USUARIO || "admin",
  adminPassword: process.env.ADMIN_PASSWORD,
  serviceName: process.env.SERVICE_NAME || "Casa Pluma API",
};

module.exports = env;
