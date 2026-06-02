import React, { useState, useEffect } from 'react';
import { authFetch } from '../lib/auth';
import { toast } from 'sonner';
import { Search, Zap, RefreshCw, Eye, EyeOff } from 'lucide-react';

interface AtiveAppItem {
  id: number;
  name: string;
  credits: number;
  icon_url: string | null;
  is_active: boolean;
  created_at: string;
}

export default function AtiveAppCatalog() {
  const [apps, setApps]           = useState<AtiveAppItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [toggling, setToggling]   = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ativeapp-catalog');
      const data = await res.json();
      setApps(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Erro ao carregar catálogo AtiveApp');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleActive = async (id: number, current: boolean) => {
    setToggling(id);
    try {
      const res = await authFetch(`/api/ativeapp-catalog/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !current }),
      });
      if (res.ok) {
        setApps(prev => prev.map(a => a.id === id ? { ...a, is_active: !current } : a));
        toast.success(!current ? 'App ativado' : 'App desativado');
      } else {
        toast.error('Erro ao atualizar');
      }
    } catch {
      toast.error('Erro de conexão');
    } finally {
      setToggling(null);
    }
  };

  const filtered = apps.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount   = apps.filter(a => a.is_active).length;
  const inactiveCount = apps.length - activeCount;

  // Custo em R$ (1 crédito = R$12)
  const creditsToReal = (c: number) => `R$ ${(c * 12).toFixed(2).replace('.', ',')}`;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
            <Zap size={20} className="text-blue-500" />
            AtiveApp — Catálogo de Apps
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {apps.length} apps disponíveis · {activeCount} ativos · {inactiveCount} ocultos
            · 1 crédito = R$ 12,00
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Pesquisar app..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-400 outline-none bg-white"
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <RefreshCw size={24} className="animate-spin mr-2" />
          Carregando...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          {search ? 'Nenhum app encontrado para essa busca.' : 'Nenhum app cadastrado. Rode o script de scrape primeiro.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map(app => (
            <div
              key={app.id}
              className={`relative bg-white border rounded-xl p-3 flex flex-col items-center gap-2 transition ${
                app.is_active
                  ? 'border-slate-200 shadow-sm hover:shadow-md'
                  : 'border-slate-100 opacity-50 grayscale'
              }`}
            >
              {/* Ícone */}
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 flex items-center justify-center shrink-0">
                {app.icon_url ? (
                  <img
                    src={app.icon_url}
                    alt={app.name}
                    className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <Zap size={24} className="text-slate-300" />
                )}
              </div>

              {/* Nome */}
              <p className="text-[10px] font-bold text-slate-700 text-center leading-tight uppercase tracking-wide line-clamp-2">
                {app.name}
              </p>

              {/* Créditos / Preço */}
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  {app.credits} créditos
                </span>
                <span className="text-[9px] text-slate-400 font-medium">
                  {creditsToReal(app.credits)}/ano
                </span>
              </div>

              {/* Toggle ativo/inativo */}
              <button
                onClick={() => toggleActive(app.id, app.is_active)}
                disabled={toggling === app.id}
                title={app.is_active ? 'Desativar' : 'Ativar'}
                className={`absolute top-1.5 right-1.5 p-0.5 rounded transition ${
                  app.is_active
                    ? 'text-emerald-500 hover:text-red-400'
                    : 'text-slate-300 hover:text-emerald-500'
                }`}
              >
                {app.is_active
                  ? <Eye size={12} />
                  : <EyeOff size={12} />
                }
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Legenda */}
      {!loading && apps.length > 0 && (
        <p className="text-[10px] text-slate-400 text-center">
          Clique no ícone <Eye size={10} className="inline" /> para mostrar/ocultar um app da automação.
          Apps desativados não serão ativados pelo Lucas mesmo se solicitados.
        </p>
      )}
    </div>
  );
}
