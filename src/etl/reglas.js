// TRANSFORM: reglas de limpieza, homologación y validación.
// Son funciones puras (no tocan la base de datos) para poder probarlas solas.

const REGLAS = {
  R01: "Normalizar identificadores: quitar espacios y pasar a mayúsculas",
  R02: "Homologar categoría a Grano, Molido o Accesorio",
  R03: "Convertir precio a número (quitar $ y comas)",
  R04: "Convertir fechas DD/MM/AAAA y DD-MM-AAAA a AAAA-MM-DD",
  R05: "Inventario duplicado: conservar el registro con la fecha de actualización más reciente",
  R06: "Stock vacío o negativo: cargar NULL y marcar el producto para revisión",
  R07: "Venta duplicada exacta: conservar una sola ocurrencia",
  R08: "Venta con cantidad menor o igual a 0: no se carga",
  R09: "Venta de un producto que no existe en el catálogo: no se carga",
  R10: "Venta con fecha posterior a la fecha de corte o no interpretable: no se carga",
  R11: "Homologar canal de venta a Tienda, Web o Barra",
  R12: "Tiempo de reposición: extraer el número; N/D o vacío se carga como NULL y se marca para revisión",
  R13: "Homologar el nombre del proveedor",
};

const CATEGORIAS = { grano: "Grano", molido: "Molido", accesorio: "Accesorio", accesorios: "Accesorio" };
const CANALES = { tienda: "Tienda", web: "Web", barra: "Barra" };
const DISPONIBILIDAD = { disponible: "Disponible", limitada: "Limitada", agotado: "Agotado" };

const limpio = (v) => String(v ?? "").trim();
const clave = (v) => limpio(v).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

function aFecha(valor) {
  const s = limpio(valor);
  let y; let m; let d;
  let match = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) [, y, m, d] = match;
  else if ((match = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/))) [, d, m, y] = match;
  else return null;
  const f = new Date(Date.UTC(+y, +m - 1, +d));
  if (f.getUTCFullYear() !== +y || f.getUTCMonth() !== +m - 1 || f.getUTCDate() !== +d) return null;
  return f.toISOString().slice(0, 10);
}

function aEntero(valor) {
  const s = limpio(valor);
  if (s === "") return null;
  return /^-?\d+$/.test(s) ? Number(s) : NaN;
}

