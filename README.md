# Casa Pluma · API con módulo de apoyo a decisiones

API REST de **Casa Pluma** (tienda y tostador de café) con un **módulo DSS** que responde:

> **¿Qué cafés conviene tostar o reabastecer primero esta semana y cuáles requieren atención prioritaria?**

Proyecto integrador de *Desarrollo de Software para la Toma de Decisiones* (ITO).

**Stack:** Node.js + Express · PostgreSQL (Supabase) · JWT + bcrypt

> ⚠️ **Los datos son simulados** con fines académicos (`datos/fuentes/*.csv`, generados con `npm run datos:generar`). No son ventas reales.

## Qué es preexistente y qué es nuevo

| Parte | Origen |
| --- | --- |
| Estructura en capas (`config`, `routes`, `controllers`, `services`, `middleware`, `database`), conexión `pg`, login con bcrypt + JWT | Base de la materia Servicios Web (`backend_for_students`) |
| ETL (`src/etl/`), modelo de decisión (`src/dss/`), tablas de catálogo, inventario, ventas, reposición y bitácora del ETL, rutas `/etl` y `/dss`, pruebas | **Nuevo para esta materia** |

## Cómo correrlo

Requiere Node.js 20 o más reciente.

1. **Base de datos (Supabase).** Crea un proyecto nuevo y copia la cadena de conexión en *Project Settings › Database › Connection string › URI* (si tu red no tiene IPv6, usa la del *Session pooler*).
2. **Variables de entorno.** Copia `.env.example` a `.env` y llena `URL_DB`, `JWT_SECRET` y `ADMIN_PASSWORD`. Las tablas se crean en el esquema `casa_pluma` (`DB_SCHEMA`), así que se puede usar una base que ya tenga tablas de otro proyecto sin tocarlas.
3. **Instala, crea tablas y carga datos:**

```sh
npm install
npm run db:init   # crea las tablas y el usuario admin
npm run etl       # Extract → Transform → Validate → Load (también se puede desde el front)
npm run dev       # http://localhost:3000
```

4. **Pruebas:** `npm test` (matriz de datos normales, faltantes, inconsistentes y casos límite).

## Endpoints

| Método | Ruta | Acceso | Qué hace |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | público | Estado del servicio |
| POST | `/api/v1/auth/login` | público | `{ usuario, password }` → `{ accessToken, usuario }` |
| GET | `/api/v1/productos` | público | Catálogo de la tienda |
| POST | `/api/v1/etl/ejecutar` | admin, inventario | Ejecuta el ETL completo y devuelve el reporte |
| GET | `/api/v1/etl/ultima` | sesión | Última ejecución: conteos, transformaciones, validaciones, rechazados y en revisión |
| GET | `/api/v1/etl/fuentes/:nombre` | sesión | Fuente original sin transformar (`inventario`, `ventas`, `reposicion`) |
| GET | `/api/v1/dss/recomendaciones` | sesión | Indicadores, prioridad, acción y explicación por producto. Parámetros: `factorDemanda`, `margenSeguridad`, `diasVentana` |
| GET | `/api/v1/dss/comparar` | sesión | Compara dos escenarios (`factorBase`, `factorEscenario`) |

## Proceso ETL

| Etapa | Implementación |
| --- | --- |
| Extract | `src/etl/fuentes.js` lee los tres CSV tal como llegan (todo como texto). |
| Transform | `src/etl/reglas.js` aplica las reglas R01–R13 (ver tabla abajo). Cada cambio queda registrado con su valor antes y después. |
| Validate | 11 comprobaciones (conteos cuadran, claves únicas, sin cantidades ≤ 0, sin productos inexistentes, etc.). Si alguna falla, no se carga nada. |
| Load | `src/etl/etl.service.js` carga todo en una transacción y guarda la bitácora en `etl_ejecuciones` y `etl_incidencias`. |

| Regla | Qué hace |
| --- | --- |
| R01 | Normaliza identificadores (espacios y mayúsculas) |
| R02 | Homologa categoría: Grano, Molido, Accesorio |
| R03 | Convierte el precio a número |
| R04 | Convierte fechas DD/MM/AAAA y DD-MM-AAAA a AAAA-MM-DD |
| R05 | Inventario duplicado: conserva el más reciente y rechaza el otro |
| R06 | Stock vacío o negativo: NULL y marcado para revisión (no se inventa un valor) |
| R07 | Venta duplicada: conserva una ocurrencia |
| R08 | Venta con cantidad ≤ 0: se rechaza |
| R09 | Venta de un producto inexistente: se rechaza |
| R10 | Venta con fecha posterior a la fecha de corte: se rechaza |
| R11 | Homologa canal: Tienda, Web, Barra |
| R12 | Tiempo de reposición: "5 días" → 5; "N/D" → NULL en revisión |
| R13 | Homologa el nombre del proveedor |

## Modelo de decisión (`src/dss/modelo.js`)

**Indicadores por producto**

| Indicador | Fórmula |
| --- | --- |
| Demanda diaria | unidades vendidas en la ventana ÷ días de la ventana × factor del escenario |
| Cobertura (días) | stock actual ÷ demanda diaria |
| Diferencia contra el mínimo | stock actual − stock mínimo |
| Frescura restante (días) | vida útil − días desde el tostado |
| Rotación | unidades vendidas ÷ stock actual |

**Prioridad**

| Prioridad | Regla | Acción |
| --- | --- | --- |
| SIN DATOS | Falta stock o tiempo de reposición | Completar datos antes de decidir |
| ALTA | Stock = 0 o cobertura ≤ tiempo de reposición | Tostar / pedir hoy |
| MEDIA | Cobertura ≤ reposición + margen de seguridad, o stock < mínimo | Tostar / pedir esta semana |
| BAJA | Todo lo demás | No reabastecer (o **promocionar** si el stock dura más que su frescura) |

**Cantidad sugerida:** lo necesario para cubrir *reposición + margen* (al menos el stock mínimo), sin pasar de lo que se vende antes de que el café pierda frescura.

**Parámetros configurables:** factor de demanda (escenarios −20 %, normal, +20 % o libre), margen de seguridad (días) y ventana de ventas.

Ejemplo: con 12 unidades y 4 u./día la cobertura es de 3 días; si la reposición tarda 5 días, la prioridad es **ALTA**.

Cada resultado incluye su **explicación** y su **trazabilidad**: regla aplicada, fecha de corte, ventana y número de ventas consideradas, fecha de actualización del inventario y parámetros usados.
