---
name: sync-transactions
description: Limpia la tabla `transactions` en Neon PostgreSQL, inserta todos los movimientos definidos en `transactions.md` (validándolos contra `categories.md`), y actualiza automáticamente la sección de movimientos históricos en `query.md`. Úsalo durante la etapa de desarrollo y pruebas cada vez que se modifique `transactions.md` o se pida reiniciar/sincronizar los movimientos.
---

# Sync Transactions Skill (`transactions.md` → Neon DB & `query.md`)

Este skill automatiza la limpieza de la tabla `transactions` y la recarga de movimientos de prueba/desarrollo a partir del archivo [`transactions.md`](file:///Users/francomorales/Documents/GitHub/finance-app/transactions.md) en la raíz del proyecto.

## ¿Qué hace exactamente?
1. **Lee y valida el catálogo oficial** desde [`categories.md`](file:///Users/francomorales/Documents/GitHub/finance-app/categories.md), resolviendo alias conocidos (por ejemplo: `'Hogar' -> 'Electrodomesticos'`, `'Seguro auto' -> 'SOAT / Seguro / Impuestos'`).
2. **Parsea [`transactions.md`](file:///Users/francomorales/Documents/GitHub/finance-app/transactions.md)**:
   - Formato esperado por línea: `M/D/YYYY | Descripción | Monto | TIPO | Subcategoría | Cuenta | Moneda`
   - Normaliza fechas a `YYYY-MM-DD`, montos a valores absolutos positivos (`ABS(amount)`), y tipos a su formato de base de datos (`INGRESO_FIJO`, `INGRESO_VARIABLE`, `GASTO`, `AHORRO`, `INVERSION`, `TRANSFERENCIA`).
3. **Actualiza [`query.md`](file:///Users/francomorales/Documents/GitHub/finance-app/query.md)**:
   - Regenera la **Sección 7 (`MOVIMIENTOS HISTÓRICOS`)** con las sentencias `INSERT INTO transactions ...` correspondientes a cada fila de `transactions.md`.
4. **Limpia, recarga Neon PostgreSQL y recalcula saldos en una transacción atómica (`BEGIN ... COMMIT`)**:
   - Crea automáticamente cualquier subcategoría nueva agregada a [`categories.md`](file:///Users/francomorales/Documents/GitHub/finance-app/categories.md) que aún no exista en la tabla `categories`.
   - Ejecuta `DELETE FROM transactions WHERE user_id = '3x2MF8k8fneASdMnlP0iJaast132'`.
   - Inserta todos los registros de `transactions.md` vinculando sus respectivos `account_id`, `destination_account_id` (en transferencias como retiros de efectivo) y `category_id`.
   - Recalcula `accounts.current_balance` para todas las cuentas activas sumando el historial de movimientos sobre su `initial_balance` calibrado.

## Cómo ejecutarlo

Ejecuta el script incluido desde la raíz del repositorio pasando el archivo `.env`:

```bash
npm run sync:transactions
```

O directamente con Node:

```bash
/Users/francomorales/.nvm/versions/node/v25.8.2/bin/node --env-file=.env .agents/skills/sync-transactions/scripts/sync_transactions.mjs
```

## Reglas al agregar nuevos movimientos en `transactions.md`
- Si agregas una subcategoría que sea un alias corto de una subcategoría oficial en [`categories.md`](file:///Users/francomorales/Documents/GitHub/finance-app/categories.md), puedes declararla en `SUBCATEGORY_ALIASES` dentro de [`sync_transactions.mjs`](file:///Users/francomorales/Documents/GitHub/finance-app/.agents/skills/sync-transactions/scripts/sync_transactions.mjs).
- Si agregas una cuenta nueva, asegúrate de que exista en la tabla `accounts` y en `ACCOUNT_VAR_MAP` dentro de [`sync_transactions.mjs`](file:///Users/francomorales/Documents/GitHub/finance-app/.agents/skills/sync-transactions/scripts/sync_transactions.mjs).
