// Modelo de decisión: indicadores, prioridad, acción y explicación.
// Es una función pura: recibe los datos de un producto y los parámetros
// del escenario, y regresa la recomendación con su justificación.

const PARAMETROS_BASE = Object.freeze({
  factorDemanda: 1, // 1 = demanda normal, 1.2 = +20 %
  margenSeguridad: 3, // días extra sobre el tiempo de reposición
  diasVentana: 30, // días de ventas que se usan para estimar la demanda
  minimoVentas: 3, // menos ventas que esto: demanda poco confiable
});

const REGLA_PRIORIDAD = {
  "SIN DATOS": "Falta stock o tiempo de reposición: no se emite recomendación categórica.",
  ALTA: "Stock en 0 o cobertura menor o igual al tiempo de reposición: se agota antes de que llegue el reabastecimiento.",
  MEDIA: "Cobertura menor o igual a reposición + margen de seguridad, o stock por debajo del mínimo.",
  BAJA: "Cobertura mayor a reposición + margen y stock en o sobre el mínimo.",
};

const r2 = (n) => (n === null || n === undefined || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);
const diasEntre = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

function evaluarProducto(p, parametros = {}) {
  const prm = { ...PARAMETROS_BASE, ...parametros };
  const esCafe = p.categoria !== "Accesorio";
  const verbo = esCafe ? "Tostar" : "Pedir";

  const faltantes = [];
  if (p.stockActual === null || p.stockActual === undefined) faltantes.push("stock actual");
  if (p.tiempoReposicion === null || p.tiempoReposicion === undefined) faltantes.push("tiempo de reposición");

  const demandaBase = p.unidadesVendidas / prm.diasVentana;
  const demanda = demandaBase * prm.factorDemanda;
  const cobertura = p.stockActual === null || p.stockActual === undefined ? null
    : demanda > 0 ? p.stockActual / demanda : null;
  const diferenciaMinimo = p.stockActual === null || p.stockActual === undefined ? null : p.stockActual - p.stockMinimo;
  const diasDesdeTostado = esCafe && p.fechaTostado ? diasEntre(p.fechaTostado, p.fechaCorte) : null;
  const frescuraRestante = diasDesdeTostado === null || !p.vidaUtil ? null : p.vidaUtil - diasDesdeTostado;
  const rotacion = p.stockActual ? p.unidadesVendidas / p.stockActual : null;

  const indicadores = {
    demandaDiaria: r2(demanda),
    coberturaDias: r2(cobertura),
    diferenciaMinimo,
    frescuraRestanteDias: frescuraRestante,
    rotacion: r2(rotacion),
  };

  const explicacion = [];
  const alertas = [];
  let prioridad;

  if (faltantes.length) {
    prioridad = "SIN DATOS";
    explicacion.push(`Falta ${faltantes.join(" y ")}; no hay sustento para recomendar.`);
  } else {
    const rep = p.tiempoReposicion;
    explicacion.push(`Demanda estimada: ${p.unidadesVendidas} u. vendidas en ${prm.diasVentana} días = ${r2(demandaBase)} u./día`
      + (prm.factorDemanda !== 1 ? ` × ${prm.factorDemanda} (escenario) = ${r2(demanda)} u./día.` : "."));
    if (demanda === 0) {
      prioridad = p.stockActual < p.stockMinimo ? "MEDIA" : "BAJA";
      explicacion.push("Sin ventas en el periodo: no se puede calcular la cobertura.");
    } else if (p.stockActual === 0 || cobertura <= rep) {
      prioridad = "ALTA";
      explicacion.push(p.stockActual === 0
        ? `Stock en 0: el producto está agotado y la reposición tarda ${rep} días.`
        : `Cobertura de ${r2(cobertura)} días ≤ reposición de ${rep} días: se agota antes de reponerse.`);
    } else if (cobertura <= rep + prm.margenSeguridad || p.stockActual < p.stockMinimo) {
      prioridad = "MEDIA";
      if (cobertura <= rep + prm.margenSeguridad) {
        explicacion.push(`Cobertura de ${r2(cobertura)} días ≤ reposición + margen (${rep} + ${prm.margenSeguridad} = ${rep + prm.margenSeguridad} días).`);
      }
      if (p.stockActual < p.stockMinimo) explicacion.push(`Stock de ${p.stockActual} u. por debajo del mínimo de ${p.stockMinimo} u.`);
    } else {
      prioridad = "BAJA";
      explicacion.push(`Cobertura de ${r2(cobertura)} días > reposición + margen (${rep + prm.margenSeguridad} días) y stock sobre el mínimo.`);
    }
  }

  if (p.numVentas < prm.minimoVentas && !faltantes.length) {
    alertas.push(`Solo ${p.numVentas} ventas en el periodo: la demanda estimada es poco confiable.`);
  }
  if (p.disponibilidad === "Limitada") alertas.push("El proveedor reporta disponibilidad limitada: confirmar la cantidad antes de comprometer el pedido.");
  if (p.disponibilidad === "Agotado") alertas.push("El proveedor está agotado: buscar una alternativa.");

  let accion = {
    "SIN DATOS": "Completar datos antes de decidir",
    ALTA: `${verbo} hoy`,
    MEDIA: `${verbo} esta semana`,
    BAJA: "No reabastecer",
  }[prioridad];

  if (frescuraRestante !== null) {
    if (frescuraRestante <= 0) {
      alertas.push(`El café tostado el ${p.fechaTostado} ya superó su vida útil de ${p.vidaUtil} días.`);
      accion = "Retirar de venta y revisar";
    } else if (cobertura !== null && cobertura > frescuraRestante) {
      alertas.push(`Riesgo de frescura: el stock dura ${r2(cobertura)} días y solo le quedan ${frescuraRestante} días de vida útil.`);
      if (prioridad === "BAJA") accion = "Promocionar";
    }
  }

  // Cantidad sugerida: cubrir reposición + margen sin pasar de lo que se vende antes de caducar
  let cantidadSugerida = 0;
  if ((prioridad === "ALTA" || prioridad === "MEDIA") && demanda > 0) {
    let objetivo = Math.max(p.stockMinimo, Math.ceil(demanda * (p.tiempoReposicion + prm.margenSeguridad)));
    if (esCafe && p.vidaUtil) objetivo = Math.min(objetivo, Math.ceil(demanda * p.vidaUtil));
    cantidadSugerida = Math.max(0, objetivo - p.stockActual);
    explicacion.push(`Cantidad sugerida: ${cantidadSugerida} u. para cubrir ${p.tiempoReposicion + prm.margenSeguridad} días`
      + (esCafe && p.vidaUtil ? ` sin pasar de lo que se vende en ${p.vidaUtil} días de vida útil.` : "."));
  }

  return {
    idProducto: p.idProducto,
    nombre: p.nombre,
    categoria: p.categoria,
    proveedor: p.proveedor,
    disponibilidad: p.disponibilidad,
    stockActual: p.stockActual,
    stockMinimo: p.stockMinimo,
    tiempoReposicion: p.tiempoReposicion,
    indicadores,
    prioridad,
    accion,
    cantidadSugerida,
    explicacion,
    alertas,
    trazabilidad: {
      reglaAplicada: REGLA_PRIORIDAD[prioridad],
      fechaCorte: p.fechaCorte,
      ventanaVentas: `${p.desde} a ${p.fechaCorte}`,
      ventasConsideradas: p.numVentas,
      unidadesVendidas: p.unidadesVendidas,
      fechaActualizacionInventario: p.fechaActualizacion,
      fechaTostado: p.fechaTostado,
      parametros: prm,
      fuentes: ["inventario", "ventas", "reposicion"],
    },
  };
}

