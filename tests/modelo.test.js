// Matriz de pruebas del modelo de decisión: datos normales, faltantes,
// inconsistentes y casos límite. Ejecutar con: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluarProducto, ordenar } = require("../src/dss/modelo");

const base = {
  idProducto: "T-1", nombre: "Prueba", categoria: "Grano", proveedor: "Tostado propio", disponibilidad: "Disponible",
  stockActual: 30, stockMinimo: 10, tiempoReposicion: 2, vidaUtil: 45,
  fechaTostado: "2026-11-10", fechaCorte: "2026-11-18", fechaActualizacion: "2026-11-18", desde: "2026-10-20",
  numVentas: 40, unidadesVendidas: 60, // 2 u./día con ventana de 30 días
};
const evalua = (cambios, prm) => evaluarProducto({ ...base, ...cambios }, prm);

test("Normal: cobertura amplia y sobre el mínimo -> BAJA, no reabastecer", () => {
  const r = evalua({});
  assert.equal(r.indicadores.demandaDiaria, 2);
  assert.equal(r.indicadores.coberturaDias, 15);
  assert.equal(r.indicadores.diferenciaMinimo, 20);
  assert.equal(r.indicadores.frescuraRestanteDias, 37);
  assert.equal(r.prioridad, "BAJA");
  assert.equal(r.accion, "No reabastecer");
  assert.equal(r.cantidadSugerida, 0);
});

test("Ejemplo del enunciado: 12 u., 4 u./día, reposición 5 días -> ALTA", () => {
  const r = evalua({ stockActual: 12, unidadesVendidas: 120, tiempoReposicion: 5 });
  assert.equal(r.indicadores.coberturaDias, 3);
  assert.equal(r.prioridad, "ALTA");
  assert.equal(r.accion, "Tostar hoy");
});

test("Límite: cobertura exactamente igual a la reposición -> ALTA", () => {
  const r = evalua({ stockActual: 4, unidadesVendidas: 60, tiempoReposicion: 2 }); // 4 / 2 = 2 días
  assert.equal(r.indicadores.coberturaDias, 2);
  assert.equal(r.prioridad, "ALTA");
});

test("Límite: cobertura igual a reposición + margen -> MEDIA", () => {
  const r = evalua({ stockActual: 10, unidadesVendidas: 60, tiempoReposicion: 2, stockMinimo: 5 }); // 5 días = 2 + 3
  assert.equal(r.prioridad, "MEDIA");
});

test("Stock en 0 -> ALTA aunque la reposición sea corta", () => {
  const r = evalua({ stockActual: 0 });
  assert.equal(r.prioridad, "ALTA");
  assert.ok(r.cantidadSugerida > 0);
});

test("Bajo el mínimo pero con cobertura suficiente -> MEDIA", () => {
  const r = evalua({ stockActual: 20, stockMinimo: 25 });
  assert.equal(r.prioridad, "MEDIA");
});

test("Faltante: stock NULL -> SIN DATOS, sin recomendación categórica", () => {
  const r = evalua({ stockActual: null });
  assert.equal(r.prioridad, "SIN DATOS");
  assert.equal(r.indicadores.coberturaDias, null);
  assert.equal(r.cantidadSugerida, 0);
  assert.match(r.explicacion[0], /stock actual/);
});

test("Faltante: tiempo de reposición NULL -> SIN DATOS", () => {
  const r = evalua({ tiempoReposicion: null });
  assert.equal(r.prioridad, "SIN DATOS");
});

test("Sin ventas en el periodo: no divide entre cero y avisa que la demanda no es confiable", () => {
  const r = evalua({ unidadesVendidas: 0, numVentas: 0 });
  assert.equal(r.indicadores.coberturaDias, null);
  assert.equal(r.prioridad, "BAJA");
  assert.ok(r.alertas.some((a) => a.includes("poco confiable")));
});

test("Escenario +20 % de demanda cambia la prioridad de MEDIA a ALTA", () => {
  const p = { stockActual: 11, unidadesVendidas: 75, tiempoReposicion: 4, stockMinimo: 5 }; // 2.5 u./día
  assert.equal(evalua(p).prioridad, "MEDIA");                       // 4.4 días
  assert.equal(evalua(p, { factorDemanda: 1.2 }).prioridad, "ALTA"); // 3.67 días
});

test("Margen de seguridad configurable: con margen 0 baja la prioridad", () => {
  const p = { stockActual: 8, unidadesVendidas: 60, tiempoReposicion: 2, stockMinimo: 5 }; // 4 días
  assert.equal(evalua(p).prioridad, "MEDIA");
  assert.equal(evalua(p, { margenSeguridad: 0 }).prioridad, "BAJA");
});

test("Frescura: el stock dura más que la vida útil restante -> promocionar", () => {
  const r = evalua({ stockActual: 60, fechaTostado: "2026-10-20", vidaUtil: 30 }); // 2 días de vida, 30 de cobertura
  assert.equal(r.accion, "Promocionar");
  assert.ok(r.alertas.some((a) => a.startsWith("Riesgo de frescura")));
});

test("Frescura vencida -> retirar de venta", () => {
  const r = evalua({ fechaTostado: "2026-09-01", vidaUtil: 30 });
  assert.equal(r.accion, "Retirar de venta y revisar");
});

test("La cantidad sugerida no supera lo que se vende antes de caducar", () => {
  const r = evalua({ stockActual: 0, unidadesVendidas: 30, vidaUtil: 5, tiempoReposicion: 10, stockMinimo: 2 }); // 1 u./día
  assert.equal(r.cantidadSugerida, 5);
});

test("Accesorios: sin frescura y la acción es pedir al proveedor", () => {
  const r = evalua({ categoria: "Accesorio", vidaUtil: null, fechaTostado: null, stockActual: 0 });
  assert.equal(r.indicadores.frescuraRestanteDias, null);
  assert.equal(r.accion, "Pedir hoy");
});

test("Orden: ALTA primero, luego SIN DATOS, MEDIA y BAJA", () => {
  const lista = [evalua({ idProducto: "B" }), evalua({ idProducto: "A", stockActual: 0 }),
    evalua({ idProducto: "C", stockActual: null }), evalua({ idProducto: "D", stockActual: 20, stockMinimo: 25 })];
  assert.deepEqual(ordenar(lista).map((r) => r.prioridad), ["ALTA", "SIN DATOS", "MEDIA", "BAJA"]);
});
