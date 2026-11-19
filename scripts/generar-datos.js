/**
 * Genera las fuentes SIMULADAS de Casa Pluma en datos/fuentes/.
 * Los datos son ficticios y se generan con una semilla fija, así que
 * ejecutar el script dos veces produce exactamente los mismos archivos.
 *
 * Las anomalías (duplicados, fechas en otro formato, valores faltantes,
 * etc.) se insertan a propósito para que el ETL tenga qué limpiar.
 */
const fs = require("fs");
const path = require("path");

const DESTINO = path.join(__dirname, "..", "datos", "fuentes");
const FECHA_CORTE = new Date(Date.UTC(2026, 10, 18)); // 2026-11-18
const DIAS = 30;

// Generador pseudoaleatorio con semilla (mulberry32)
let semilla = 20261119;
function azar() {
  semilla |= 0;
  semilla = (semilla + 0x6d2b79f5) | 0;
  let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function poisson(lambda) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= azar();
  } while (p > L);
  return k - 1;
}
const iso = (d) => d.toISOString().slice(0, 10);
const ddmmyyyy = (d) => `${iso(d).slice(8, 10)}/${iso(d).slice(5, 7)}/${iso(d).slice(0, 4)}`;
const ddmmyyyyGuion = (d) => ddmmyyyy(d).replaceAll("/", "-");
const menosDias = (d, n) => new Date(d.getTime() - n * 86400000);

// id, nombre, lote, presentación, categoría, precio, vida útil, demanda/día esperada,
// stock, stock mínimo, días desde el tostado, reposición, proveedor, disponibilidad
const PRODUCTOS = [
  ["CP-001", "La Soledad · grano 250 g", "La Soledad", "250 g", "Grano", 260, 45, 3.2, 9, 12, 6, 2, "Tostado propio", "Disponible"],
  ["CP-002", "La Soledad · molido 250 g", "La Soledad", "250 g", "Molido", 260, 30, 2.6, 18, 10, 9, 2, "Tostado propio", "Disponible"],
  ["CP-003", "La Soledad · grano 1 kg", "La Soledad", "1 kg", "Grano", 880, 60, 0.6, 7, 4, 12, 3, "Tostado propio", "Disponible"],
  ["CP-004", "El Mirador · grano 250 g", "El Mirador", "250 g", "Grano", 240, 45, 2.4, 30, 10, 4, 2, "Tostado propio", "Disponible"],
  ["CP-005", "El Mirador · molido 250 g", "El Mirador", "250 g", "Molido", 240, 30, 2.1, 0, 8, 20, 2, "Tostado propio", "Disponible"],
  ["CP-006", "El Mirador · grano 1 kg", "El Mirador", "1 kg", "Grano", 820, 60, 0.4, 14, 3, 25, 3, "Tostado propio", "Disponible"],
  ["CP-007", "Cerro Verde · grano 250 g", "Cerro Verde", "250 g", "Grano", 290, 45, 1.8, 6, 8, 7, 5, "Café verde: Cooperativa Yucuhiti", "Limitada"],
  ["CP-008", "Cerro Verde · molido 250 g", "Cerro Verde", "250 g", "Molido", 290, 30, 0.9, 26, 6, 18, 5, "Café verde: Cooperativa Yucuhiti", "Limitada"],
  ["CP-009", "Cerro Verde · grano 1 kg", "Cerro Verde", "1 kg", "Grano", 980, 60, 0.3, 5, 2, 8, 5, "Café verde: Cooperativa Yucuhiti", "Limitada"],
  ["CP-010", "Los Naranjos · grano 250 g", "Los Naranjos", "250 g", "Grano", 250, 45, 2.0, 12, 8, 5, 3, "Tostado propio", "Disponible"],
  ["CP-011", "Los Naranjos · molido 250 g", "Los Naranjos", "250 g", "Molido", 250, 30, 1.5, null, 8, 10, 3, "Tostado propio", "Disponible"],
  ["CP-012", "Los Naranjos · grano 1 kg", "Los Naranjos", "1 kg", "Grano", 850, 60, 0.5, 6, 3, 14, null, "Tostado propio", "Disponible"],
  ["CP-013", "Prensa francesa 600 ml", "", "Pieza", "Accesorio", 520, null, 0.3, 4, 3, null, 10, "Distribuidora Barista MX", "Disponible"],
  ["CP-014", "Filtros V60 · 100 pzas", "", "Paquete", "Accesorio", 180, null, 0.6, 9, 6, null, 8, "Distribuidora Barista MX", "Disponible"],
  ["CP-015", "Taza de barro negro", "", "Pieza", "Accesorio", 140, null, 0.5, 22, 6, null, 12, "Alfarería San Bartolo", "Limitada"],
];

function csv(filas) {
  return filas.map((f) => f.map((v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  }).join(",")).join("\n") + "\n";
}

