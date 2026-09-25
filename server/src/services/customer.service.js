import bcrypt from 'bcryptjs';
import sql from 'mssql';
import { getPool } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import { executeReadOnlyQuery } from './database.service.js';

const PASSWORD_ROUNDS = 12;

function cleanString(value) {
  const text = typeof value === 'string' ? value : String(value ?? '');
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeEmail(email) {
  return cleanString(email)?.toLowerCase() ?? null;
}

function mapCustomerRow(row) {
  return {
    id: row.Id,
    fullName: row.FullName,
    phone: row.Phone,
    email: row.Email,
    address: row.Address,
    city: row.City,
    isActive: row.IsActive,
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt,
  };
}

async function findCustomerWithPassword(email) {
  const rows = await executeReadOnlyQuery(
    `
      SELECT TOP 1
        Id,
        FullName,
        Phone,
        Email,
        PasswordHash,
        Address,
        City,
        IsActive,
        CreatedAt,
        UpdatedAt
      FROM dbo.SB_Customers
      WHERE Email = @email
    `,
    [{ name: 'email', type: sql.NVarChar(255), value: email }],
  );
  return rows[0] ?? null;
}

export async function registerCustomer({ fullName, phone, email, password, address, city }) {
  const cleanFullName = cleanString(fullName);
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = typeof password === 'string' ? password : '';

  if (!cleanFullName || !cleanEmail || cleanPassword === '') {
    throw new AppError('Full name, email, and password are required.', 400);
  }

  const existing = await findCustomerWithPassword(cleanEmail);
  if (existing) {
    throw new AppError('A customer with this email already exists.', 409, { code: 'EMAIL_ALREADY_REGISTERED' });
  }

  const passwordHash = await bcrypt.hash(cleanPassword, PASSWORD_ROUNDS);
  const pool = await getPool();
  const request = pool.request();
  request.input('fullName', sql.NVarChar(150), cleanFullName);
  request.input('phone', sql.NVarChar(50), cleanString(phone));
  request.input('email', sql.NVarChar(255), cleanEmail);
  request.input('passwordHash', sql.NVarChar(255), passwordHash);
  request.input('address', sql.NVarChar(255), cleanString(address));
  request.input('city', sql.NVarChar(100), cleanString(city));

  const result = await request.query(`
    INSERT INTO dbo.SB_Customers (
      FullName,
      Phone,
      Email,
      PasswordHash,
      Address,
      City
    )
    OUTPUT inserted.Id,
           inserted.FullName,
           inserted.Phone,
           inserted.Email,
           inserted.Address,
           inserted.City,
           inserted.IsActive,
           inserted.CreatedAt,
           inserted.UpdatedAt
    VALUES (
      @fullName,
      @phone,
      @email,
      @passwordHash,
      @address,
      @city
    )
  `);

  const customer = mapCustomerRow(result.recordset[0]);
  return customer;
}

export async function loginCustomer({ email, password }) {
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = typeof password === 'string' ? password : '';
  if (!cleanEmail || cleanPassword === '') {
    throw new AppError('Email and password are required.', 400);
  }

  const row = await findCustomerWithPassword(cleanEmail);
  if (!row || !row.IsActive) {
    throw new AppError('Invalid email or password.', 401, { code: 'INVALID_CREDENTIALS' });
  }

  const ok = await bcrypt.compare(cleanPassword, row.PasswordHash);
  if (!ok) {
    throw new AppError('Invalid email or password.', 401, { code: 'INVALID_CREDENTIALS' });
  }

  return mapCustomerRow(row);
}

export async function getCustomerById(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new AppError('Invalid customer id.', 400);
  }

  const rows = await executeReadOnlyQuery(
    `
      SELECT TOP 1
        Id,
        FullName,
        Phone,
        Email,
        Address,
        City,
        IsActive,
        CreatedAt,
        UpdatedAt
      FROM dbo.SB_Customers
      WHERE Id = @id
    `,
    [{ name: 'id', type: sql.Int, value: n }],
  );
  const row = rows[0];
  if (!row) {
    throw new AppError('Customer not found.', 404);
  }
  return mapCustomerRow(row);
}
