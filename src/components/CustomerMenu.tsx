import React, { useState, useEffect } from 'react';
import { Customer } from '../types';
import { 
  Users, Search, Phone, Calendar, 
  ChevronRight, Tv, RefreshCw, Smartphone,
  Plus, MessageSquare, ExternalLink, XCircle,
  Save, Trash2, AlertCircle, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, isAfter, parseISO, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function CustomerMenu() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  
  // Add Customer Modal State
  const [isAdding, setIsAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [newCust, setNewCust] = useState({
    username: '',
    name: '',
    whatsapp: '',
    renewal_price: '30.00',
    expiration_date: format(addMonths(new Date(), 1), 'yyyy-MM-dd')
  });

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

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCust.username) return;
    
    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newCust,
          status: 'active'
        }),
      });

      if (response.ok) {
        await loadCustomers();
        setIsAdding(false);
        setNewCust({
          username: '',
          name: '',
          whatsapp: '',
          renewal_price: '30.00',
          expiration_date: format(addMonths(new Date(), 1), 'yyyy-MM-dd')
        });
      } else {
        const err = await response.json();
        setFormError(err.error || 'Erro ao criar cliente');
      }
    } catch (error) {
      setFormError('Erro de conexão com o servidor');
    } finally {
      setSaving(false);
    }
  };

  const handleRenew = async (customer: Customer) => {
    if (!confirm(`Deseja renovar ${customer.name || customer.username} por mais 30 dias?`)) return;
    
    try {
      const currentExp = customer.expiration_date ? parseISO(customer.expiration_date) : new Date();
      const newExp = isAfter(currentExp, new Date()) ? addMonths(currentExp, 1) : addMonths(new Date(), 1);
      
      const response = await fetch(`/api/customers/${customer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expiration_date: format(newExp, 'yyyy-MM-dd'),
          last_renewal: new Date().toISOString()
        }),
      });

      if (response.ok) {
        await loadCustomers();
        if (selectedCustomer?.id === customer.id) {
          const updated = await response.json();
          setSelectedCustomer(updated);
        }
      }
    } catch (error) {
      console.error('Erro ao renovar:', error);
    }
  };

  const handleDelete = async (customer: Customer) => {
    if (!confirm(`Tem certeza que deseja excluir o cliente ${customer.name || customer.username}? Esta ação não pode ser desfeita.`)) return;
    
    try {
      const response = await fetch(`/api/customers/${customer.id}`, { method: 'DELETE' });
      if (response.ok) {
        setSelectedCustomer(null);
        await loadCustomers();
      }
    } catch (error) {
      console.error('Erro ao excluir:', error);
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
    <div className="flex flex-col h-full bg-slate-50 relative">
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
            onClick={() => setIsAdding(true)}
            className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all flex items-center gap-2 shadow-lg shadow-slate-200"
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
                    <button 
                      onClick={() => window.open(`https://wa.me/${selectedCustomer.whatsapp?.replace(/\D/g, '')}`, '_blank')}
                      className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all"
                    >
                      <MessageSquare size={14} /> WhatsApp
                    </button>
                    <button 
                      onClick={() => handleRenew(selectedCustomer)}
                      className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-slate-100"
                    >
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

                <div className="pt-6">
                  <button 
                    onClick={() => handleDelete(selectedCustomer)}
                    className="w-full bg-rose-50 text-rose-600 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all flex items-center justify-center gap-2"
                  >
                    <Trash2 size={16} className="text-rose-400" /> Excluir Cliente
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* New Customer Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center text-white">
                    <Plus size={18} />
                  </div>
                  <h3 className="text-white font-black text-xs uppercase tracking-widest">Novo Cliente</h3>
                </div>
                <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-white transition-colors">
                  <XCircle size={24} />
                </button>
              </div>

              <form onSubmit={handleAddCustomer} className="p-6 space-y-4">
                {formError && (
                  <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl flex items-center gap-3 text-rose-600">
                    <AlertCircle size={18} />
                    <p className="text-[10px] font-black uppercase tracking-widest">{formError}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Usuário / Login</label>
                    <input 
                      required
                      value={newCust.username}
                      onChange={e => setNewCust({...newCust, username: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      placeholder="Ex: joao123"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                    <input 
                      value={newCust.name}
                      onChange={e => setNewCust({...newCust, name: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      placeholder="Ex: João Silva"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">WhatsApp</label>
                    <input 
                      value={newCust.whatsapp}
                      onChange={e => setNewCust({...newCust, whatsapp: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      placeholder="Ex: 5511999999999"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Vencimento Inicial</label>
                    <input 
                      type="date"
                      value={newCust.expiration_date}
                      onChange={e => setNewCust({...newCust, expiration_date: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor da Renovação (R$)</label>
                  <input 
                    type="number"
                    step="0.01"
                    value={newCust.renewal_price}
                    onChange={e => setNewCust({...newCust, renewal_price: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="30.00"
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="flex-1 px-4 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={saving}
                    className="flex-[2] bg-indigo-600 text-white px-4 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {saving ? 'Salvando...' : 'Salvar Cliente'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
