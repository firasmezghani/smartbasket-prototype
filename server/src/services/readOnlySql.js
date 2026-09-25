import { AppError } from '../utils/AppError.js';

// Remove SQL comments before checking the query.
function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n\r]*/g, ' ');
}

// Allow only one `SELECT` (or `WITH ... SELECT`) statement.
export function assertReadOnlySelect(sql) {
  if (typeof sql !== 'string' || !sql.trim()) {
    throw new AppError('SQL must be a non-empty string', 400);
  }

  const withoutComments = stripSqlComments(sql);
  const trimmed = withoutComments.trim();

  // Reject multiple statements (reduces injection risk).
  if (/;/.test(trimmed.slice(0, Math.max(0, trimmed.length - 1)))) {
    throw new AppError('Only a single SQL statement is allowed', 400);
  }

  const upper = trimmed.toUpperCase();

  const writeHints = [
    'INSERT ',
    'UPDATE ',
    'DELETE ',
    'MERGE ',
    'ALTER ',
    'DROP ',
    'TRUNCATE ',
    'CREATE ',
    'GRANT ',
    'REVOKE ',
    'EXEC ',
    'EXECUTE ',
  ];
  for (const hint of writeHints) {
    if (upper.includes(hint)) {
      throw new AppError('Write or DDL keywords are not allowed in read-only queries', 400);
    }
  }

  // The first word must be `SELECT` or `WITH`.
  const leading = trimmed.replace(/^[\s(]+/, '');
  const firstWord = leading.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
  if (!firstWord) {
    throw new AppError('Could not parse SQL statement', 400);
  }

  const kw = firstWord[1].toUpperCase();
  if (kw !== 'SELECT' && kw !== 'WITH') {
    throw new AppError('Only SELECT (or WITH ... SELECT) queries are allowed for read-only access', 400);
  }
}
