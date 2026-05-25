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

// ── Ativação de app na TV (App + Nome da Lista + MAC/Código) ────────────────
// O `nameApp` que a API espera é o "value" (sem espaços), NÃO o label visível.
// Apps "xstream" usam Código no lugar do MAC e vão para outra rota.
export interface WarezTvApp {
  value: string;     // o que a API espera em nameApp
  label: string;     // nome amigável
  xstream: boolean;  // true = usa Código (rota /xstream); false = usa MAC
}

export const WAREZ_TV_APPS: WarezTvApp[] = [
  { value: 'WTV Player/Wapp', label: 'WTV Player/Wapp', xstream: true },
  { value: 'XCloud',          label: 'XCloud',          xstream: true },
  { value: 'Kplay',           label: 'Kplay',           xstream: true },
  { value: 'BrasilIPTV',      label: 'Brasil IPTV',     xstream: false },
  { value: 'EasyPlayer',      label: 'Easy Player',     xstream: false },
  { value: 'IPTV+',           label: 'IPTV+',           xstream: false },
  { value: 'IPTVNextPlayer',  label: 'IPTV Next Player',xstream: false },
  { value: 'IPTVPlayerio',    label: 'IPTV Player io',  xstream: false },
  { value: 'IPTVProPlayer',   label: 'IPTV Pro Player', xstream: false },
  { value: 'IPTVStarPlayer',  label: 'IPTV Star Player',xstream: false },
  { value: 'IPlayer',         label: 'I Player',        xstream: false },
  { value: 'OttPlayer',       label: 'Ott Player',      xstream: false },
  { value: 'TVVision',        label: 'TV Vision',       xstream: false },
  { value: 'TiviPlayerIPTV',  label: 'TiviPlayer IPTV', xstream: false },
  { value: 'IPTV4K',          label: 'IPTV 4K',         xstream: false },
];

const norm = (s: string) => (s || '').toLowerCase().replace(/[\s\/_+-]/g, '');

/** Resolve um nome livre (label, value ou variação) para o app da Warez. */
export function resolveWarezApp(name: string): WarezTvApp | null {
  if (!name) return null;
  const k = norm(name);
  return (
    WAREZ_TV_APPS.find(a => norm(a.label) === k || norm(a.value) === k) ||
    WAREZ_TV_APPS.find(a => norm(a.label).includes(k) || norm(a.value).includes(k)) ||
    null
  );
}

/**
 * Ativa um app na TV do cliente.
 * @param app         App resolvido (value + xstream).
 * @param namePlaylist Nome da lista que aparece no app.
 * @param macOrCode   MAC (apps comuns) ou Código (apps xstream).
 * @param lineId      id_user = id da linha Warez do cliente.
 */
export async function activateApp(
  app: WarezTvApp,
  namePlaylist: string,
  macOrCode: string,
  lineId: number,
): Promise<{ success: boolean }> {
  const path = app.xstream ? '/lines/active/app/xstream' : '/lines/active/app';
  return wz<{ success: boolean }>('POST', path, {
    nameApp: app.value,
    namePlaylist,
    mac: macOrCode,
    id_user: lineId,
  });
}