const ORDEN = { ALTA: 0, "SIN DATOS": 1, MEDIA: 2, BAJA: 3 };
// Dentro de cada prioridad, primero los de menor margen (cobertura - reposición)
const margen = (r) => (r.indicadores.coberturaDias === null ? -1e9 : r.indicadores.coberturaDias - (r.tiempoReposicion ?? 0));
function ordenar(resultados) {
  return [...resultados].sort((a, b) =>
    ORDEN[a.prioridad] - ORDEN[b.prioridad] || margen(a) - margen(b) || a.idProducto.localeCompare(b.idProducto));
}

function resumir(resultados) {
  const cuenta = (pr) => resultados.filter((r) => r.prioridad === pr).length;
  const coberturas = resultados.map((r) => r.indicadores.coberturaDias).filter((c) => c !== null).sort((a, b) => a - b);
  const mediana = coberturas.length ? coberturas[Math.floor((coberturas.length - 1) / 2)] : null;
  return {
    productos: resultados.length,
    alta: cuenta("ALTA"),
    media: cuenta("MEDIA"),
    baja: cuenta("BAJA"),
    sinDatos: cuenta("SIN DATOS"),
    coberturaMediana: mediana,
    riesgoFrescura: resultados.filter((r) => r.alertas.some((a) => a.startsWith("Riesgo de frescura") || a.includes("vida útil de"))).length,
    unidadesSugeridas: resultados.reduce((s, r) => s + r.cantidadSugerida, 0),
  };
}

module.exports = { PARAMETROS_BASE, REGLA_PRIORIDAD, evaluarProducto, ordenar, resumir };
