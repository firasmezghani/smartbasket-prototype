import { readCustomer } from '../lib/storage';

// `x-customer-id` header for the signed-in customer (empty when signed out).
export async function getCustomerIdentityHeaders(): Promise<Record<string, string>> {
  const customer = await readCustomer();
  if (customer?.id) {
    return { 'x-customer-id': String(customer.id) };
  }
  return {};
}
