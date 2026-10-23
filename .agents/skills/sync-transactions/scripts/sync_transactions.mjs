import fs from 'node:fs';
import path from 'node:path';
import { Pool } from '@neondatabase/serverless';

const ROOT_DIR = process.cwd();
const TRANSACTIONS_FILE = path.join(ROOT_DIR, 'transactions.md');
const CATEGORIES_FILE = path.join(ROOT_DIR, 'categories.md');
const QUERY_FILE = path.join(ROOT_DIR, 'query.md');
const DEFAULT_USER_ID = '3x2MF8k8fneASdMnlP0iJaast132';

// Known aliases from transactions.md shorthand to official categories.md sub_category_name
const SUBCATEGORY_ALIASES = {
  'Hogar': 'Electrodomesticos',
  'Seguro auto': 'SOAT / Seguro / Impuestos',
  'Transferencia entre cuentas': 'Traspaso entre Cuentas',
};

// Map account name in transactions.md to PL/pgSQL variable in query.md
const ACCOUNT_VAR_MAP = {
  'Nu': 'v_acc_nu',
  'Nu Meridiano': 'v_acc_nu_meridiano',
  'Nequi': 'v_acc_nequi',
  'Efectivo': 'v_acc_efectivo',
  'Nu ahorros': 'v_acc_nu_ahorros',
  'Protti': 'v_acc_protti',
  'Littio': 'v_acc_littio',
  'Dollarapp': 'v_acc_dollarapp',
  'Broker Inversiones': 'v_acc_broker',
};

// Calibrated initial balances prior to line 1 of transactions.md (2026-09-09)
// so that initial_balance + SUM(all transactions) equals the exact real account balances.
const CALIBRATED_INITIAL_BALANCES = {
  'Nu': 1416515.06,
  'Nu Meridiano': 60432.08,
  'Nequi': 40528.95,
  'Efectivo': 135036.69,
  'Nu ahorros': 22204814.43,
  'Protti': 5000000.00,
  'Littio': 14464.60,
  'Dollarapp': 1252.24,
  'Broker Inversiones': 0.00,
};

function inferCategoryTypeFromCatalog(categoryName) {
  const lower = categoryName.toLowerCase();
  if (lower === 'ingresos fijos') return 'INGRESO_FIJO';
  if (lower === 'ingresos variables') return 'INGRESO_VARIABLE';
  if (lower === 'ahorro') return 'AHORRO';
  if (lower === 'inversión' || lower === 'inversion') return 'INVERSION';
  if (lower === 'transferencia') return 'TRANSFERENCIA';
  return 'GASTO';
}

function parseCategoriesCatalog(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const map = new Map(); // sub_category_name.toLowerCase() -> { category_name, sub_category_name, type }
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('|')) continue;
    const parts = line.split('|').map((s) => s.trim());
    if (parts.length >= 2) {
      const [categoryName, subCategoryName] = parts;
      map.set(subCategoryName.toLowerCase(), {
        category_name: categoryName,
        sub_category_name: subCategoryName,
        type: inferCategoryTypeFromCatalog(categoryName),
      });
    }
  }
  return map;
}

