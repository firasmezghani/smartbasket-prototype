// Read-only export of the 91 published products and their barcodes.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, getPool } from '../../../server/src/config/db.js';

const OUT_DIR = dirname(fileURLToPath(import.meta.url));
const SQL_FILE = join(OUT_DIR, 'visible-catalogue-barcodes.sql');
const STATUS_FILE = join(OUT_DIR, 'EXPORT_STATUS.md');
const XLS_FILE = join(OUT_DIR, 'visible-catalogue-barcodes.xls');
const CSV_FILE = join(OUT_DIR, 'visible-catalogue-barcodes.csv');

const HEADERS = [
  'product_id',
  'display_name',
  'source_name',
  'brand',
  'package_amount',
  'package_unit',
  'site_price',
  'display_category',
  'canonical_type',
  'override_decision',
  'classification_status',
  'barcode_status',
  'barcode',
];

function cellValue(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function xmlEscape(value) {
  return cellValue(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function csvCell(value) {
  const s = cellValue(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function spreadsheetMl(rows) {
  const header = HEADERS.map(
    (name) => `<Cell ss:StyleID="Text"><Data ss:Type="String">${xmlEscape(name)}</Data></Cell>`,
  ).join('');
  const body = rows
    .map((row) => {
      const cells = HEADERS.map((name) => {
        const raw = row[name];
        return `<Cell ss:StyleID="Text"><Data ss:Type="String">${xmlEscape(raw)}</Data></Cell>`;
      }).join('');
      return `    <Row>${cells}</Row>`;
    })
    .join('\n');
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Text">
   <NumberFormat ss:Format="@"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Visible product barcodes">
  <Table>
    <Row>${header}</Row>
${body}
  </Table>
 </Worksheet>
</Workbook>
`;
}

async function writeStatus(text) {
  await writeFile(STATUS_FILE, `${text.trim()}\n`, 'utf8');
}

async function main() {
  let sqlText = await readFile(SQL_FILE, 'utf8');
  sqlText = sqlText.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (!sqlText) {
    throw new Error('visible-catalogue-barcodes.sql is empty after comments.');
  }

  try {
    const pool = await getPool();
    const result = await pool.request().query(sqlText);
    const rows = (result.recordset ?? []).map((row) => {
      const out = {};
      for (const name of HEADERS) out[name] = cellValue(row[name]);
      return out;
    });

    await writeFile(XLS_FILE, spreadsheetMl(rows), 'utf8');
    const csv = [
      HEADERS.join(','),
      ...rows.map((row) => HEADERS.map((name) => csvCell(row[name])).join(',')),
    ].join('\n') + '\n';
    await writeFile(CSV_FILE, csv, 'utf8');

    const products = new Set(rows.map((row) => row.product_id).filter(Boolean));
    const missing = rows.filter((row) => row.barcode_status === 'missing').length;
    const present = rows.filter((row) => row.barcode_status === 'present').length;
    await writeStatus(`# Export status — live

Generated from the configured prototype database.

- Result rows (product–barcode pairs, including missing): ${rows.length}
- Distinct product IDs in this export: ${products.size}
- Rows with a barcode present: ${present}
- Rows with barcode missing: ${missing}

Barcode cells in \`visible-catalogue-barcodes.xls\` are stored as text.
CSV is also written; Excel can convert barcode values if opened directly.
`);
    console.log('Wrote live Excel and CSV barcode testing reference.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const safe = message.replace(
      /\b(?:[\w.-]+\\[\w.-]+|[\w.-]+\.database\.windows\.net|\d{1,3}(?:\.\d{1,3}){3}|password=.*$)\b/gi,
      '[redacted]',
    );
    await writeStatus(`# Export status — pending

Live Excel/CSV export was not written. The database was not reachable from
this run (or the query failed). Use \`visible-catalogue-barcodes.sql\` in the
database client for the current combined table.

Do not substitute the 19 September 2026 audit CSV as a current export.

Error class (redacted): ${safe.split('\n')[0]}
`);
    console.error('Live barcode export pending. SQL file is still usable in the database client.');
    process.exitCode = 2;
  } finally {
    try {
      await closePool();
    } catch {
      /* ignore */
    }
  }
}

await main();
