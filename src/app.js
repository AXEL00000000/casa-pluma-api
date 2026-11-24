const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const env = require("./config/env");

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: env.corsOrigin === "*" ? true : env.corsOrigin.split(",") }));
app.use(express.json({ limit: "1mb" }));

app.use("/api/v1/health", require("./routes/health.routes"));
app.use("/api/v1/auth", require("./routes/auth.routes"));
app.use("/api/v1/productos", require("./routes/productos.routes"));
app.use("/api/v1/pedidos", require("./routes/pedidos.routes"));
// Módulo de apoyo a la toma de decisiones (desarrollado para DSTD)
app.use("/api/v1/etl", require("./routes/etl.routes"));
app.use("/api/v1/dss", require("./routes/dss.routes"));

app.use((req, res) => res.status(404).json({ error: "NOT_FOUND", message: "Endpoint not found" }));

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({
    error: error.status === 422 ? "ETL_VALIDATION_FAILED" : "INTERNAL_ERROR",
    message: error.status ? error.message : "Ocurrió un error en el servidor",
    validaciones: error.validaciones,
  });
});

module.exports = app;
