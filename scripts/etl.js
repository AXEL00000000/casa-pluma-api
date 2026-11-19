// Ejecuta el ETL desde la terminal: npm run etl
const db = require("../src/database/postgres.database");
const { ejecutarEtl } = require("../src/etl/etl.service");

(async () => {
  try {
    const r = await ejecutarEtl({ usuario: "cli" });
    console.log(`ETL #${r.id} · fecha de corte ${r.fechaCorte.toISOString().slice(0, 10)}`);
    console.table(Object.keys(r.extraidos).map((f) => ({ fuente: f, extraidos: r.extraidos[f], cargados: r.cargados[f] ?? r.cargados.productos })));
    console.log("Transformaciones por regla:");
    console.table(r.transformaciones.resumen);
    console.log(`Rechazados: ${r.rechazados.length} · En revisión: ${r.enRevision.length}`);
    console.table(r.rechazados.map(({ fuente, identificador, regla, motivo }) => ({ fuente, identificador, regla, motivo })));
    console.table(r.enRevision.map(({ fuente, identificador, campo, regla, motivo }) => ({ fuente, identificador, campo, regla, motivo })));
    console.log("Validaciones:");
    console.table(r.validaciones);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await db.cerrarConexion();
  }
})();