function normalizeDate(rawDate) {
  // Supports M/D/YYYY or YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return rawDate;
  const parts = rawDate.split('/');
  if (parts.length !== 3) {
    throw new Error(`Formato de fecha inválido: "${rawDate}"`);
  }
  const [month, day, year] = parts;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function normalizeType(rawType) {
  const upper = rawType.trim().toUpperCase().replace(/\s+/g, '_');
  const valid = new Set(['INGRESO_FIJO', 'INGRESO_VARIABLE', 'GASTO', 'AHORRO', 'INVERSION', 'TRANSFERENCIA']);
  if (!valid.has(upper)) {
    throw new Error(`Tipo de categoría inválido: "${rawType}" -> "${upper}"`);
  }
  return upper;
}

function normalizeAmount(rawAmount) {
  const cleaned = rawAmount.replace(/,/g, '').replace(/\$/g, '').trim();
  const num = Number.parseFloat(cleaned);
  if (Number.isNaN(num)) {
    throw new Error(`Monto inválido: "${rawAmount}"`);
  }
  return Math.abs(num);
}

function escapeSqlLiteral(str) {
  return str.replace(/'/g, "''");
}

function resolveTransferDestinationAccount(categoryType, description, explicitDestAccount) {
  if (categoryType !== 'TRANSFERENCIA') return null;
  if (explicitDestAccount && explicitDestAccount.trim()) {
    return explicitDestAccount.trim();
  }
  if (description.toLowerCase().includes('efectivo')) {
    return 'Efectivo';
  }
  return null;
}

function parseTransactionsFile(filePath, catalogMap) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const parsed = [];

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    const parts = line.split('|').map((s) => s.trim());
    if (parts.length < 7) {
      throw new Error(`Línea ${idx + 1} en transactions.md no tiene 7 columnas separadas por '|': ${rawLine}`);
    }

    const [rawDate, description, rawAmount, rawType, rawSubCategory, accountName, currency, explicitDestAccount] = parts;
    const date = normalizeDate(rawDate);
    const amount = normalizeAmount(rawAmount);
    const category_type = normalizeType(rawType);
    const resolvedSubName = SUBCATEGORY_ALIASES[rawSubCategory] || rawSubCategory;

    const catalogEntry = catalogMap.get(resolvedSubName.toLowerCase());
    if (!catalogEntry) {
      throw new Error(
        `Línea ${idx + 1}: La subcategoría "${rawSubCategory}" (resuelta como "${resolvedSubName}") no existe en categories.md`
      );
    }

    const destination_account_name = resolveTransferDestinationAccount(
      category_type,
      description,
      explicitDestAccount
    );

    parsed.push({
      lineNumber: idx + 1,
      date,
      description,
      amount,
      category_type,
      category_name: catalogEntry.category_name,
      sub_category_name: catalogEntry.sub_category_name,
      account_name: accountName,
      destination_account_name,
      currency: currency.toUpperCase(),
    });
  });

  return parsed;
}

function updateQueryMdFile(queryFilePath, transactions) {
  const content = fs.readFileSync(queryFilePath, 'utf8');

  const sqlLines = transactions.map((tx) => {
    const accVar = ACCOUNT_VAR_MAP[tx.account_name];
    if (!accVar) {
      throw new Error(`Cuenta "${tx.account_name}" no tiene variable PL/pgSQL mapeada en ACCOUNT_VAR_MAP`);
    }
    const subEscaped = escapeSqlLiteral(tx.sub_category_name);
    const catEscaped = escapeSqlLiteral(tx.category_name);
    const descEscaped = escapeSqlLiteral(tx.description);

    if (tx.destination_account_name) {
      const destVar = ACCOUNT_VAR_MAP[tx.destination_account_name];
      if (!destVar) {
        throw new Error(
          `Cuenta destino "${tx.destination_account_name}" no tiene variable PL/pgSQL mapeada en ACCOUNT_VAR_MAP`
        );
      }
      return `    INSERT INTO transactions (user_id, account_id, destination_account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, ${accVar}, ${destVar}, (SELECT id FROM categories WHERE user_id = v_user_id AND type = '${tx.category_type}' AND sub_category_name = '${subEscaped}' LIMIT 1), '${tx.date}', ${tx.amount.toFixed(2)}, '${tx.currency}', '${tx.category_type}', '${catEscaped}', '${subEscaped}', '${descEscaped}');`;
    }

    return `    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, ${accVar}, (SELECT id FROM categories WHERE user_id = v_user_id AND type = '${tx.category_type}' AND sub_category_name = '${subEscaped}' LIMIT 1), '${tx.date}', ${tx.amount.toFixed(2)}, '${tx.currency}', '${tx.category_type}', '${catEscaped}', '${subEscaped}', '${descEscaped}');`;
  });

  const sectionHeaderRegex =
    /(\r?\n\r?\n\s*--\s*=========================================================================\r?\n\s*--\s*7\.\s*MOVIMIENTOS HISTÓRICOS[^\r\n]*\r?\n\s*--\s*=========================================================================\r?\n)([\s\S]*?)(\r?\n\s*--\s*=========================================================================\r?\n\s*--\s*8\.)/;

  if (!sectionHeaderRegex.test(content)) {
    throw new Error('No se encontró la sección "-- 7. MOVIMIENTOS HISTÓRICOS" en query.md');
  }

  const newHeader = `\n\n    -- =========================================================================\n    -- 7. MOVIMIENTOS HISTÓRICOS (${transactions.length} registros desde transactions.md)\n    -- =========================================================================\n`;

  const updated = content.replace(sectionHeaderRegex, `${newHeader}${sqlLines.join('\n')}$3`);
  fs.writeFileSync(queryFilePath, updated, 'utf8');
}

