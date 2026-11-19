-- =====================================================================
-- Casa Pluma · esquema de la base de datos
-- Tablas de la tienda (catálogo, inventario, ventas, reposición) y del
-- módulo DSS (bitácora del ETL y registros rechazados o en revisión).
-- El script es idempotente: se puede ejecutar varias veces.
-- =====================================================================

CREATE TABLE IF NOT EXISTS usuarios (
    id             SERIAL PRIMARY KEY,
    usuario        VARCHAR(50)  NOT NULL UNIQUE,
    nombre         VARCHAR(100) NOT NULL,
    password_hash  VARCHAR(100) NOT NULL,
    rol            VARCHAR(20)  NOT NULL DEFAULT 'inventario'
                   CHECK (rol IN ('admin', 'inventario')),
    activo         BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_en      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS productos (
    id_producto     VARCHAR(10)  PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL UNIQUE,
    lote            VARCHAR(60),
    presentacion    VARCHAR(30)  NOT NULL,
    categoria       VARCHAR(20)  NOT NULL CHECK (categoria IN ('Grano', 'Molido', 'Accesorio')),
    precio          NUMERIC(10,2) NOT NULL CHECK (precio > 0),
    vida_util_dias  INT CHECK (vida_util_dias > 0)
);

-- Una fila por producto: la existencia vigente a la fecha de corte.
-- stock_actual admite NULL: un dato faltante se marca para revisión, no se inventa.
CREATE TABLE IF NOT EXISTS inventario (
    id_producto          VARCHAR(10) PRIMARY KEY REFERENCES productos(id_producto),
    stock_actual         INT CHECK (stock_actual >= 0),
    stock_minimo         INT NOT NULL CHECK (stock_minimo > 0),
    fecha_tostado        DATE,
    fecha_actualizacion  DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS ventas (
    id_venta     VARCHAR(10) PRIMARY KEY,
    id_producto  VARCHAR(10) NOT NULL REFERENCES productos(id_producto),
    fecha        DATE        NOT NULL,
    cantidad     INT         NOT NULL CHECK (cantidad > 0),
    canal        VARCHAR(20) NOT NULL CHECK (canal IN ('Tienda', 'Web', 'Barra'))
);
CREATE INDEX IF NOT EXISTS ix_ventas_producto_fecha ON ventas (id_producto, fecha);

CREATE TABLE IF NOT EXISTS reposicion (
    id_producto              VARCHAR(10) PRIMARY KEY REFERENCES productos(id_producto),
    proveedor                VARCHAR(80) NOT NULL,
    tiempo_reposicion_dias   INT CHECK (tiempo_reposicion_dias > 0),
    disponibilidad           VARCHAR(20) NOT NULL CHECK (disponibilidad IN ('Disponible', 'Limitada', 'Agotado'))
);

CREATE TABLE IF NOT EXISTS etl_ejecuciones (
    id               SERIAL PRIMARY KEY,
    ejecutado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ejecutado_por    VARCHAR(50),
    fecha_corte      DATE,
    extraidos        JSONB NOT NULL,
    cargados         JSONB NOT NULL,
    transformaciones JSONB NOT NULL,
    validaciones     JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS etl_incidencias (
    id              SERIAL PRIMARY KEY,
    id_ejecucion    INT NOT NULL REFERENCES etl_ejecuciones(id) ON DELETE CASCADE,
    tipo            VARCHAR(12) NOT NULL CHECK (tipo IN ('RECHAZADO', 'REVISION')),
    fuente          VARCHAR(20) NOT NULL,
    identificador   VARCHAR(40) NOT NULL,
    campo           VARCHAR(40) NOT NULL,
    valor_original  TEXT,
    regla           VARCHAR(10) NOT NULL,
    motivo          TEXT NOT NULL,
    accion          TEXT NOT NULL
);
