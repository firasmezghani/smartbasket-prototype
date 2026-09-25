import type { CustomerSession } from '../lib/storage';
import { apiUrl, handleResponse } from './http';

export type RegisterPayload = {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  address?: string;
  city?: string;
};

export async function registerCustomer(payload: RegisterPayload): Promise<CustomerSession> {
  const res = await fetch(apiUrl('/api/customers/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await handleResponse<{ data: { customer: CustomerSession } }>(res);
  return body.data.customer;
}

export async function loginCustomer(email: string, password: string): Promise<CustomerSession> {
  const res = await fetch(apiUrl('/api/customers/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await handleResponse<{ data: { customer: CustomerSession } }>(res);
  return body.data.customer;
}
