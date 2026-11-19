// EXTRACT: lectura de las fuentes CSV tal como llegan (todo como texto).
const fs = require("fs");
const path = require("path");

const CARPETA = path.join(__dirname, "..", "..", "datos", "fuentes");
const FUENTES = ["inventario", "ventas", "reposicion"];

function parseCsv(texto) {
  const filas = [];
  let fila = [];
  let campo = "";
  let comillas = false;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i += 1; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ",") { fila.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i += 1;
      fila.push(campo); campo = "";
      if (fila.some((v) => v !== "")) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }
  const [encabezado, ...datos] = filas;
  return datos.map((f, i) => {
    const obj = { _fila: i + 2 }; // número de fila en el archivo (1 = encabezado)
    encabezado.forEach((col, j) => { obj[col.trim()] = f[j] ?? ""; });
    return obj;
  });
}

function leerFuente(nombre, carpeta = CARPETA) {
  if (!FUENTES.includes(nombre)) throw new Error(`Fuente desconocida: ${nombre}`);
  return parseCsv(fs.readFileSync(path.join(carpeta, `${nombre}.csv`), "utf8"));
}

function extraer(carpeta = CARPETA) {
  return Object.fromEntries(FUENTES.map((f) => [f, leerFuente(f, carpeta)]));
}

module.exports = { FUENTES, parseCsv, leerFuente, extraer };
