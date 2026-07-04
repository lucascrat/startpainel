import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Customer } from '../types';
import { authFetch } from '../lib/auth';
import { toast } from 'sonner';
import {
  Users, Search, RefreshCw, Save, Trash2, Plus,
  ArrowUpDown, ArrowUp, ArrowDown, Loader2, X, Check,
  MessageSquare, ChevronLeft, ChevronRight, Download,
} from 'lucide-react';
import { format, isAfter, parseISO, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type SortKey = 'name' | 'username' | 'whatsapp' | 'renewal_price' | 'expiration_date' | 'status' | 'provider' | 'lines_count' | 'apps_count';
type SortDir = 'asc' | 'desc';

interface CellEdit {
  customerId: string | number;
  field: string;
  value: string;
}

const STATUS_OPTIONS = ['active', 'expired', 'teste'] as const;
const PROVIDER_OPTIONS = ['startpainel', 'wareztv', 'outro'] as const;

const COLUMN_LABELS: Record<string, string> = {
  name: 'Nome',
  username: 'Usuário',
  whatsapp: 'WhatsApp',
  renewal_price: 'R$ Renov.',
  expiration_date: 'Vencimento',
  status: 'Status',
  provider: 'Provedor',
  lines_count: 'Linhas',
  apps: 'Apps',
};

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

  const startEdit = (customerId: string | number, field: string, currentValue: any) => {
    setEditCell({ customerId, field, value: String(currentValue ?? '') });
  };

  const commitEdit = useCallback(async () => {
    if (!editCell) return;
    const { customerId, field, value } = editCell;
    const customer = customers.find(c => c.id === customerId);
    if (!customer) { setEditCell(null); return; }

    const oldValue = (customer as any)[field];
    const normalizedOld = String(oldValue ?? '');
    if (value === normalizedOld) { setEditCell(null); return; }

    setPendingChanges(prev => ({
      ...prev,
      [customerId]: { ...(prev[customerId] || {}), [field]: value },
    }));
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
      if (payload.renewal_price !== undefined) {
        const n = parseFloat(String(payload.renewal_price).replace(',', '.'));
        payload.renewal_price = isNaN(n) ? 0 : n;
      }
      if (payload.lines_count !== undefined) {
        const n = parseInt(payload.lines_count);
        payload.lines_count = isNaN(n) ? 1 : n;
      }
      const res = await authFetch(`/api/customers/${customerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
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
    toast.promise(
      Promise.all(ids.map(id => saveCustomer(id))),
      { loading: `Salvando ${ids.length} cliente(s)...`, success: 'Tudo salvo!', error: 'Alguns falharam' },
    );
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
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    }
  };

  const revertCustomer = (customerId: string | number) => {
    setPendingChanges(prev => { const n = { ...prev }; delete n[customerId]; return n; });
    setDirtyIds(prev => { const n = new Set(prev); n.delete(customerId); return n; });
    loadCustomers();
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sortedFiltered = React.useMemo(() => {
    let list = customers.filter(c => {
      const q = searchTerm.toLowerCase();
      const matchesSearch = !q ||
        (c.username || '').toLowerCase().includes(q) ||
        (c.name || '').toLowerCase().includes(q) ||
        (c.whatsapp || '').includes(q);
      const isExpired = c.expiration_date ? !isAfter(parseISO(c.expiration_date), new Date()) : false;
      const matchesFilter =
        filter === 'all' ? true :
        filter === 'active' ? (!isExpired && c.status !== 'teste') :
        filter === 'expired' ? isExpired :
        filter === 'teste' ? c.status === 'teste' : true;
      return matchesSearch && matchesFilter;
    });
    list.sort((a, b) => {
      let av: any, bv: any;
      if (sortKey === 'apps_count') {
        av = (a as any).apps?.length || 0; bv = (b as any).apps?.length || 0;
      } else {
        av = (a as any)[sortKey] ?? ''; bv = (b as any)[sortKey] ?? '';
      }
      if (sortKey === 'expiration_date') {
        av = av ? new Date(av).getTime() : 0;
        bv = bv ? new Date(bv).getTime() : 0;
      } else if (sortKey === 'renewal_price' || sortKey === 'lines_count') {
        av = Number(av) || 0; bv = Number(bv) || 0;
      } else {
        av = String(av).toLowerCase(); bv = String(bv).toLowerCase();
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [customers, searchTerm, filter, sortKey, sortDir]);

  const totalPages = Math.ceil(sortedFiltered.length / pageSize);
  const currentPage = Math.min(page, Math.max(0, totalPages - 1));
  const paged = sortedFiltered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  const exportCSV = () => {
    const headers = ['Nome', 'Usuario', 'WhatsApp', 'R$ Renov', 'Vencimento', 'Status', 'Provedor', 'Linhas', 'Apps'];
    const rows = sortedFiltered.map(c => [
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${(c.username || '').replace(/"/g, '""')}"`,
      `"${(c.whatsapp || '').replace(/"/g, '""')}"`,
      c.renewal_price || 0,
      c.expiration_date ? format(parseISO(c.expiration_date), 'dd/MM/yyyy') : '',
      c.status || '',
      c.provider || '',
      c.lines_count || 1,
      (c as any).apps?.length || 0,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `clientes_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const sortableHeader = (key: SortKey, label: string, extraClass = '') => (
    <th
      onClick={() => toggleSort(key)}
      className={`px-2 py-2 cursor-pointer select-none whitespace-nowrap hover:bg-slate-100 transition-colors ${extraClass}`}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        {sortKey === key ? (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ArrowUpDown size={11} className="opacity-30" />}
      </div>
    </th>
  );

  const renderCell = (customer: Customer, field: string) => {
    const isEditing = editCell?.customerId === customer.id && editCell?.field === field;
    const value = (customer as any)[field];
    const isDirty = dirtyIds.has(customer.id) && pendingChanges[customer.id]?.[field] !== undefined;

    if (isEditing) {
      const isSelect = field === 'status' || field === 'provider';
      if (isSelect) {
        const options = field === 'status' ? STATUS_OPTIONS : PROVIDER_OPTIONS;
        return (
          <select
            ref={ref => { inputRef.current = ref; }}
            value={editCell!.value}
            onChange={e => setEditCell({ ...editCell!, value: e.target.value })}
            onBlur={commitEdit}
            className="w-full px-1 py-0.5 bg-white border border-indigo-500 rounded text-[10px] outline-none"
          >
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        );
      }
      const isNumber = field === 'renewal_price' || field === 'lines_count';
      const isDate = field === 'expiration_date';
      return (
        <input
          ref={ref => { inputRef.current = ref; }}
          type={isDate ? 'date' : isNumber ? 'number' : 'text'}
          step={isNumber && field === 'renewal_price' ? '0.01' : undefined}
          value={editCell!.value}
          onChange={e => setEditCell({ ...editCell!, value: e.target.value })}
          onBlur={commitEdit}
          onKeyDown={e => {
            if (e.key === 'Enter') commitEdit();
            if (e.key === 'Escape') cancelEdit();
          }}
          className={`w-full px-1 py-0.5 bg-white border border-indigo-500 rounded outline-none ${isNumber ? 'text-right' : ''} text-[10px]`}
        />
      );
    }

    let display: React.ReactNode = value || '—';
    if (field === 'expiration_date' && value) {
      const expired = !isAfter(parseISO(value), new Date());
      display = <span className={expired ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>{format(parseISO(value), 'dd/MM/yy')}</span>;
    }
    if (field === 'renewal_price' && value) {
      display = <span>R$ {Number(value).toFixed(2)}</span>;
    }
    if (field === 'status') {
      const colors: Record<string, string> = { active: 'bg-emerald-100 text-emerald-700', expired: 'bg-rose-100 text-rose-700', teste: 'bg-amber-100 text-amber-700' };
      display = <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${colors[value] || 'bg-slate-100 text-slate-500'}`}>{value || 'active'}</span>;
    }
    if (field === 'whatsapp' && value) {
      display = <span className="text-emerald-600">{value}</span>;
    }
    if (field === 'apps') {
      const count = (customer as any).apps?.length || 0;
      display = <span className="text-center font-bold">{count > 0 ? count : '—'}</span>;
    }
    return (
      <td
        onClick={() => startEdit(customer.id!, field, value)}
        className={`px-2 py-1.5 cursor-text text-[10px] hover:bg-indigo-50/50 transition-colors truncate max-w-[180px] ${isDirty ? 'bg-amber-50 ring-1 ring-amber-200' : ''}`}
        title={typeof value === 'string' ? value : ''}
      >
        {display}
      </td>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Toolbar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 space-y-3 shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
              <Users size={18} />
            </div>
            <div>
              <h1 className="text-sm font-black text-slate-800 uppercase tracking-tight">Clientes — Planilha</h1>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                {sortedFiltered.length} de {customers.length} · {dirtyIds.size} alteração(ões) pendente(s)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadCustomers} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors" title="Recarregar">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all">
              <Download size={14} /> CSV
            </button>
            {dirtyIds.size > 0 && (
              <button onClick={saveAll} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100">
                <Save size={14} /> Salvar Tudo ({dirtyIds.size})
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Buscar por nome, usuário ou WhatsApp..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setPage(0); }}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            {(['all', 'active', 'expired', 'teste'] as const).map(f => (
              <button
                key={f}
                onClick={() => { setFilter(f); setPage(0); }}
                className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${
                  filter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {f === 'all' ? 'Todos' : f === 'active' ? 'Ativos' : f === 'expired' ? 'Vencidos' : 'Teste'}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">💡 Clique em qualquer célula para editar · Enter confirma · Esc cancela · Salve com o botão verde</p>
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
                <th className="px-2 py-2 text-left text-[9px] uppercase tracking-widest font-bold w-8">#</th>
                {(['name', 'username', 'whatsapp', 'renewal_price', 'expiration_date', 'status', 'provider', 'lines_count'] as SortKey[]).map(k => sortableHeader(k, COLUMN_LABELS[k]))}
                {sortableHeader('apps_count', 'Apps', 'text-center')}
                <th className="px-2 py-2 text-center text-[9px] uppercase tracking-widest font-bold sticky right-0 bg-slate-800">Ações</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((customer, idx) => {
                const isDirty = dirtyIds.has(customer.id);
                const isSaving = savingIds.has(customer.id);
                const expired = customer.expiration_date ? !isAfter(parseISO(customer.expiration_date), new Date()) : false;
                return (
                  <tr key={customer.id} className={`border-b border-slate-100 ${isDirty ? 'bg-amber-50' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} ${expired ? 'opacity-70' : ''}`}>
                    <td className="px-2 py-1.5 text-[9px] text-slate-400 font-mono text-center">
                      {currentPage * pageSize + idx + 1}
                    </td>
                    {renderCell(customer, 'name')}
                    {renderCell(customer, 'username')}
                    {renderCell(customer, 'whatsapp')}
                    {renderCell(customer, 'renewal_price')}
                    {renderCell(customer, 'expiration_date')}
                    {renderCell(customer, 'status')}
                    {renderCell(customer, 'provider')}
                    {renderCell(customer, 'lines_count')}
                    {renderCell(customer, 'apps')}
                    <td className="px-2 py-1.5 sticky right-0 bg-inherit">
                      <div className="flex items-center justify-center gap-1">
                        {isDirty ? (
                          <>
                            <button
                              onClick={() => saveCustomer(customer.id!)}
                              disabled={isSaving}
                              className="p-1 hover:bg-emerald-100 text-emerald-600 rounded transition-colors disabled:opacity-50"
                              title="Salvar"
                            >
                              {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                            </button>
                            <button
                              onClick={() => revertCustomer(customer.id!)}
                              className="p-1 hover:bg-slate-200 text-slate-500 rounded transition-colors"
                              title="Desfazer"
                            >
                              <X size={13} />
                            </button>
                          </>
                        ) : (
                          <>
                            <a
                              href={`https://wa.me/${(customer.whatsapp || '').replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 hover:bg-emerald-100 text-emerald-600 rounded transition-colors"
                              title="WhatsApp"
                              onClick={e => e.stopPropagation()}
                            >
                              <MessageSquare size={13} />
                            </a>
                            <button
                              onClick={() => deleteCustomer(customer.id!)}
                              className="p-1 hover:bg-rose-100 text-rose-500 rounded transition-colors"
                              title="Excluir"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="bg-white border-t border-slate-200 px-4 py-2 flex items-center justify-between shrink-0">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
            Página {currentPage + 1} de {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
