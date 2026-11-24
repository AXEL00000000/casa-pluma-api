// Pruebas de validación de pedidos de la tienda (sin base de datos)
const test = require("node:test");
const assert = require("node:assert/strict");
const { validarPedido } = require("../src/pedidos/pedidos.service");

test("pedido normal: normaliza la clave y conserva el cliente", () => {
  const r = validarPedido({ cliente: " Ana ", partidas: [{ idProducto: "cp-007", cantidad: 2 }] });
  assert.deepEqual(r, { cliente: "Ana", partidas: [{ idProducto: "CP-007", cantidad: 2 }] });
});

test("partidas repetidas del mismo producto se suman", () => {
  const r = validarPedido({ partidas: [{ idProducto: "CP-001", cantidad: 1 }, { idProducto: "CP-001", cantidad: 3 }] });
  assert.deepEqual(r.partidas, [{ idProducto: "CP-001", cantidad: 4 }]);
});

test("pedido vacío se rechaza", () => {
  assert.throws(() => validarPedido({ partidas: [] }), /no tiene productos/);
});

test("cantidad cero, negativa o decimal se rechaza", () => {
  for (const cantidad of [0, -2, 1.5, "dos"]) {
    assert.throws(() => validarPedido({ partidas: [{ idProducto: "CP-001", cantidad }] }), /Cantidad inválida/);
  }
});

test("clave con formato inválido se rechaza", () => {
  assert.throws(() => validarPedido({ partidas: [{ idProducto: "XX-1", cantidad: 1 }] }), /Clave de producto inválida/);
});

test("límite: 10 unidades se aceptan y 11 se rechazan", () => {
  assert.equal(validarPedido({ partidas: [{ idProducto: "CP-001", cantidad: 10 }] }).partidas[0].cantidad, 10);
  assert.throws(() => validarPedido({ partidas: [{ idProducto: "CP-001", cantidad: 11 }] }), /Máximo 10/);
});
