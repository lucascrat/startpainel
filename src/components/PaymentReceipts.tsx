import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Trash2, Receipt, RefreshCw, Clock, CheckSquare, XSquare } from 'lucide-react';
import { authFetch } from '../lib/auth';

type Receipt = {
  id: number;
  customer_username: string | null;
  customer_id: number | null;
  payer_name: string | null;
  amount: string | null;
  paid_at: string | null;
  remote_jid: string | null;
  image_data: string | null;
  status: 'pending_review' | 'approved' | 'rejected' | 'refunded';
  notes: string | null;
  created_at: string;
  reviewed_at: string | null;
};

const STATUS_LABEL: Record<Receipt['status'], { label: string; className: string }> = {
  pending_review: { label: 'Aguardando', className: 'bg-amber-100 text-amber-700' },
  approved:       { label: 'Aprovado',   className: 'bg-emerald-100 text-emerald-700' },
  rejected:       { label: 'Rejeitado',  className: 'bg-red-100 text-red-700' },
  refunded:       { label: 'Estornado',  className: 'bg-slate-200 text-slate-700' },
};

function formatBRL(amount: string | null) {
  if (!amount) return '-';
  return Number(amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateTime(s: string | null) {
  if (!s) return '-';
  try { return new Date(s).toLocaleString('pt-BR'); } catch { return s; }
}

export default function PaymentReceipts() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | Receipt['status']>('all');
  const [previewing, setPreviewing] = useState<Receipt | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/payment-receipts');
      if (res.ok) setReceipts(await res.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: number, status: Receipt['status']) => {
    const res = await authFetch(`/api/payment-receipts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json();
      setReceipts(prev => prev.map(r => r.id === id ? updated : r));
    }
  };

  const remove = async (id: number) => {
    if (!confirm('Excluir este comprovante? Essa ação não pode ser desfeita.')) return;
    const res = await authFetch(`/api/payment-receipts/${id}`, { method: 'DELETE' });
    if (res.ok) setReceipts(prev => prev.filter(r => r.id !== id));
  };

  const filtered = filter === 'all' ? receipts : receipts.filter(r => r.status === filter);
  const counts = {
    all: receipts.length,
    pending_review: receipts.filter(r => r.status === 'pending_review').length,
    approved: receipts.filter(r => r.status === 'approved').length,
    rejected: receipts.filter(r => r.status === 'rejected').length,
    refunded: receipts.filter(r => r.status === 'refunded').length,
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50">
      <div className="max-w-6xl mx-auto space-y-4">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <Receipt size={20} className="text-emerald-600" />
            </div>
            <div>
              <h1 className="text-sm font-black uppercase tracking-widest text-slate-800">Comprovantes de Pagamento</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Total {counts.all} • Aguardando {counts.pending_review}</p>
            </div>
          </div>
          <button onClick={load} className="p-2 text-slate-400 hover:text-slate-700 transition" title="Atualizar">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </header>

        <div className="flex flex-wrap gap-1 bg-white p-1 rounded-xl border border-slate-200 w-fit">
          {(['all', 'pending_review', 'approved', 'rejected', 'refunded'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition ${
                filter === f ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {f === 'all' ? `Todos (${counts.all})` : `${STATUS_LABEL[f].label} (${counts[f]})`}
            </button>
          ))}
        </div>

        {loading && receipts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 space-y-3 text-slate-400">
            <RefreshCw className="animate-spin" size={24} />
            <p className="text-[10px] font-black uppercase tracking-widest">Carregando...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 space-y-3 text-slate-400 bg-white rounded-2xl border border-dashed border-slate-300">
            <Receipt size={32} strokeWidth={1} />
            <p className="text-[10px] font-black uppercase tracking-widest">Nenhum comprovante</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(r => {
              const status = STATUS_LABEL[r.status];
              return (
                <div key={r.id} className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row gap-4">
                  {r.image_data ? (
                    <button
                      onClick={() => setPreviewing(r)}
                      className="shrink-0 w-full sm:w-24 h-24 rounded-xl overflow-hidden bg-slate-100 border border-slate-200"
                    >
                      <img src={r.image_data} alt="" className="w-full h-full object-cover" />
                    </button>
                  ) : (
                    <div className="shrink-0 w-full sm:w-24 h-24 rounded-xl bg-slate-100 flex items-center justify-center text-slate-300">
                      <Receipt size={28} />
                    </div>
                  )}

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest ${status.className}`}>{status.label}</span>
                      <span className="text-lg font-black text-slate-800">{formatBRL(r.amount)}</span>
                    </div>
                    <p className="text-xs text-slate-700">
                      <span className="font-bold">Pagador:</span> {r.payer_name || '—'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      <Clock size={10} className="inline mr-1" />
                      Pago em {formatDateTime(r.paid_at)} • Recebido {formatDateTime(r.created_at)}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      <span className="font-bold">Cliente:</span>{' '}
                      {r.customer_username ? (
                        <span className="text-emerald-700">{r.customer_username} (renovado +30 dias)</span>
                      ) : (
                        <span className="text-amber-600">Não vinculado — renovar manualmente</span>
                      )}
                    </p>
                    {r.remote_jid && (
                      <p className="text-[10px] text-slate-400 font-mono">{r.remote_jid.replace('@s.whatsapp.net', '')}</p>
                    )}
                  </div>

                  <div className="flex sm:flex-col gap-1">
                    {r.status !== 'approved' && (
                      <button
                        onClick={() => updateStatus(r.id, 'approved')}
                        title="Aprovar"
                        className="p-2 text-emerald-500 hover:bg-emerald-50 rounded-lg transition"
                      >
                        <CheckCircle size={16} />
                      </button>
                    )}
                    {r.status !== 'rejected' && (
                      <button
                        onClick={() => updateStatus(r.id, 'rejected')}
                        title="Rejeitar"
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition"
                      >
                        <XCircle size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => remove(r.id)}
                      title="Excluir"
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {previewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4"
          onClick={() => setPreviewing(null)}
        >
          <div className="max-w-2xl max-h-full bg-white rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <img src={previewing.image_data!} alt="" className="w-full h-auto" />
            <div className="p-3 flex justify-between items-center border-t border-slate-200">
              <p className="text-xs text-slate-500">{formatBRL(previewing.amount)} • {formatDateTime(previewing.paid_at)}</p>
              <button onClick={() => setPreviewing(null)} className="text-xs font-bold text-slate-500 hover:text-slate-800 uppercase">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
