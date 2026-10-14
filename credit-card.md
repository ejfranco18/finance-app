# FEATURE: MANEJO DE TARJETAS DE CRÉDITO Y GASTO DIFERIDO

Necesito implementar la lógica y validaciones para manejar compras con Tarjeta de Crédito (TC) y su posterior pago.
Para evitar duplicidad en el reporte de gastos, el modelo contable que usaremos establece que:
- Una compra con TC es un **GASTO** (que deja la cuenta en saldo negativo).
- El pago de la TC es una **TRANSFERENCIA** entre cuentas (no es un gasto).

Las Tarjetas de Crédito se manejarán como registros normales en la tabla `accounts` con el `type = 'Tarjeta de crédito'`, permitiendo que su `current_balance` baje a números negativos.

---

## 1. Validaciones en el Frontend (Formulario de Transacciones)

Cuando el usuario vaya a registrar una transacción:
1. **Selección de Cuenta:** Las cuentas con `type = 'Tarjeta de crédito'` deben aparecer disponibles en el selector de cuentas de origen para gastos.
2. **Registro del Gasto (El día de la compra):**
   - El usuario selecciona la cuenta "TC Nu", categoría "Restaurante" y monto "$60,000".
   - **Validación:** El frontend debe permitir que el gasto se ejecute *incluso si el saldo de la TC está en cero o negativo*, ya que representa una línea de crédito, no efectivo real.
3. **Registro del Pago de la Tarjeta (Días después):**
   - El usuario debe usar la opción de transacción tipo `'TRANSFERENCIA'`.
   - **Cuenta de origen:** Ej. "Bancolombia Ahorros".
   - **Cuenta de destino:** "TC Nu".
   - **Monto:** El valor que está pagando para saldar la deuda.

---

## 2. Validaciones en el Backend / Visualización (Dashboard)

1. **Vistas del Canvas / Resumen de Gastos:**
   - Asegurarse de que el backend *solo* sume al Canvas los movimientos cuyo `category_type` sea `'GASTO'`.
   - Las `'TRANSFERENCIA'` (como el pago de la tarjeta) deben ser excluidas de la sumatoria mensual de gastos. De esta forma, pagar la TC no duplicará el gasto del mes.
2. **Presentación de Saldos en el UI:**
   - En la lista de Cuentas (`accounts`), si una cuenta tipo `'Tarjeta de crédito'` tiene saldo negativo (ej. `-$100,000`), la interfaz debe mostrarla visualmente como "Deuda Actual: $100,000" (preferiblemente en color rojo o indicando saldo a favor del banco).
   - Cuando se reciba una `'TRANSFERENCIA'` desde una cuenta de ahorros, el saldo negativo de la TC sumará (acercándose a cero) y el saldo del ahorro restará.

---