async function syncDatabase(transactions, catalogMap, userId) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL no está definida en las variables de entorno (.env)');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const accRes = await client.query(
      'SELECT id, name FROM accounts WHERE user_id = $1 AND is_active = true',
      [userId]
    );
    const accountByName = new Map(accRes.rows.map((r) => [r.name.toLowerCase(), r.id]));

    const catRes = await client.query(
      'SELECT id, type, category_name, sub_category_name FROM categories WHERE user_id = $1',
      [userId]
    );
    const categoryByKey = new Map(
      catRes.rows.map((r) => [`${r.type}|${r.sub_category_name.toLowerCase()}`, r])
    );

    // Ensure all subcategories in categories.md exist in Neon DB
    let createdCategories = 0;
    for (const entry of catalogMap.values()) {
      const key = `${entry.type}|${entry.sub_category_name.toLowerCase()}`;
      if (!categoryByKey.has(key)) {
        const insCat = await client.query(
          `INSERT INTO categories (user_id, type, category_name, sub_category_name)
           VALUES ($1, $2, $3, $4)
           RETURNING id, type, category_name, sub_category_name`,
          [userId, entry.type, entry.category_name, entry.sub_category_name]
        );
        categoryByKey.set(key, insCat.rows[0]);
        createdCategories += 1;
      }
    }
    if (createdCategories > 0) {
      console.log(`🏷️ Creadas ${createdCategories} nuevas subcategorías en Neon DB desde categories.md`);
    }

    const deleteRes = await client.query('DELETE FROM transactions WHERE user_id = $1', [userId]);
    console.log(`🧹 Eliminados ${deleteRes.rowCount} movimientos previos en Neon DB para user_id=${userId}`);

    for (const tx of transactions) {
      const accountId = accountByName.get(tx.account_name.toLowerCase());
      if (!accountId) {
        throw new Error(
          `Línea ${tx.lineNumber}: No se encontró la cuenta "${tx.account_name}" en la tabla accounts de Neon DB`
        );
      }

      let destinationAccountId = null;
      if (tx.destination_account_name) {
        destinationAccountId = accountByName.get(tx.destination_account_name.toLowerCase());
        if (!destinationAccountId) {
          throw new Error(
            `Línea ${tx.lineNumber}: No se encontró la cuenta destino "${tx.destination_account_name}" en la tabla accounts de Neon DB`
          );
        }
      }

      const catKey = `${tx.category_type}|${tx.sub_category_name.toLowerCase()}`;
      const catRow = categoryByKey.get(catKey);
      const categoryId = catRow ? catRow.id : null;

      await client.query(
        `INSERT INTO transactions (
          user_id, account_id, destination_account_id, category_id, date, amount, currency,
          category_type, category_name, sub_category_name, description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          userId,
          accountId,
          destinationAccountId,
          categoryId,
          tx.date,
          tx.amount.toFixed(2),
          tx.currency,
          tx.category_type,
          tx.category_name,
          tx.sub_category_name,
          tx.description,
        ]
      );
    }

    // Ensure reconciliation and compound interest columns exist
    await client.query(
      `ALTER TABLE accounts
       ADD COLUMN IF NOT EXISTS reconciled_balance NUMERIC(15, 2) DEFAULT NULL,
       ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
       ADD COLUMN IF NOT EXISTS annual_interest_rate NUMERIC(6, 4) NOT NULL DEFAULT 0,
       ADD COLUMN IF NOT EXISTS accumulated_interest NUMERIC(15, 2) NOT NULL DEFAULT 0,
       ADD COLUMN IF NOT EXISTS last_interest_date DATE DEFAULT NULL`
    );

    await client.query(
      `UPDATE accounts
       SET
         annual_interest_rate = 9.3500,
         last_interest_date = COALESCE(last_interest_date, (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date)
       WHERE user_id = $1
         AND LOWER(name) IN ('nu', 'nu meridiano', 'nu ahorros')
         AND annual_interest_rate = 0`,
      [userId]
    );

    // Calibrate initial_balance for known accounts and recalculate current_balance from transactions
    for (const [accName, initBal] of Object.entries(CALIBRATED_INITIAL_BALANCES)) {
      const accId = accountByName.get(accName.toLowerCase());
      if (accId) {
        await client.query(
          `UPDATE accounts
           SET
             initial_balance = $1,
             accumulated_interest = 0,
             last_interest_date = CASE
               WHEN annual_interest_rate > 0 THEN (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date
               ELSE last_interest_date
             END
           WHERE id = $2 AND user_id = $3`,
          [initBal, accId, userId]
        );
      }
    }

    const updatedBalancesRes = await client.query(
      `UPDATE accounts a
       SET
         current_balance = a.initial_balance + COALESCE(a.accumulated_interest, 0) + COALESCE((
           SELECT SUM(
             CASE
               WHEN t.account_id = a.id AND t.category_type IN ('INGRESO_FIJO', 'INGRESO_VARIABLE')
                 THEN t.amount
               WHEN t.account_id = a.id AND t.category_type IN ('GASTO', 'AHORRO', 'INVERSION', 'DEUDA', 'TRANSFERENCIA')
                 THEN -t.amount
               WHEN t.destination_account_id = a.id AND t.category_type = 'TRANSFERENCIA'
                 THEN t.amount
               ELSE 0
             END
           )
           FROM transactions t
           WHERE t.user_id = $1
             AND (t.account_id = a.id OR t.destination_account_id = a.id)
         ), 0),
         updated_at = CURRENT_TIMESTAMP
       WHERE a.user_id = $1 AND a.is_active = true
       RETURNING name, currency, initial_balance, current_balance, annual_interest_rate, accumulated_interest`,
      [userId]
    );

    await client.query('COMMIT');
    console.log(`✅ Insertados ${transactions.length} movimientos en Neon DB desde transactions.md`);
    console.log('💰 Saldos recalculados en Neon DB:');
    for (const row of updatedBalancesRes.rows) {
      const rateTag = Number(row.annual_interest_rate) > 0 ? ` [${Number(row.annual_interest_rate)}% E.A.]` : '';
      console.log(`   - ${row.name} (${row.currency}): ${Number(row.current_balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${rateTag}`);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const catalogMap = parseCategoriesCatalog(CATEGORIES_FILE);
  const transactions = parseTransactionsFile(TRANSACTIONS_FILE, catalogMap);
  console.log(`📄 Leídos ${transactions.length} movimientos válidos desde transactions.md`);

  updateQueryMdFile(QUERY_FILE, transactions);
  console.log(`📝 Actualizado query.md (Sección 7) con ${transactions.length} sentencias INSERT`);

  await syncDatabase(transactions, catalogMap, DEFAULT_USER_ID);
}

main().catch((err) => {
  console.error('❌ Error sincronizando transacciones:', err.message);
  process.exit(1);
});
