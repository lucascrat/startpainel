import React, { useState, useEffect } from 'react';
import { Customer } from '../types';
import { 
  Users, Search, Phone, Calendar, 
  ChevronRight, Tv, RefreshCw, Smartphone,
  Plus, MessageSquare, ExternalLink, XCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, isAfter, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function CustomerMenu() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/customers');
      const data = await response.json();
      setCustomers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter(c => {
    const matchesSearch = 
      c.username.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (c.name && c.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (c.whatsapp && c.whatsapp.includes(searchTerm));
    
    const isExpired = c.expiration_date ? !isAfter(parseISO(c.expiration_date), new Date()) : false;
    const matchesFilter = 
      filter === 'all' ? true : 
      (filter === 'active' ? !isExpired : isExpired);
    
    return matchesSearch && matchesFilter;
  });

  const getStatusColor = (date?: string) => {
    if (!date) return 'text-slate-400 bg-slate-100';
    return isAfter(parseISO(date), new Date()) 
      ? 'text-emerald-600 bg-emerald-100' 
      : 'text-rose-600 bg-rose-100';
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header Section */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
              <Users size={20} />
            </div>
            <div>
              <h1 className="text-sm font-black text-slate-800 uppercase tracking-tighter">Menu de Clientes</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Total de {customers.length} cadastrados</p>
            </div>
          </div>
          <button 
            className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all flex items-center gap-2"
          >
            <Plus size={16} />
            Novo Cliente
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Buscar por nome, usuário ou whatsapp..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button 
              onClick={() => setFilter('all')}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Todos
            </button>
            <button 
              onClick={() => setFilter('active')}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'active' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Ativos
            </button>
            <button 
              onClick={() => setFilter('expired')}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'expired' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Vencidos
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        {/* Customer List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-40 space-y-3 text-slate-400">
              <RefreshCw className="animate-spin" size={24} />
              <p className="text-[10px] font-black uppercase tracking-widest">Carregando Clientes...</p>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 space-y-3 text-slate-400 bg-white rounded-2xl border border-dashed border-slate-300">
              <Users size={32} strokeWidth={1} />
              <p className="text-[10px] font-black uppercase tracking-widest">Nenhum cliente encontrado</p>
            </div>
          ) : (
            <AnimatePresence mode='popLayout'>
              {filteredCustomers.map((customer, index) => (
                <motion.div 
                  key={customer.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => setSelectedCustomer(customer)}
                  className={`group relative bg-white p-4 rounded-2xl border transition-all cursor-pointer ${
                    selectedCustomer?.id === customer.id 
                      ? 'border-indigo-600 shadow-md ring-1 ring-indigo-600' 
                      : 'border-slate-200 hover:border-indigo-200 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-black transition-colors ${
                        selectedCustomer?.id === customer.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600'
                      }`}>
                        {customer.name ? customer.name.charAt(0).toUpperCase() : (customer.username ? customer.username.charAt(0).toUpperCase() : '?')}
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-slate-800 tracking-tight">{customer.name || customer.username}</h3>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] font-bold text-slate-400">@{customer.username}</span>
                          {customer.whatsapp && (
                            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                              <Phone size={10} className="text-emerald-500" />
                              {customer.whatsapp}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${getStatusColor(customer.expiration_date)}`}>
                        {customer.expiration_date ? (isAfter(parseISO(customer.expiration_date), new Date()) ? 'Ativo' : 'Vencido') : 'Sem data'}
                      </span>
                      <div className="flex items-center gap-1.5 text-slate-400 group-hover:text-indigo-600 transition-colors">
                        <span className="text-[10px] font-black uppercase tracking-widest mr-1">Detalhes</span>
                        <ChevronRight size={14} />
                      </div>
                    </div>
                  </div>

                  {/* Quick stats overlay on hover */}
                  <div className="mt-3 pt-3 border-t border-slate-50 flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <Tv size={12} className="text-slate-400" />
                      <span className="text-[9px] font-black text-slate-500 uppercase">{customer.apps?.length || 0} Apps</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar size={12} className="text-slate-400" />
                      <span className="text-[9px] font-black text-slate-500 uppercase">
                        Vence: {customer.expiration_date ? format(parseISO(customer.expiration_date), 'dd MMM yy', { locale: ptBR }) : '--'}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Details Panel - Responsive */}
        <AnimatePresence>
          {selectedCustomer && (
            <motion.div 
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: '100%' }}
              exit={{ opacity: 0, width: 0 }}
              className="md:w-[400px] bg-white border-l border-slate-200 overflow-y-auto flex flex-col z-10 h-full fixed inset-0 md:relative"
            >
              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">Informações do Cliente</h2>
                  <button onClick={() => setSelectedCustomer(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                    <XCircle size={20} className="text-slate-400" />
                  </button>
                </div>

                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="w-24 h-24 rounded-full bg-indigo-600 flex items-center justify-center text-3xl font-black text-white shadow-xl shadow-indigo-100">
                    {selectedCustomer.name?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-800 tracking-tighter">{selectedCustomer.name}</h3>
                    <p className="text-xs font-bold text-slate-400 mt-1">@{selectedCustomer.username}</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all">
                      <MessageSquare size={14} /> WhatsApp
                    </button>
                    <button className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-slate-100">
                      <RefreshCw size={14} /> Renovar
                    </button>
                  </div>
                </div>

                <div className="space-y-4 pt-4">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Vencimento</span>
                      <span className={`text-[10px] font-black ${selectedCustomer.expiration_date && isAfter(parseISO(selectedCustomer.expiration_date), new Date()) ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {selectedCustomer.expiration_date ? format(parseISO(selectedCustomer.expiration_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : 'Não definido'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Preço Renovação</span>
                      <span className="text-[10px] font-black text-slate-800">R$ {parseFloat(String(selectedCustomer.renewal_price || 0)).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Linhas Ativas</span>
                      <span className="text-[10px] font-black text-slate-800">{selectedCustomer.lines_count || 1}</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Dispositivos & Apps</h4>
                    </div>
                    
                    <div className="space-y-2">
                      {selectedCustomer.apps && selectedCustomer.apps.length > 0 ? (
                        selectedCustomer.apps.map(app => (
                          <div key={app.id} className="bg-white p-3 rounded-xl border border-slate-100 flex items-center justify-between group/app">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                                {app.is_tv ? <Tv size={16} /> : <Smartphone size={16} />}
                              </div>
                              <div>
                                <p className="text-[11px] font-black text-slate-800 leading-none">{app.app_name}</p>
                                <p className="text-[9px] font-bold text-slate-400 mt-1">{app.app_model || 'Geral'}</p>
                              </div>
                            </div>
                            <button className="p-2 text-slate-300 hover:text-indigo-600 transition-colors opacity-0 group-hover/app:opacity-100">
                              <ExternalLink size={14} />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                          <p className="text-[9px] font-black text-slate-400 uppercase">Nenhum app cadastrado</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
