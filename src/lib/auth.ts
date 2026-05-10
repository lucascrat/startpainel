const TOKEN_KEY = 'admin_token';

export function getToken(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(token: string): void {
  try { sessionStorage.setItem(TOKEN_KEY, token); } catch {}
}

export function clearToken(): void {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch {}
}

export async function login(password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || `Falha no login (${res.status})` };
    if (!data.token) return { ok: false, error: 'Resposta inválida do servidor' };
    setToken(data.token);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Erro de rede' };
  }
}

export function logout(): void {
  clearToken();
  window.dispatchEvent(new CustomEvent('admin-auth-expired'));
}

export async function authFetch(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new CustomEvent('admin-auth-expired'));
  }
  return res;
}