function aPrecio(valor) {
  const s = limpio(valor).replace(/[$,\s]/g, "");
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

function transformar(fuentes) {
  const cambios = [];
  const incidencias = [];
  const anotar = (regla, fuente, registro, campo, antes, despues) =>
    cambios.push({ regla, fuente, registro, campo, antes: String(antes), despues: despues === null ? "NULL" : String(despues) });
  const incidencia = (tipo, regla, fuente, identificador, campo, valor, motivo, accion) =>
    incidencias.push({ tipo, regla, fuente, identificador, campo, valor_original: valor === null ? "" : String(valor), motivo, accion });

  // ------------------------------------------------------------ inventario / productos
  const invCandidatos = fuentes.inventario.map((r) => {
    const id = limpio(r.IdProducto).toUpperCase();
    if (id !== r.IdProducto) anotar("R01", "inventario", id, "IdProducto", r.IdProducto, id);

    const categoria = CATEGORIAS[clave(r.Categoria)] ?? null;
    if (categoria !== r.Categoria) anotar("R02", "inventario", id, "Categoria", r.Categoria, categoria);

    const precio = aPrecio(r.Precio);
    if (String(precio) !== r.Precio) anotar("R03", "inventario", id, "Precio", r.Precio, precio);

    const fechaTostado = r.FechaTostado === "" ? null : aFecha(r.FechaTostado);
    if (r.FechaTostado !== "" && fechaTostado !== r.FechaTostado) anotar("R04", "inventario", id, "FechaTostado", r.FechaTostado, fechaTostado);
    const fechaActualizacion = aFecha(r.FechaActualizacion);
    if (fechaActualizacion !== r.FechaActualizacion) anotar("R04", "inventario", id, "FechaActualizacion", r.FechaActualizacion, fechaActualizacion);

    return {
      _fila: r._fila, original: r, id, nombre: limpio(r.Producto), lote: limpio(r.Lote) || null,
      presentacion: limpio(r.Presentacion), categoria, precio,
      vidaUtil: aEntero(r.VidaUtilDias), stock: aEntero(r.StockActual), stockMinimo: aEntero(r.StockMinimo),
      fechaTostado, fechaActualizacion,
    };
  });

  // R05: un solo registro por producto (el más reciente)
  const porId = new Map();
  for (const c of invCandidatos) {
    const actual = porId.get(c.id);
    if (!actual || c.fechaActualizacion > actual.fechaActualizacion) {
      if (actual) incidencia("RECHAZADO", "R05", "inventario", `${actual.id} (${actual.fechaActualizacion})`, "IdProducto",
        `StockActual=${actual.original.StockActual}`, "Registro duplicado más antiguo", `Se conserva la versión del ${c.fechaActualizacion}`);
      porId.set(c.id, c);
    } else {
      incidencia("RECHAZADO", "R05", "inventario", `${c.id} (${c.fechaActualizacion})`, "IdProducto",
        `StockActual=${c.original.StockActual}`, "Registro duplicado más antiguo", `Se conserva la versión del ${actual.fechaActualizacion}`);
    }
  }

  const productos = [];
  const inventario = [];
  for (const c of porId.values()) {
    if (!c.categoria || Number.isNaN(c.precio) || !c.nombre || !c.fechaActualizacion || !(c.stockMinimo > 0)) {
      incidencia("RECHAZADO", "R02", "inventario", c.id, "Fila completa", JSON.stringify(c.original),
        "Producto sin categoría, precio, nombre, stock mínimo o fecha válidos", "Corregir la fuente de inventario");
      continue;
    }
    let stock = c.stock;
    if (stock === null || Number.isNaN(stock) || stock < 0) {
      incidencia("REVISION", "R06", "inventario", c.id, "StockActual", c.original.StockActual,
        stock === null ? "Stock vacío" : "Stock negativo o no numérico", "Se carga NULL; confirmar existencia con un conteo físico");
      anotar("R06", "inventario", c.id, "StockActual", c.original.StockActual, null);
      stock = null;
    }
    productos.push({ id_producto: c.id, nombre: c.nombre, lote: c.lote, presentacion: c.presentacion,
      categoria: c.categoria, precio: c.precio, vida_util_dias: Number.isNaN(c.vidaUtil) ? null : c.vidaUtil });
    inventario.push({ id_producto: c.id, stock_actual: stock, stock_minimo: c.stockMinimo,
      fecha_tostado: c.fechaTostado, fecha_actualizacion: c.fechaActualizacion });
  }
  const ids = new Set(productos.map((p) => p.id_producto));
  const fechaCorte = inventario.map((i) => i.fecha_actualizacion).sort().at(-1) ?? null;

  // ------------------------------------------------------------ ventas
  const ventas = [];
  const vistas = new Map();
  for (const r of fuentes.ventas) {
    const firma = [r.IdVenta, r.IdProducto, r.Fecha, r.Cantidad, r.Canal].join("|");
    if (vistas.has(r.IdVenta)) {
      const motivo = vistas.get(r.IdVenta) === firma ? "Duplicado exacto de una venta ya cargada" : "IdVenta repetido con datos distintos";
      incidencia("RECHAZADO", "R07", "ventas", r.IdVenta, "Fila completa", firma.replaceAll("|", " · "), motivo,
        vistas.get(r.IdVenta) === firma ? "Se conserva una sola ocurrencia" : "Revisar cuál de las dos ventas es la correcta");
      continue;
    }
    vistas.set(r.IdVenta, firma);

    const id = limpio(r.IdProducto).toUpperCase();
    if (id !== r.IdProducto) anotar("R01", "ventas", r.IdVenta, "IdProducto", r.IdProducto, id);
    const fecha = aFecha(r.Fecha);
    if (fecha && fecha !== r.Fecha) anotar("R04", "ventas", r.IdVenta, "Fecha", r.Fecha, fecha);
    const cantidad = aEntero(r.Cantidad);
    const canal = CANALES[clave(r.Canal)] ?? null;
    if (canal && canal !== r.Canal) anotar("R11", "ventas", r.IdVenta, "Canal", r.Canal, canal);

    if (cantidad === null || Number.isNaN(cantidad) || cantidad <= 0) {
      incidencia("RECHAZADO", "R08", "ventas", r.IdVenta, "Cantidad", r.Cantidad, "Cantidad menor o igual a 0",
        "Confirmar si es devolución o error de captura");
      continue;
    }
    if (!ids.has(id)) {
      incidencia("RECHAZADO", "R09", "ventas", r.IdVenta, "IdProducto", r.IdProducto, "Producto inexistente en el catálogo",
        "Verificar si es un producto nuevo o un error de captura");
      continue;
    }
    if (!fecha || (fechaCorte && fecha > fechaCorte)) {
      incidencia("RECHAZADO", "R10", "ventas", r.IdVenta, "Fecha", r.Fecha,
        fecha ? `Fecha posterior a la fecha de corte (${fechaCorte})` : "Fecha no interpretable", "Corregir la fecha en la fuente de ventas");
      continue;
    }
    if (!canal) {
      incidencia("RECHAZADO", "R11", "ventas", r.IdVenta, "Canal", r.Canal, "Canal desconocido", "Corregir el canal en la fuente");
      continue;
    }
    ventas.push({ id_venta: r.IdVenta, id_producto: id, fecha, cantidad, canal });
  }

  // ------------------------------------------------------------ reposición
  const nombresProveedor = new Map();
  const reposicion = [];
  for (const r of fuentes.reposicion) {
    const id = limpio(r.IdProducto).toUpperCase();
    if (!ids.has(id)) {
      incidencia("RECHAZADO", "R09", "reposicion", id, "IdProducto", r.IdProducto, "Producto inexistente en el catálogo", "Revisar la fuente de reposición");
      continue;
    }
    // R13: el primer nombre bien escrito (no todo mayúsculas/minúsculas) define el estándar
    const k = clave(r.Proveedor);
    const nombre = limpio(r.Proveedor);
    const bienEscrito = nombre !== nombre.toUpperCase() && nombre !== nombre.toLowerCase();
    if (!nombresProveedor.has(k) || (bienEscrito && !nombresProveedor.get(k).bien)) nombresProveedor.set(k, { nombre, bien: bienEscrito });

    const texto = limpio(r.TiempoReposicion);
    let dias = null;
    const num = texto.match(/^(\d+)(\s*d[ií]as?)?$/i);
    if (num) {
      dias = Number(num[1]);
      if (String(dias) !== r.TiempoReposicion) anotar("R12", "reposicion", id, "TiempoReposicion", r.TiempoReposicion, dias);
    } else {
      incidencia("REVISION", "R12", "reposicion", id, "TiempoReposicion", r.TiempoReposicion, "Tiempo de reposición no disponible",
        "Se carga NULL; solicitar el dato al proveedor");
      anotar("R12", "reposicion", id, "TiempoReposicion", r.TiempoReposicion, null);
    }
    reposicion.push({ id_producto: id, proveedor: nombre, k, tiempo_reposicion_dias: dias,
      disponibilidad: DISPONIBILIDAD[clave(r.Disponibilidad)] ?? "Disponible" });
  }
  for (const r of reposicion) {
    const estandar = nombresProveedor.get(r.k).nombre;
    if (estandar !== r.proveedor) anotar("R13", "reposicion", r.id_producto, "Proveedor", r.proveedor, estandar);
    r.proveedor = estandar;
    delete r.k;
  }

  return { productos, inventario, ventas, reposicion, cambios, incidencias, fechaCorte };
}

// Validaciones posteriores a la transformación
function validar(extraidos, datos) {
  const rechazadas = (fuente) => datos.incidencias.filter((i) => i.fuente === fuente && i.tipo === "RECHAZADO").length;
  const unicos = (arr, k) => new Set(arr.map((x) => x[k])).size === arr.length;
  const ids = new Set(datos.productos.map((p) => p.id_producto));
  const r = [
    ["Inventario: extraídos = cargados + rechazados", extraidos.inventario === datos.inventario.length + rechazadas("inventario")],
    ["Ventas: extraídas = cargadas + rechazadas", extraidos.ventas === datos.ventas.length + rechazadas("ventas")],
    ["Reposición: extraídos = cargados + rechazados", extraidos.reposicion === datos.reposicion.length + rechazadas("reposicion")],
    ["Un solo registro de inventario por producto", unicos(datos.inventario, "id_producto")],
    ["IdVenta único", unicos(datos.ventas, "id_venta")],
    ["Ninguna venta con cantidad <= 0", datos.ventas.every((v) => v.cantidad > 0)],
    ["Todas las ventas pertenecen a un producto del catálogo", datos.ventas.every((v) => ids.has(v.id_producto))],
    ["Ninguna venta posterior a la fecha de corte", datos.ventas.every((v) => v.fecha <= datos.fechaCorte)],
    ["Ningún stock negativo", datos.inventario.every((i) => i.stock_actual === null || i.stock_actual >= 0)],
    ["Tiempos de reposición numéricos (> 0) o NULL documentado", datos.reposicion.every((p) => p.tiempo_reposicion_dias === null || p.tiempo_reposicion_dias > 0)],
    ["Categorías homologadas", datos.productos.every((p) => ["Grano", "Molido", "Accesorio"].includes(p.categoria))],
  ];
  return r.map(([comprobacion, cumple]) => ({ comprobacion, cumple }));
}

module.exports = { REGLAS, transformar, validar, aFecha, aEntero, aPrecio };
