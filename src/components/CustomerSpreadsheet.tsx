import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Customer, CustomerApp } from '../types';
import { authFetch } from '../lib/auth';
import { toast } from 'sonner';
import {
  Users, Search, RefreshCw, Save, Trash2,
  ArrowUp, ArrowDown, ArrowUpDown, Loader2, X,
  MessageSquare, ChevronLeft, ChevronRight, Download,
  ChevronDown, ChevronUp, Tv, Smartphone, DollarSign,
  TrendingUp, TrendingDown, Wallet, Plus, Pencil,
} from 'lucide-react';
import { format, isAfter, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type SortKey = 'name' | 'username' | 'whatsapp' | 'renewal_price' | 'cost_per_credit' | 'lines_count' | 'cost_total' | 'profit' | 'amount_paid' | 'expiration_date' | 'last_renewal' | 'created_at' | 'password' | 'status' | 'provider' | 'apps_count';
type SortDir = 'asc' | 'desc';

interface CellEdit {
  customerId: string | number;
  field: string;
  value: string;
}

const STATUS_OPTIONS = ['active', 'expired', 'teste'] as const;
const PROVIDER_OPTIONS = ['startpainel', 'wareztv', 'outro'] as const;
const EDITABLE_FIELDS = ['name', 'username', 'whatsapp', 'renewal_price', 'cost_per_credit', 'lines_count', 'amount_paid', 'expiration_date', 'last_renewal', 'password', 'status', 'provider'];
const NUMBER_FIELDS = ['renewal_price', 'cost_per_credit', 'lines_count', 'amount_paid'];
const DATE_FIELDS = ['expiration_date', 'last_renewal'];
const COLUMN_LABELS: Record<string, string> = {
  name: 'Nome', username: 'Usuário', whatsapp: 'WhatsApp',
  renewal_price: 'R$ Mensal', cost_per_credit: 'Custo/Linha', lines_count: 'Linhas',
  cost_total: 'R$ Custo', profit: 'R$ Lucro', amount_paid: 'Total Pago',
  expiration_date: 'Vencimento', last_renewal: 'Últ. Pagto', created_at: 'Cadastro',
  password: 'Senha Lista', status: 'Status', provider: 'Provedor', apps_count: 'Apps',
};

const fmtBRL = (n: any) => `R$ ${Number(n || 0).toFixed(2)}`;

function StatCard({ icon, label, value, color, sub }: { icon: React.ReactNode; label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3 shadow-sm">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest truncate">{label}</p>
        <p className="text-sm font-black text-slate-800 leading-tight truncate">{value}</p>
        {sub && <p className="text-[8px] font-bold text-slate-400 truncate">{sub}</p>}
      </div>
    </div>
  );
}

export default function CustomerSpreadsheet() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'expired' | 'teste'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [editCell, setEditCell] = useState<CellEdit | null>(null);
  const [dirtyIds, setDirtyIds] = useState<Set<string | number>>(new Set());
  const [pendingChanges, setPendingChanges] = useState<Record<string, any>>({});
  const [savingIds, setSavingIds] = useState<Set<string | number>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string | number>>(new Set());
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  useEffect(() => { loadCustomers(); }, []);

  useEffect(() => {
    if (editCell && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement) inputRef.current.select();
    }
  }, [editCell]);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/customers');
      if (!res.ok) throw new Error('Falha ao carregar');
      const data = await res.json();
      setCustomers(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao carregar clientes');
    } finally {
      setLoading(false);
    }
  };

  const getCostTotal = (c: Customer) => Number(c.cost_per_credit || 0) * Number(c.lines_count || 1);
  const getProfit = (c: Customer) => Number(c.renewal_price || 0) - getCostTotal(c);

  const startEdit = (customerId: string | number, field: string, currentValue: any) => {
    if (!EDITABLE_FIELDS.includes(field)) return;
    setEditCell({ customerId, field, value: String(currentValue ?? '') });
  };

  const commitEdit = useCallback(async () => {
    if (!editCell) return;
    const { customerId, field, value } = editCell;
    const customer = customers.find(c => c.id === customerId);
    if (!customer) { setEditCell(null); return; }
    const oldValue = (customer as any)[field];
    if (value === String(oldValue ?? '')) { setEditCell(null); return; }
    setPendingChanges(prev => ({ ...prev, [customerId]: { ...(prev[customerId] || {}), [field]: value } }));
    setDirtyIds(prev => new Set(prev).add(customerId));
    setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, [field]: value } : c));
    setEditCell(null);
  }, [editCell, customers]);

  const cancelEdit = () => setEditCell(null);

  const saveCustomer = async (customerId: string | number) => {
    const changes = pendingChanges[customerId];
    if (!changes) return;
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    setSavingIds(prev => new Set(prev).add(customerId));
    try {
      const payload: any = { ...changes };
      for (const f of NUMBER_FIELDS) {
        if (payload[f] !== undefined) {
          const n = f === 'lines_count' ? parseInt(payload[f]) : parseFloat(String(payload[f]).replace(',', '.'));
          payload[f] = isNaN(n) ? 0 : n;
        }
      }
      const res = await authFetch(`/api/customers/${customerId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || `HTTP ${res.status}`); }
      toast.success(`${customer.name || customer.username} salvo`);
      setPendingChanges(prev => { const n = { ...prev }; delete n[customerId]; return n; });
      setDirtyIds(prev => { const n = new Set(prev); n.delete(customerId); return n; });
    } catch (e: any) {
      toast.error(`Erro ao salvar: ${e.message}`);
    } finally {
      setSavingIds(prev => { const n = new Set(prev); n.delete(customerId); return n; });
    }
  };

  const saveAll = async () => {
    const ids = [...dirtyIds];
    if (ids.length === 0) { toast.info('Nenhuma alteração pendente'); return; }
    toast.promise(Promise.all(ids.map(id => saveCustomer(id))),
      { loading: `Salvando ${ids.length} cliente(s)...`, success: 'Tudo salvo!', error: 'Alguns falharam' });
  };

  const deleteCustomer = async (customerId: string | number) => {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    if (!confirm(`Excluir ${customer.name || customer.username}? Esta ação NÃO pode ser desfeita.`)) return;
    try {
      const res = await authFetch(`/api/customers/${customerId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(`${customer.name || customer.username} excluído`);
      setCustomers(prev => prev.filter(c => c.id !== customerId));
      setDirtyIds(prev => { const n = new Set(prev); n.delete(customerId); return n; });
      setPendingChanges(prev => { const n = { ...prev }; delete n[customerId]; return n; });
    } catch (e: any) { toast.error(`Erro: ${e.message}`); }
  };

  const revertCustomer = (customerId: string | number) => {
    setPendingChanges(prev => { const n = { ...prev }; delete n[customerId]; return n; });
    setDirtyIds(prev => { const n = new Set(prev); n.delete(customerId); return n; });
    loadCustomers();
  };

  const toggleExpand = (customerId: string | number) => {
    setExpandedRows(prev => { const n = new Set(prev); n.has(customerId) ? n.delete(customerId) : n.add(customerId); return n; });
  };

  // --- App (dispositivo) editing ---
  const [editingAppId, setEditingAppId] = useState<number | null>(null);
  const [appDraft, setAppDraft] = useState<CustomerApp | null>(null);
  const [savingApp, setSavingApp] = useState(false);
  const [addingAppFor, setAddingAppFor] = useState<string | number | null>(null);

  const startEditApp = (app: CustomerApp) => { setEditingAppId(app.id!); setAppDraft({ ...app }); };
  const cancelEditApp = () => { setEditingAppId(null); setAppDraft(null); };

  const updateAppField = (field: keyof CustomerApp, value: any) => {
    if (!appDraft) return;
    setAppDraft({ ...appDraft, [field]: value });
  };

  const saveApp = async () => {
    if (!appDraft || !editingAppId) return;
    setSavingApp(true);
    try {
      const res = await authFetch(`/api/apps/${editingAppId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_name: appDraft.app_name, app_model: appDraft.app_model, access_type: appDraft.access_type,
          mac_address: appDraft.mac_address, device_key: appDraft.device_key,
          username: appDraft.username, password: appDraft.password,
          provider_url: appDraft.provider_url, host: appDraft.host,
          android_link: appDraft.android_link, ios_link: appDraft.ios_link, is_tv: appDraft.is_tv,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      const updated = await res.json();
      setCustomers(prev => prev.map(c => {
        if (c.id !== appDraft.customer_id) return c;
        return { ...c, apps: (c.apps || []).map(a => a.id === updated.id ? updated : a) };
      }));
      toast.success('Dispositivo salvo');
      cancelEditApp();
    } catch (e: any) { toast.error(`Erro: ${e.message}`); }
    finally { setSavingApp(false); }
  };

  const deleteApp = async (appId: number, customerId: string | number) => {
    if (!confirm('Excluir este dispositivo?')) return;
    try {
      const res = await authFetch(`/api/apps/${appId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCustomers(prev => prev.map(c => c.id !== customerId ? c : { ...c, apps: (c.apps || []).filter(a => a.id !== appId) }));
      toast.success('Dispositivo excluído');
    } catch (e: any) { toast.error(`Erro: ${e.message}`); }
  };

  const addApp = async (customerId: string | number) => {
    const draft = appDraft || { customer_id: Number(customerId), app_name: '', app_model: '', access_type: 'mac_key' as const, mac_address: '', device_key: '', is_tv: true };
    if (!draft.app_name?.trim()) { toast.error('Nome do app é obrigatório'); return; }
    setSavingApp(true);
    try {
      const res = await authFetch(`/api/customers/${customerId}/apps`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_name: draft.app_name, app_model: draft.app_model || null, access_type: draft.access_type,
          mac_address: draft.mac_address || null, device_key: draft.device_key || null,
          username: draft.username || null, password: draft.password || null,
          host: draft.host || null, is_tv: draft.is_tv,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      const created = await res.json();
      setCustomers(prev => prev.map(c => c.id !== customerId ? c : { ...c, apps: [created, ...(c.apps || [])] }));
      toast.success('Dispositivo adicionado');
      setAddingAppFor(null); setAppDraft(null);
    } catch (e: any) { toast.error(`Erro: ${e.message}`); }
    finally { setSavingApp(false); }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sortedFiltered = React.useMemo(() => {
    let list = customers.filter(c => {
      const q = searchTerm.toLowerCase();
      const matchesSearch = !q || (c.username || '').toLowerCase().includes(q) || (c.name || '').toLowerCase().includes(q) || (c.whatsapp || '').includes(q);
      const isExpired = c.expiration_date ? !isAfter(parseISO(c.expiration_date), new Date()) : false;
      const matchesFilter = filter === 'all' ? true : filter === 'active' ? (!isExpired && c.status !== 'teste') : filter === 'expired' ? isExpired : filter === 'teste' ? c.status === 'teste' : true;
      return matchesSearch && matchesFilter;
    });
    list.sort((a, b) => {
      let av: any, bv: any;
      if (sortKey === 'apps_count') { av = (a as any).apps?.length || 0; bv = (b as any).apps?.length || 0; }
      else if (sortKey === 'cost_total') { av = getCostTotal(a); bv = getCostTotal(b); }
      else if (sortKey === 'profit') { av = getProfit(a); bv = getProfit(b); }
      else { av = (a as any)[sortKey] ?? ''; bv = (b as any)[sortKey] ?? ''; }
      if (sortKey === 'expiration_date' || sortKey === 'last_renewal' || sortKey === 'created_at') { av = av ? new Date(av).getTime() : 0; bv = bv ? new Date(bv).getTime() : 0; }
      else if (NUMBER_FIELDS.includes(sortKey) || sortKey === 'cost_total' || sortKey === 'profit' || sortKey === 'apps_count') { av = Number(av) || 0; bv = Number(bv) || 0; }
      else { av = String(av).toLowerCase(); bv = String(bv).toLowerCase(); }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [customers, searchTerm, filter, sortKey, sortDir]);

  const totals = React.useMemo(() => {
    const active = sortedFiltered.filter(c => { const expired = c.expiration_date ? !isAfter(parseISO(c.expiration_date), new Date()) : false; return !expired && c.status !== 'teste'; });
    return {
      count: sortedFiltered.length,
      activeCount: active.length,
      monthlyRevenue: active.reduce((s, c) => s + Number(c.renewal_price || 0), 0),
      monthlyCost: active.reduce((s, c) => s + getCostTotal(c), 0),
      totalPaid: sortedFiltered.reduce((s, c) => s + Number(c.amount_paid || 0), 0),
    };
  }, [sortedFiltered]);
  const monthlyProfit = totals.monthlyRevenue - totals.monthlyCost;

  const totalPages = Math.ceil(sortedFiltered.length / pageSize);
  const currentPage = Math.min(page, Math.max(0, totalPages - 1));
  const paged = sortedFiltered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  const exportCSV = () => {
    const headers = ['Nome', 'Usuario', 'WhatsApp', 'R$ Mensal', 'Linhas', 'Custo/Linha', 'R$ Custo Total', 'R$ Lucro', 'Total Pago', 'Vencimento', 'Últ. Pagto', 'Senha Lista', 'Cadastro', 'Status', 'Provedor', 'Apps'];
    const rows = sortedFiltered.map(c => [
      `"${(c.name || '').replace(/"/g, '""')}"`, `"${(c.username || '').replace(/"/g, '""')}"`, `"${(c.whatsapp || '').replace(/"/g, '""')}"`,
      Number(c.renewal_price || 0).toFixed(2), c.lines_count || 1, Number(c.cost_per_credit || 0).toFixed(2),
      getCostTotal(c).toFixed(2), getProfit(c).toFixed(2), Number(c.amount_paid || 0).toFixed(2),
      c.expiration_date ? format(parseISO(c.expiration_date), 'dd/MM/yyyy') : '',
      c.last_renewal ? format(parseISO(c.last_renewal), 'dd/MM/yyyy') : '',
      `"${(c.password || '').replace(/"/g, '""')}"`,
      c.created_at ? format(parseISO(c.created_at), 'dd/MM/yyyy') : '',
      c.status || '', c.provider || '',
      (c as any).apps?.length || 0,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `clientes_${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const sortableHeader = (key: SortKey, label: string, extraClass = '') => (
    <th onClick={() => toggleSort(key)} className={`px-2 py-2 cursor-pointer select-none whitespace-nowrap hover:bg-slate-700 transition-colors ${extraClass}`}>
      <div className="flex items-center gap-1">
        <span>{label}</span>
        {sortKey === key ? (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ArrowUpDown size={11} className="opacity-30" />}
      </div>
    </th>
  );

  const renderCell = (customer: Customer, field: string, widthClass = '') => {
    const isEditing = editCell?.customerId === customer.id && editCell?.field === field;
    const value = (customer as any)[field];
    const isDirty = dirtyIds.has(customer.id) && pendingChanges[customer.id]?.[field] !== undefined;
    const editable = EDITABLE_FIELDS.includes(field);

    if (isEditing) {
      const isSelect = field === 'status' || field === 'provider';
      if (isSelect) {
        const options = field === 'status' ? STATUS_OPTIONS : PROVIDER_OPTIONS;
        return (
          <td className={`px-1 py-1 ${widthClass}`}>
            <select ref={ref => { inputRef.current = ref; }} value={editCell!.value}
              onChange={e => setEditCell({ ...editCell!, value: e.target.value })} onBlur={commitEdit}
              className="w-full px-1 py-0.5 bg-white border border-indigo-500 rounded text-[10px] outline-none">
              {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </td>
        );
      }
      const isNumber = NUMBER_FIELDS.includes(field);
      const isDate = DATE_FIELDS.includes(field);
      return (
        <td className={`px-1 py-1 ${widthClass}`}>
          <input ref={ref => { inputRef.current = ref; }}
            type={isDate ? 'date' : isNumber ? 'number' : 'text'}
            step={isNumber ? '0.01' : undefined}
            value={editCell!.value}
            onChange={e => setEditCell({ ...editCell!, value: e.target.value })}
            onBlur={commitEdit}
            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
            className={`w-full px-1 py-0.5 bg-white border border-indigo-500 rounded outline-none ${isNumber ? 'text-right' : ''} text-[10px]`} />
        </td>
      );
    }

    let display: React.ReactNode = value || '—';
    if (field === 'expiration_date' && value) {
      const expired = !isAfter(parseISO(value), new Date());
      display = <span className={expired ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>{format(parseISO(value), 'dd/MM/yy')}</span>;
    }
    if (field === 'created_at' && value) {
      display = <span className="text-slate-500">{format(parseISO(value), 'dd/MM/yy')}</span>;
    }
    if (field === 'last_renewal' && value) {
      display = <span className="text-slate-600">{format(parseISO(value), 'dd/MM/yy')}</span>;
    }
    if (field === 'password' && value) {
      display = <span className="font-mono text-slate-500">{value}</span>;
    }
    if (NUMBER_FIELDS.includes(field) && value !== undefined && value !== '' && value !== null) {
      display = <span className="font-mono">{Number(value).toFixed(field === 'lines_count' ? 0 : 2)}</span>;
    }
    if (field === 'status') {
      const colors: Record<string, string> = { active: 'bg-emerald-100 text-emerald-700', expired: 'bg-rose-100 text-rose-700', teste: 'bg-amber-100 text-amber-700' };
      display = <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${colors[value] || 'bg-slate-100 text-slate-500'}`}>{value || 'active'}</span>;
    }
    if (field === 'whatsapp' && value) display = <span className="text-emerald-600">{value}</span>;
    if (field === 'apps_count') {
      const count = (customer as any).apps?.length || 0;
      display = <span className="text-center font-bold">{count > 0 ? count : '—'}</span>;
    }

    return (
      <td onClick={() => editable && startEdit(customer.id!, field, value)}
        className={`px-2 py-1.5 text-[10px] truncate max-w-[160px] ${widthClass} ${editable ? 'cursor-text hover:bg-indigo-50/50' : 'cursor-default'} ${isDirty ? 'bg-amber-50 ring-1 ring-amber-200' : ''}`}
        title={typeof value === 'string' ? value : ''}>
        {display}
      </td>
    );
  };

  const APP_FIELDS: { key: keyof CustomerApp; label: string; mono?: boolean; showFor?: string[] }[] = [
    { key: 'app_name', label: 'App' },
    { key: 'app_model', label: 'Modelo' },
    { key: 'mac_address', label: 'MAC', mono: true, showFor: ['mac_key'] },
    { key: 'device_key', label: 'Key', mono: true, showFor: ['mac_key'] },
    { key: 'host', label: 'Host', mono: true, showFor: ['xtream', 'xtream_full'] },
    { key: 'username', label: 'Usuário', showFor: ['xtream', 'xtream_full', 'user_pass'] },
    { key: 'password', label: 'Senha', showFor: ['xtream', 'xtream_full', 'user_pass'] },
    { key: 'android_link', label: 'Android' },
    { key: 'ios_link', label: 'iOS' },
  ];

  const renderAppField = (app: CustomerApp, field: typeof APP_FIELDS[0]) => {
    const value = (app as any)[field.key] || '';
    if (field.showFor && !field.showFor.includes(app.access_type)) return null;
    return (
      <div key={field.key} className="flex items-center gap-1">
        <span className="text-slate-400 w-12 shrink-0 text-[8px] font-bold uppercase">{field.label}</span>
        <span className={`font-bold text-slate-700 truncate ${field.mono ? 'font-mono' : ''}`} title={value}>{value || '—'}</span>
      </div>
    );
  };

  const renderEditableAppField = (field: typeof APP_FIELDS[0]) => {
    if (!appDraft) return null;
    if (field.showFor && !field.showFor.includes(appDraft.access_type)) return null;
    const value = (appDraft as any)[field.key] || '';
    return (
      <div key={field.key} className="flex items-center gap-1">
        <span className="text-slate-400 w-12 shrink-0 text-[8px] font-bold uppercase">{field.label}</span>
        <input
          value={value}
          onChange={e => updateAppField(field.key, e.target.value)}
          className={`flex-1 px-1.5 py-1 bg-slate-50 border border-indigo-300 rounded text-[10px] outline-none focus:ring-1 focus:ring-indigo-500 ${field.mono ? 'font-mono' : ''}`}
        />
      </div>
    );
  };

  const renderExpandedApps = (customer: Customer) => {
    const apps: CustomerApp[] = (customer as any).apps || [];
    const isAdding = addingAppFor === customer.id;
    return (
      <div className="px-4 py-3 bg-slate-50/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Dispositivos ({apps.length})</span>
          {!isAdding && editingAppId === null && (
            <button onClick={() => { setAddingAppFor(customer.id!); setAppDraft({ customer_id: Number(customer.id), app_name: '', app_model: '', access_type: 'mac_key', mac_address: '', device_key: '', is_tv: true }); }}
              className="flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-indigo-100">
              <Plus size={11} /> Adicionar
            </button>
          )}
        </div>

        {apps.length === 0 && !isAdding && (
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest py-2">Nenhum dispositivo cadastrado</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {apps.map(app => {
            const isEditing = editingAppId === app.id;
            return (
              <div key={app.id} className={`bg-white rounded-lg border p-2.5 text-[10px] space-y-1.5 ${isEditing ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between">
                  {isEditing ? (
                    <select value={appDraft?.access_type} onChange={e => updateAppField('access_type', e.target.value as any)}
                      className="px-1.5 py-1 bg-slate-50 border border-indigo-300 rounded text-[9px] font-bold outline-none">
                      <option value="mac_key">MAC + Key</option>
                      <option value="xtream">Xtream</option>
                      <option value="xtream_full">Xtream Full</option>
                      <option value="user_pass">Usuário + Senha</option>
                    </select>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      {app.is_tv ? <Tv size={11} className="text-slate-400" /> : <Smartphone size={11} className="text-slate-400" />}
                      <span className="font-black text-slate-800">{app.app_name || '—'}</span>
                      {app.app_model && <span className="text-[8px] text-slate-400 font-bold uppercase">{app.app_model}</span>}
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    {isEditing ? (
                      <>
                        <button onClick={saveApp} disabled={savingApp} className="p-1 hover:bg-emerald-100 text-emerald-600 rounded" title="Salvar">
                          {savingApp ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        </button>
                        <button onClick={cancelEditApp} className="p-1 hover:bg-slate-200 text-slate-500 rounded" title="Cancelar">
                          <X size={12} />
                        </button>
                      </>
                    ) : editingAppId === null && !isAdding ? (
                      <>
                        <button onClick={() => startEditApp(app)} className="p-1 hover:bg-indigo-100 text-indigo-600 rounded" title="Editar">
                          <Pencil size={11} />
                        </button>
                        <button onClick={() => deleteApp(app.id!, customer.id!)} className="p-1 hover:bg-rose-100 text-rose-500 rounded" title="Excluir">
                          <Trash2 size={11} />
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                {isEditing ? (
                  <>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400 w-12 shrink-0 text-[8px] font-bold uppercase">App</span>
                      <input value={appDraft?.app_name || ''} onChange={e => updateAppField('app_name', e.target.value)}
                        className="flex-1 px-1.5 py-1 bg-slate-50 border border-indigo-300 rounded text-[10px] font-bold outline-none focus:ring-1 focus:ring-indigo-500" />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400 w-12 shrink-0 text-[8px] font-bold uppercase">Modelo</span>
                      <input value={appDraft?.app_model || ''} onChange={e => updateAppField('app_model', e.target.value)}
                        className="flex-1 px-1.5 py-1 bg-slate-50 border border-indigo-300 rounded text-[10px] outline-none focus:ring-1 focus:ring-indigo-500" />
                    </div>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={appDraft?.is_tv ?? true} onChange={e => updateAppField('is_tv', e.target.checked)} className="w-3 h-3" />
                      <span className="text-[8px] font-bold uppercase text-slate-500">É TV</span>
                    </label>
                    {APP_FIELDS.filter(f => f.key !== 'app_name' && f.key !== 'app_model').map(f => renderEditableAppField(f))}
                    {(appDraft?.android_link || appDraft?.ios_link) && null}
                  </>
                ) : (
                  <>
                    {APP_FIELDS.filter(f => f.key !== 'app_name' && f.key !== 'app_model').map(f => renderAppField(app, f))}
                    {(app.android_link || app.ios_link) && (
                      <div className="flex gap-2 pt-1">
                        {app.android_link && <a href={app.android_link} target="_blank" rel="noreferrer" className="text-emerald-600 font-bold text-[9px]">Android ↗</a>}
                        {app.ios_link && <a href={app.ios_link} target="_blank" rel="noreferrer" className="text-blue-600 font-bold text-[9px]">iOS ↗</a>}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {/* Add new app form */}
          {isAdding && appDraft && (
            <div className="bg-indigo-50/50 rounded-lg border border-indigo-300 p-2.5 text-[10px] space-y-1.5 ring-1 ring-indigo-200">
              <div className="flex items-center justify-between">
                <select value={appDraft.access_type} onChange={e => updateAppField('access_type', e.target.value as any)}
                  className="px-1.5 py-1 bg-white border border-indigo-300 rounded text-[9px] font-bold outline-none">
                  <option value="mac_key">MAC + Key</option>
                  <option value="xtream">Xtream</option>
                  <option value="xtream_full">Xtream Full</option>
                  <option value="user_pass">Usuário + Senha</option>
                </select>
                <div className="flex items-center gap-1">
                  <button onClick={() => addApp(customer.id!)} disabled={savingApp} className="p-1 hover:bg-emerald-100 text-emerald-600 rounded" title="Salvar">
                    {savingApp ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  </button>
                  <button onClick={() => { setAddingAppFor(null); setAppDraft(null); }} className="p-1 hover:bg-slate-200 text-slate-500 rounded" title="Cancelar">
                    <X size={12} />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-slate-400 w-12 shrink-0 text-[8px] font-bold uppercase">App</span>
                <input value={appDraft.app_name} onChange={e => updateAppField('app_name', e.target.value)} placeholder="IBO Player..."
                  className="flex-1 px-1.5 py-1 bg-white border border-indigo-300 rounded text-[10px] font-bold outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-slate-400 w-12 shrink-0 text-[8px] font-bold uppercase">Modelo</span>
                <input value={appDraft.app_model || ''} onChange={e => updateAppField('app_model', e.target.value)} placeholder="IBO PLAYER"
                  className="flex-1 px-1.5 py-1 bg-white border border-indigo-300 rounded text-[10px] outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={appDraft.is_tv} onChange={e => updateAppField('is_tv', e.target.checked)} className="w-3 h-3" />
                <span className="text-[8px] font-bold uppercase text-slate-500">É TV</span>
              </label>
              {APP_FIELDS.filter(f => f.key !== 'app_name' && f.key !== 'app_model').map(f => renderEditableAppField(f))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 px-4 pt-3 shrink-0">
        <StatCard icon={<Users size={16} className="text-white" />} label="Clientes" value={`${totals.activeCount}/${totals.count}`} color="bg-indigo-500" sub="ativos / total" />
        <StatCard icon={<DollarSign size={16} className="text-white" />} label="Receita Mensal" value={fmtBRL(totals.monthlyRevenue)} color="bg-emerald-500" sub="só ativos" />
        <StatCard icon={<TrendingDown size={16} className="text-white" />} label="Custo Mensal" value={fmtBRL(totals.monthlyCost)} color="bg-rose-500" sub="custo × linhas" />
        <StatCard icon={<TrendingUp size={16} className="text-white" />} label="Lucro Mensal" value={fmtBRL(monthlyProfit)} color={monthlyProfit >= 0 ? 'bg-emerald-600' : 'bg-rose-600'} sub={`margem ${totals.monthlyRevenue > 0 ? ((monthlyProfit / totals.monthlyRevenue) * 100).toFixed(0) : 0}%`} />
        <StatCard icon={<Wallet size={16} className="text-white" />} label="Total Pago" value={fmtBRL(totals.totalPaid)} color="bg-slate-700" sub="acumulado" />
      </div>

      {/* Toolbar */}
      <div className="bg-white border-b border-slate-200 px-4 py-2.5 space-y-2 shrink-0 mt-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow">
              <Users size={16} />
            </div>
            <h1 className="text-xs font-black text-slate-800 uppercase tracking-tight">Planilha de Clientes</h1>
            <span className="text-[9px] text-slate-400 font-bold">{dirtyIds.size > 0 && `· ${dirtyIds.size} pendente(s)`}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={loadCustomers} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors" title="Recarregar">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={exportCSV} className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[9px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50">
              <Download size={13} /> CSV
            </button>
            {dirtyIds.size > 0 && (
              <button onClick={saveAll} className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-emerald-700 shadow">
                <Save size={13} /> Salvar Tudo ({dirtyIds.size})
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Buscar por nome, usuário ou WhatsApp..." value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setPage(0); }}
              className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            {(['all', 'active', 'expired', 'teste'] as const).map(f => (
              <button key={f} onClick={() => { setFilter(f); setPage(0); }}
                className={`px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${filter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {f === 'all' ? 'Todos' : f === 'active' ? 'Ativos' : f === 'expired' ? 'Vencidos' : 'Teste'}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">💡 Clique em qualquer célula para editar · Enter confirma · Esc cancela · Clique em ▸ para ver dispositivos</p>
      </div>

      {/* Tabela */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-40 space-y-3 text-slate-400">
            <Loader2 className="animate-spin" size={24} />
            <p className="text-[10px] font-black uppercase tracking-widest">Carregando...</p>
          </div>
        ) : paged.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 space-y-3 text-slate-400">
            <Users size={32} strokeWidth={1} />
            <p className="text-[10px] font-black uppercase tracking-widest">Nenhum cliente encontrado</p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-800 text-white">
              <tr>
                <th className="px-1 py-2 w-8"></th>
                <th className="px-2 py-2 text-left text-[9px] uppercase tracking-widest w-8">#</th>
                {(['name', 'username', 'whatsapp'] as SortKey[]).map(k => sortableHeader(k, COLUMN_LABELS[k]))}
                {sortableHeader('renewal_price', COLUMN_LABELS.renewal_price, 'text-right')}
                {sortableHeader('lines_count', COLUMN_LABELS.lines_count, 'text-center')}
                {sortableHeader('cost_per_credit', COLUMN_LABELS.cost_per_credit, 'text-right')}
                {sortableHeader('cost_total', COLUMN_LABELS.cost_total, 'text-right')}
                {sortableHeader('profit', COLUMN_LABELS.profit, 'text-right')}
                {sortableHeader('amount_paid', COLUMN_LABELS.amount_paid, 'text-right')}
                {sortableHeader('expiration_date', COLUMN_LABELS.expiration_date)}
                {sortableHeader('last_renewal', COLUMN_LABELS.last_renewal)}
                {sortableHeader('password', COLUMN_LABELS.password)}
                {sortableHeader('created_at', COLUMN_LABELS.created_at)}
                {sortableHeader('status', COLUMN_LABELS.status)}
                {sortableHeader('provider', COLUMN_LABELS.provider)}
                {sortableHeader('apps_count', COLUMN_LABELS.apps_count, 'text-center')}
                <th className="px-2 py-2 text-center text-[9px] uppercase tracking-widest sticky right-0 bg-slate-800">Ações</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((customer, idx) => {
                const isDirty = dirtyIds.has(customer.id);
                const isSaving = savingIds.has(customer.id);
                const isExpanded = expandedRows.has(customer.id);
                const expired = customer.expiration_date ? !isAfter(parseISO(customer.expiration_date), new Date()) : false;
                const profit = getProfit(customer);
                const costTotal = getCostTotal(customer);
                return (
                  <React.Fragment key={customer.id}>
                    <tr className={`border-b border-slate-100 ${isDirty ? 'bg-amber-50' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} ${expired ? 'opacity-60' : ''}`}>
                      <td className="px-1 py-1.5 text-center">
                        {(customer as any).apps?.length > 0 && (
                          <button onClick={() => toggleExpand(customer.id!)} className="p-0.5 hover:bg-slate-200 rounded transition-colors">
                            {isExpanded ? <ChevronUp size={13} className="text-slate-500" /> : <ChevronDown size={13} className="text-slate-500" />}
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-[9px] text-slate-400 font-mono text-center">{currentPage * pageSize + idx + 1}</td>
                      {renderCell(customer, 'name')}
                      {renderCell(customer, 'username')}
                      {renderCell(customer, 'whatsapp')}
                      {renderCell(customer, 'renewal_price', 'text-right')}
                      {renderCell(customer, 'lines_count', 'text-center')}
                      {renderCell(customer, 'cost_per_credit', 'text-right')}
                      <td className="px-2 py-1.5 text-[10px] text-right font-mono text-rose-600 whitespace-nowrap">{fmtBRL(costTotal)}</td>
                      <td className={`px-2 py-1.5 text-[10px] text-right font-mono font-bold whitespace-nowrap ${profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtBRL(profit)}</td>
                      {renderCell(customer, 'amount_paid', 'text-right')}
                      {renderCell(customer, 'expiration_date')}
                      {renderCell(customer, 'last_renewal')}
                      {renderCell(customer, 'password')}
                      {renderCell(customer, 'created_at')}
                      {renderCell(customer, 'status')}
                      {renderCell(customer, 'provider')}
                      {renderCell(customer, 'apps_count', 'text-center')}
                      <td className="px-2 py-1.5 sticky right-0 bg-inherit">
                        <div className="flex items-center justify-center gap-1">
                          {isDirty ? (
                            <>
                              <button onClick={() => saveCustomer(customer.id!)} disabled={isSaving} className="p-1 hover:bg-emerald-100 text-emerald-600 rounded transition-colors disabled:opacity-50" title="Salvar">
                                {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                              </button>
                              <button onClick={() => revertCustomer(customer.id!)} className="p-1 hover:bg-slate-200 text-slate-500 rounded transition-colors" title="Desfazer">
                                <X size={12} />
                              </button>
                            </>
                          ) : (
                            <>
                              <a href={`https://wa.me/${(customer.whatsapp || '').replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="p-1 hover:bg-emerald-100 text-emerald-600 rounded transition-colors" title="WhatsApp" onClick={e => e.stopPropagation()}>
                                <MessageSquare size={12} />
                              </a>
                              <button onClick={() => deleteCustomer(customer.id!)} className="p-1 hover:bg-rose-100 text-rose-500 rounded transition-colors" title="Excluir">
                                <Trash2 size={12} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50/30">
                          <td colSpan={20}>{renderExpandedApps(customer)}</td>
                        </tr>
                      )}
                  </React.Fragment>
                );
              })}
            </tbody>
            {sortedFiltered.length > 0 && (
              <tfoot className="sticky bottom-0 z-10 bg-slate-800 text-white">
                <tr>
                  <td colSpan={3} className="px-2 py-2 text-[9px] font-black uppercase tracking-widest">Totais (filtrado):</td>
                  <td colSpan={3} className="px-2 py-2"></td>
                  <td className="px-2 py-2 text-right text-[10px] font-mono text-emerald-400">{fmtBRL(totals.monthlyRevenue)}</td>
                  <td className="px-2 py-2"></td>
                  <td className="px-2 py-2 text-right text-[10px] font-mono text-rose-400">{fmtBRL(totals.monthlyCost)}</td>
                  <td className={`px-2 py-2 text-right text-[10px] font-mono font-bold ${monthlyProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmtBRL(monthlyProfit)}</td>
                  <td className="px-2 py-2 text-right text-[10px] font-mono">{fmtBRL(totals.totalPaid)}</td>
                  <td colSpan={7} className="px-2 py-2"></td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="bg-white border-t border-slate-200 px-4 py-1.5 flex items-center justify-between shrink-0">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Página {currentPage + 1} de {totalPages}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={currentPage === 0} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 disabled:opacity-30 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 disabled:opacity-30 transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