// ---------------------------------------------------------------- inventario
const inventario = [["IdProducto", "Producto", "Lote", "Presentacion", "Categoria", "Precio", "VidaUtilDias",
  "StockActual", "StockMinimo", "FechaTostado", "FechaActualizacion"]];
for (const p of PRODUCTOS) {
  const [id, nombre, lote, pres, cat, precio, vida, , stock, minimo, diasTostado] = p;
  const tostado = diasTostado === null ? "" : iso(menosDias(FECHA_CORTE, diasTostado));
  inventario.push([id, nombre, lote, pres, cat, precio, vida ?? "", stock ?? "", minimo, tostado, iso(FECHA_CORTE)]);
}
// Anomalías de inventario (a propósito)
inventario[2][4] = "MOLIDO";                 // categoría en mayúsculas
inventario[4][4] = "grano ";                 // categoría con espacio y minúsculas
inventario[7][5] = "$290";                   // precio con símbolo
inventario[10][9] = ddmmyyyy(menosDias(FECHA_CORTE, 5)); // fecha en otro formato
inventario[6][0] = " cp-006";                // id con espacio y minúsculas
// CP-004 con una segunda versión más antigua y stock negativo
inventario.push(["CP-004", "El Mirador · grano 250 g", "El Mirador", "250 g", "Grano", 240, 45, -4, 10,
  iso(menosDias(FECHA_CORTE, 12)), iso(menosDias(FECHA_CORTE, 6))]);

// ---------------------------------------------------------------- ventas
const ventas = [["IdVenta", "IdProducto", "Fecha", "Cantidad", "Canal"]];
const canales = ["Tienda", "Tienda", "Tienda", "Web", "Barra"];
let n = 1;
for (let d = DIAS - 1; d >= 0; d -= 1) {
  const fecha = menosDias(FECHA_CORTE, d);
  for (const p of PRODUCTOS) {
    let cantidad = poisson(p[7]);
    while (cantidad > 0) {
      const lote = Math.min(cantidad, 1 + Math.floor(azar() * 3));
      cantidad -= lote;
      ventas.push([`V${String(n).padStart(5, "0")}`, p[0], iso(fecha), lote, canales[Math.floor(azar() * canales.length)]]);
      n += 1;
    }
  }
}
// Anomalías de ventas
const filas = ventas.slice(1);
for (const i of [7, 31, 64, 98, 140, 187, 230, 260]) {          // fechas DD/MM/AAAA y DD-MM-AAAA
  const f = new Date(filas[i][2] + "T00:00:00Z");
  filas[i][2] = i % 2 ? ddmmyyyyGuion(f) : ddmmyyyy(f);
}
for (const i of [12, 45, 90, 133]) filas[i][4] = filas[i][4].toLowerCase();   // canal en minúsculas
filas[50][4] = "WEB";
const dup1 = [...filas[20]];
const dup2 = [...filas[110]];
filas.splice(21, 0, dup1);                                                     // duplicados exactos
filas.splice(112, 0, dup2);
filas.push([`V${String(n++).padStart(5, "0")}`, "CP-002", iso(menosDias(FECHA_CORTE, 3)), 0, "Tienda"]);
filas.push([`V${String(n++).padStart(5, "0")}`, "CP-010", iso(menosDias(FECHA_CORTE, 8)), -2, "Web"]);
filas.push([`V${String(n++).padStart(5, "0")}`, "CP-099", iso(menosDias(FECHA_CORTE, 4)), 2, "Web"]);
filas.push([`V${String(n++).padStart(5, "0")}`, "CP-099", iso(menosDias(FECHA_CORTE, 10)), 1, "Tienda"]);
filas.push([`V${String(n++).padStart(5, "0")}`, "CP-001", "2026-12-05", 3, "Web"]);          // fecha futura
const ventasFinal = [ventas[0], ...filas];

// ---------------------------------------------------------------- reposición
const reposicion = [["IdProducto", "Proveedor", "TiempoReposicion", "Disponibilidad"]];
for (const p of PRODUCTOS) reposicion.push([p[0], p[12], p[11] ?? "N/D", p[13]]);
reposicion[2][2] = "2 dias";            // texto en campo numérico
reposicion[8][2] = "5 días";
reposicion[4][1] = "TOSTADO PROPIO";     // proveedor con otra escritura
reposicion[10][1] = "tostado propio ";

fs.mkdirSync(DESTINO, { recursive: true });
fs.writeFileSync(path.join(DESTINO, "inventario.csv"), csv(inventario));
fs.writeFileSync(path.join(DESTINO, "ventas.csv"), csv(ventasFinal));
fs.writeFileSync(path.join(DESTINO, "reposicion.csv"), csv(reposicion));
console.log(`Fuentes simuladas generadas en ${DESTINO}`);
console.log(`  inventario.csv  ${inventario.length - 1} filas`);
console.log(`  ventas.csv      ${ventasFinal.length - 1} filas`);
console.log(`  reposicion.csv  ${reposicion.length - 1} filas`);
