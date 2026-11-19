// Pruebas de las reglas del ETL con fuentes pequeñas armadas a mano.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { transformar, validar, aFecha } = require("../src/etl/reglas");
const { extraer } = require("../src/etl/fuentes");

const inv = (o) => ({ IdProducto: "CP-001", Producto: "Café", Lote: "L", Presentacion: "250 g", Categoria: "Grano", Precio: "100",
  VidaUtilDias: "45", StockActual: "10", StockMinimo: "5", FechaTostado: "2026-11-10", FechaActualizacion: "2026-11-18", ...o });
const ven = (o) => ({ IdVenta: "V1", IdProducto: "CP-001", Fecha: "2026-11-15", Cantidad: "2", Canal: "Tienda", ...o });
const rep = (o) => ({ IdProducto: "CP-001", Proveedor: "Tostado propio", TiempoReposicion: "2", Disponibilidad: "Disponible", ...o });
const correr = (f) => transformar({ inventario: f.inventario ?? [inv()], ventas: f.ventas ?? [ven()], reposicion: f.reposicion ?? [rep()] });

test("Fechas: AAAA-MM-DD, DD/MM/AAAA y DD-MM-AAAA; rechaza fechas imposibles", () => {
  assert.equal(aFecha("2026-11-05"), "2026-11-05");
  assert.equal(aFecha("05/11/2026"), "2026-11-05");
  assert.equal(aFecha("05-11-2026"), "2026-11-05");
  assert.equal(aFecha("31/02/2026"), null);
  assert.equal(aFecha("ayer"), null);
});

test("Datos normales: se cargan sin incidencias", () => {
  const d = correr({});
  assert.equal(d.productos.length, 1);
  assert.equal(d.ventas.length, 1);
  assert.equal(d.incidencias.length, 0);
});

test("Homologa categoría, id, precio y proveedor", () => {
  const d = correr({ inventario: [inv({ IdProducto: " cp-001", Categoria: "GRANO ", Precio: "$1,200" })],
    reposicion: [rep({ Proveedor: "TOSTADO PROPIO" })] });
  assert.equal(d.productos[0].id_producto, "CP-001");
  assert.equal(d.productos[0].categoria, "Grano");
  assert.equal(d.productos[0].precio, 1200);
});

test("Inventario duplicado: se queda el más reciente y el otro se rechaza", () => {
  const d = correr({ inventario: [inv({ StockActual: "-3", FechaActualizacion: "2026-11-10" }), inv({ StockActual: "7" })] });
  assert.equal(d.inventario.length, 1);
  assert.equal(d.inventario[0].stock_actual, 7);
  assert.equal(d.incidencias.filter((i) => i.regla === "R05").length, 1);
});

test("Stock vacío o negativo: se carga NULL y queda en revisión", () => {
  for (const valor of ["", "-2"]) {
    const d = correr({ inventario: [inv({ StockActual: valor })] });
    assert.equal(d.inventario[0].stock_actual, null);
    assert.equal(d.incidencias[0].tipo, "REVISION");
  }
});

test("Ventas inválidas: duplicada, cantidad 0, producto inexistente y fecha futura", () => {
  const d = correr({ ventas: [ven(), ven(), ven({ IdVenta: "V2", Cantidad: "0" }), ven({ IdVenta: "V3", IdProducto: "CP-999" }),
    ven({ IdVenta: "V4", Fecha: "2026-12-01" }), ven({ IdVenta: "V5", Fecha: "16/11/2026", Canal: "web" })] });
  assert.deepEqual(d.ventas.map((v) => v.id_venta), ["V1", "V5"]);
  assert.equal(d.ventas[1].fecha, "2026-11-16");
  assert.equal(d.ventas[1].canal, "Web");
  assert.deepEqual(d.incidencias.map((i) => i.regla).sort(), ["R07", "R08", "R09", "R10"]);
});

test("Tiempo de reposición: '5 días' -> 5 y 'N/D' -> NULL en revisión", () => {
  assert.equal(correr({ reposicion: [rep({ TiempoReposicion: "5 días" })] }).reposicion[0].tiempo_reposicion_dias, 5);
  const d = correr({ reposicion: [rep({ TiempoReposicion: "N/D" })] });
  assert.equal(d.reposicion[0].tiempo_reposicion_dias, null);
  assert.equal(d.incidencias[0].regla, "R12");
});

test("Fuentes simuladas del proyecto: todas las validaciones se cumplen", () => {
  const fuentes = extraer(path.join(__dirname, "..", "datos", "fuentes"));
  const extraidos = Object.fromEntries(Object.entries(fuentes).map(([k, v]) => [k, v.length]));
  const d = transformar(fuentes);
  assert.ok(validar(extraidos, d).every((v) => v.cumple));
  assert.equal(d.fechaCorte, "2026-11-18");
});
