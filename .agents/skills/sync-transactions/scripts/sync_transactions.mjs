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

function parseCategoriesCatalog(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const map = new Map(); // sub_category_name -> { category_name, sub_category_name }
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('|')) continue;
    const parts = line.split('|').map((s) => s.trim());
    if (parts.length >= 2) {
      const [categoryName, subCategoryName] = parts;
      map.set(subCategoryName.toLowerCase(), {
        category_name: categoryName,
        sub_category_name: subCategoryName,
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

    const [rawDate, description, rawAmount, rawType, rawSubCategory, accountName, currency] = parts;
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

    parsed.push({
      lineNumber: idx + 1,
      date,
      description,
      amount,
      category_type,
      category_name: catalogEntry.category_name,
      sub_category_name: catalogEntry.sub_category_name,
      account_name: accountName,
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

async function syncDatabase(transactions, userId) {
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

    const deleteRes = await client.query('DELETE FROM transactions WHERE user_id = $1', [userId]);
    console.log(`🧹 Eliminados ${deleteRes.rowCount} movimientos previos en Neon DB para user_id=${userId}`);

    for (const tx of transactions) {
      const accountId = accountByName.get(tx.account_name.toLowerCase());
      if (!accountId) {
        throw new Error(
          `Línea ${tx.lineNumber}: No se encontró la cuenta "${tx.account_name}" en la tabla accounts de Neon DB`
        );
      }

      const catKey = `${tx.category_type}|${tx.sub_category_name.toLowerCase()}`;
      const catRow = categoryByKey.get(catKey);
      const categoryId = catRow ? catRow.id : null;

      await client.query(
        `INSERT INTO transactions (
          user_id, account_id, category_id, date, amount, currency,
          category_type, category_name, sub_category_name, description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          userId,
          accountId,
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

    await client.query('COMMIT');
    console.log(`✅ Insertados ${transactions.length} movimientos en Neon DB desde transactions.md`);
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

  await syncDatabase(transactions, DEFAULT_USER_ID);
}

main().catch((err) => {
  console.error('❌ Error sincronizando transacciones:', err.message);
  process.exit(1);
});
