/**
 * Wareztv / Wplay API client
 * Base: https://mcapi.knewcms.com:2087
 * Auth: Authorization: Bearer <WAREZTV_API_KEY>
 */

const WAREZTV_BASE = process.env.WAREZTV_API_URL || 'https://mcapi.knewcms.com:2087';
const WAREZTV_KEY  = process.env.WAREZTV_API_KEY  || '';

// Default package IDs for test generation (discovered from live API responses)
const DEFAULT_PACKAGE_P2P  = '64399dca5ea59e8a1de2b083';
const DEFAULT_PLAN_ID      = 2; // "Essencial 2 IPTV + 1 P2P"

export interface WarezLine {
  id: number;
  username: string;
  password: string;
  exp_date: string;
  status: number;      // 1=active, 0=disabled
  is_trial: number;    // 1=test, 0=regular
  whatsapp: string | null;
  notes: string;
  max_connections: number;
  plan: { id: number; name: string; credits: string; days: number } | null;
  createdAt: string;
  updatedAt: string;
  access_code: string | null;
}

export interface WarezListResponse {
  items: WarezLine[];
  meta?: { totalItems: number; currentPage: number; totalPages: number };
}

function headers() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${WAREZTV_KEY}`,
  };
}

async function wz<T>(method: string, path: string, body?: object): Promise<T> {
  const res = await fetch(`${WAREZTV_BASE}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json() as any;
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join('; ') : (data?.message || data?.error || res.statusText);
    throw new Error(`WarezTV API ${res.status}: ${msg}`);
  }
  return data as T;
}

/** List active (non-trial) clients */
export async function listClients(page = 1, perPage = 100): Promise<WarezListResponse> {
  return wz<WarezListResponse>('GET', `/lines?page=${page}&quantityPerPage=${perPage}&is_trial=0&trash=0`);
}

/** List test clients */
export async function listTests(page = 1, perPage = 50): Promise<WarezListResponse> {
  return wz<WarezListResponse>('GET', `/lines/test?page=${page}&quantityPerPage=${perPage}&is_trial=1&trash=0`);
}

/** Generate a free 6-hour test */
export async function generateTest(notes = ''): Promise<WarezLine> {
  const body: any = { package_p2p: DEFAULT_PACKAGE_P2P };
  if (notes) body.notes = notes;
  return wz<WarezLine>('POST', '/lines/test', body);
}

/** Create a paid client (consumes 1 credit = 1 month) */
export async function createClient(opts: {
  whatsapp?: string;
  country?: string;
  planId?: number;
  days?: number;
  notes?: string;
}): Promise<WarezLine> {
  return wz<WarezLine>('POST', '/lines/v2', {
    isTrial: 0,
    whatsapp: opts.whatsapp || '',
    country: opts.country || 'Brasil',
    planId: opts.planId ?? DEFAULT_PLAN_ID,
    days: opts.days ?? 30,
    ...(opts.notes ? { notes: opts.notes } : {}),
  });
}

/** Extend a client by credits (1 credit = 1 month) */
export async function extendClient(lineId: number, credits = 1): Promise<WarezLine> {
  // extend-preview confirms the operation and executes it on the Wplay side
  return wz<WarezLine>('GET', `/lines/extend-preview/${lineId}?credits=${credits}`);
}

/** Delete a client */
export async function deleteClient(lineId: number): Promise<{ msg: string }> {
  return wz<{ msg: string }>('DELETE', `/lines/${lineId}`);
}

/** Reset password and return updated client */
export async function resetPassword(lineId: number): Promise<WarezLine> {
  return wz<WarezLine>('GET', `/lines/reset-password/${lineId}`);
}

/** Get reseller info (balance, etc.) */
export async function getReseller() {
  return wz<any>('GET', '/users/logged');
}

/** Get available products/plans */
export async function getProducts() {
  return wz<any>('GET', '/products');
}
