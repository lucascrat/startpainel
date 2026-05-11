import React, { useState, useEffect } from 'react';
import { Customer } from '../types';
import { authFetch } from '../lib/auth';
import { 
  Users, Search, Phone, Calendar, 
  ChevronRight, Tv, RefreshCw, Smartphone,
  Plus, MessageSquare, ExternalLink, XCircle,
  Save, Trash2, AlertCircle, Loader2, Edit3, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, isAfter, parseISO, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function CustomerMenu() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
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
    expiration_date: format(addMonths(new Date(), 1), 'yyyy-MM-dd'),
    lines_count: 1,
    playlist_url: ''
  });

  // App Management States
  const [isAppModalOpen, setIsAppModalOpen] = useState(false);
  const [viewingApp, setViewingApp] = useState<CustomerApp | null>(null);
  const [isEditingApp, setIsEditingApp] = useState(false);
  const [appForm, setAppForm] = useState({
    appName: '',
    appModel: 'IBO PLAYER',
    accessType: 'mac_key' as 'mac_key' | 'user_pass',
    macAddress: '',
    deviceKey: '',
    appUsername: '',
    appPassword: '',
    providerUrl: '',
    androidLink: '',
    iosLink: '',
    iconUrl: '',
    appSiteUrl: '',
    isTv: true
  });

  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/customers');
      const data = await response.json();
      setCustomers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsLoading(false);
      setLoading(false);
    }
  };

  const handleUploadIcon = async (file: File, isEditing = false) => {
    if (!file.type.startsWith('image/')) {
      alert('Selecione um arquivo de imagem.');
      return;
    }
    const MAX_BYTES = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_BYTES) {
      alert(`Imagem muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo 5MB.`);
      return;
    }
    setIsLoading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
      const res = await authFetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: base64, mimeType: file.type, prefix: 'icons' }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error || 'Falha no upload');
      const url = json.url as string;
      if (isEditing && viewingApp) {
        setViewingApp({ ...viewingApp, icon_url: url });
      } else {
        setAppForm(prev => ({ ...prev, iconUrl: url }));
      }
    } catch (err: any) {
      alert(`Erro ao subir imagem: ${err?.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveApp = async () => {
    if (!selectedCustomer) return;
    if (!appForm.appName) {
      alert('Dê um nome para este acesso (ex: TV Sala)');
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`/api/customers/${selectedCustomer.id}/apps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appForm)
      });
      if (response.ok) {
        setAppForm({
          appName: '', appModel: 'IBO PLAYER', accessType: 'mac_key',
          macAddress: '', deviceKey: '', appUsername: '', appPassword: '',
          providerUrl: '', androidLink: '', iosLink: '', iconUrl: '',
          appSiteUrl: '', isTv: true
        });
        loadCustomers();
        const updated = await fetch(`/api/customers/${selectedCustomer.id}`).then(r => r.json());
        setSelectedCustomer(updated);
        alert('App cadastrado com sucesso!');
      } else {
        alert('Erro ao cadastrar app');
      }
    } catch (error: any) {
      alert(`Erro: ${error.message}`);
    } finally { setIsLoading(false); }
  };

  const handleDeleteApp = async (appId: number) => {
    if (!confirm('Deseja excluir este acesso?')) return;
    try {
      await fetch(`/api/apps/${appId}`, { method: 'DELETE' });
      loadCustomers();
      if (selectedCustomer) {
        const updated = await fetch(`/api/customers/${selectedCustomer.id}`).then(r => r.json());
        setSelectedCustomer(updated);
      }
      if (viewingApp?.id === appId) setViewingApp(null);
    } catch (error) {}
  };

  const handleUpdateApp = async () => {
    if (!viewingApp) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/apps/${viewingApp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(viewingApp)
      });
      if (response.ok) {
        setIsEditingApp(false);
        loadCustomers();
        if (selectedCustomer) {
          const updated = await fetch(`/api/customers/${selectedCustomer.id}`).then(r => r.json());
          setSelectedCustomer(updated);
        }
        alert('App atualizado com sucesso!');
      } else {
        alert('Erro ao atualizar app');
      }
    } catch (error: any) {
      alert(`Erro: ${error.message}`);
    } finally { setIsLoading(false); }
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
          expiration_date: format(addMonths(new Date(), 1), 'yyyy-MM-dd'),
          lines_count: 1
        });
      } else {
        const err = await response.json();
        setFormError(`${err.error}${err.details ? ': ' + err.details : ''}`);
      }
    } catch (error) {
      setFormError('Erro de conexão com o servidor');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateCustomer = async () => {
    if (!editForm || !selectedCustomer) return;
    
    setSaving(true);
    try {
      const response = await fetch(`/api/customers/${selectedCustomer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });

      if (response.ok) {
        const updated = await response.json();
        setSelectedCustomer(updated);
        setIsEditing(false);
        await loadCustomers();
      } else {
        const err = await response.json();
        alert(`Erro ao atualizar: ${err.error}`);
      }
    } catch (error) {
      alert('Erro de conexão com o servidor');
    } finally {
      setSaving(false);
    }
  };

  const startEditing = () => {
    if (!selectedCustomer) return;
    setEditForm({
      name: selectedCustomer.name || '',
      username: selectedCustomer.username || '',
      whatsapp: selectedCustomer.whatsapp || '',
      renewal_price: selectedCustomer.renewal_price || '30.00',
      expiration_date: selectedCustomer.expiration_date ? format(parseISO(selectedCustomer.expiration_date), 'yyyy-MM-dd') : '',
      lines_count: selectedCustomer.lines_count || 1,
      status: selectedCustomer.status || 'active'
    });
    setIsEditing(true);
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

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
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
                  onClick={() => { setSelectedCustomer(customer); setIsEditing(false); }}
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
                  <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                    {isEditing ? 'Editando Cliente' : 'Informações do Cliente'}
                  </h2>
                  <div className="flex items-center gap-2">
                    {!isEditing && (
                      <button 
                        onClick={startEditing}
                        className="p-2 hover:bg-indigo-50 text-indigo-600 rounded-full transition-colors"
                        title="Editar dados"
                      >
                        <Edit3 size={18} />
                      </button>
                    )}
                    <button onClick={() => { setSelectedCustomer(null); setIsEditing(false); }} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                      <XCircle size={20} className="text-slate-400" />
                    </button>
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                      <input 
                        value={editForm.name}
                        onChange={e => setEditForm({...editForm, name: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Usuário / Login</label>
                      <input 
                        value={editForm.username}
                        onChange={e => setEditForm({...editForm, username: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">WhatsApp</label>
                      <input 
                        value={editForm.whatsapp}
                        onChange={e => setEditForm({...editForm, whatsapp: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Preço Renov.</label>
                        <input 
                          type="number"
                          step="0.01"
                          value={editForm.renewal_price}
                          onChange={e => setEditForm({...editForm, renewal_price: e.target.value})}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Linhas</label>
                        <input 
                          type="number"
                          value={editForm.lines_count}
                          onChange={e => setEditForm({...editForm, lines_count: parseInt(e.target.value)})}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Data Vencimento</label>
                      <input 
                        type="date"
                        value={editForm.expiration_date}
                        onChange={e => setEditForm({...editForm, expiration_date: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">URL da Lista M3U</label>
                      <input 
                        type="url"
                        placeholder="http://painel.com/get.php?username=..."
                        value={editForm.playlist_url || ''}
                        onChange={e => setEditForm({...editForm, playlist_url: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[10px] font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      />
                    </div>
                    <div className="pt-4 flex gap-3">
                      <button 
                        onClick={() => setIsEditing(false)}
                        className="flex-1 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-all"
                      >
                        Cancelar
                      </button>
                      <button 
                        onClick={handleUpdateCustomer}
                        disabled={saving}
                        className="flex-[2] bg-indigo-600 text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                      >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Salvar Alterações
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
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

                      {selectedCustomer.playlist_url && (
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Lista M3U Principal</span>
                          <div className="flex items-center gap-2">
                            <input 
                              readOnly 
                              value={selectedCustomer.playlist_url} 
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[9px] font-mono text-slate-600 outline-none"
                            />
                            <button 
                              onClick={() => {
                                navigator.clipboard.writeText(selectedCustomer.playlist_url!);
                                alert('Lista copiada!');
                              }}
                              className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors"
                              title="Copiar Lista"
                            >
                              <Check size={14} />
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                          <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Dispositivos & Apps</h4>
                          <button 
                            onClick={() => {
                              setIsAppModalOpen(true);
                              setAppForm(prev => ({ ...prev, providerUrl: selectedCustomer.playlist_url || '' }));
                            }}
                            className="text-[9px] font-black text-indigo-600 uppercase hover:text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full transition-all"
                          >
                            Gerenciar
                          </button>
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
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Qtd Linhas</label>
                    <input 
                      type="number"
                      value={newCust.lines_count}
                      onChange={e => setNewCust({...newCust, lines_count: parseInt(e.target.value)})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      placeholder="1"
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">URL da Lista M3U</label>
                    <input 
                      type="url"
                      placeholder="http://painel.com/get.php?username=..."
                      value={newCust.playlist_url}
                      onChange={e => setNewCust({...newCust, playlist_url: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[10px] font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                  </div>
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

      <AnimatePresence>
        {isAppModalOpen && selectedCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-5 bg-slate-900 text-white flex justify-between items-center">
                <div>
                  <h3 className="font-black uppercase tracking-widest text-xs text-emerald-400">Gerenciar Dispositivos</h3>
                  <p className="text-[10px] text-slate-400 font-bold mt-1">{selectedCustomer.name}</p>
                </div>
                <button onClick={() => setIsAppModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={24} /></button>
              </div>

              <div className="p-6 overflow-y-auto space-y-6">
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Aplicativos Ativos</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedCustomer.apps?.map(app => (
                      <div key={app.id} 
                        onClick={() => setViewingApp(viewingApp?.id === app.id ? null : app)}
                        className={`p-3 rounded-2xl border transition-all flex items-center gap-4 group cursor-pointer ${
                          viewingApp?.id === app.id ? 'bg-indigo-50 border-indigo-200 ring-2 ring-indigo-500/20' : 'bg-slate-50 border-slate-100 hover:border-slate-200'
                        }`}
                      >
                        <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 shrink-0 shadow-sm overflow-hidden">
                          {app.icon_url ? <img src={app.icon_url} className="w-full h-full object-cover" /> : (app.is_tv ? <Tv size={20} /> : <Smartphone size={20} />)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black text-slate-800 truncate">{app.app_name}</p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase">{app.app_model}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteApp(app.id!); }} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {(!selectedCustomer.apps?.length) && (
                      <div className="col-span-full py-8 text-center text-[10px] font-black text-slate-300 uppercase italic border-2 border-dashed border-slate-100 rounded-3xl">Nenhum app cadastrado</div>
                    )}
                  </div>
                </div>

                {viewingApp && (
                  <div className="bg-indigo-900/5 border border-indigo-100 rounded-3xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                        {isEditingApp ? 'Editando Acesso' : `Detalhes do Acesso: ${viewingApp.app_name}`}
                      </h4>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => setIsEditingApp(!isEditingApp)}
                          className="text-[10px] font-black text-indigo-600 uppercase hover:text-indigo-700 bg-indigo-100 px-3 py-1 rounded-full transition-all"
                        >
                          {isEditingApp ? 'Cancelar' : 'Editar'}
                        </button>
                        <button onClick={() => { setViewingApp(null); setIsEditingApp(false); }} className="text-[10px] font-black text-slate-400 uppercase hover:text-slate-600">Fechar</button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2 space-y-1">
                        <p className="text-[8px] font-black text-slate-400 uppercase">Nome / Identificação</p>
                        {isEditingApp ? (
                          <input value={viewingApp.app_name} onChange={e => setViewingApp({...viewingApp, app_name: e.target.value})} className="w-full px-3 py-2 bg-white border border-indigo-100 rounded-xl text-xs font-bold outline-none" />
                        ) : (
                          <p className="text-xs font-bold text-slate-700">{viewingApp.app_name}</p>
                        )}
                      </div>

                      <div className="col-span-2 space-y-1">
                        <p className="text-[8px] font-black text-slate-400 uppercase">Ícone do App</p>
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 shrink-0 shadow-sm overflow-hidden">
                            {viewingApp.icon_url ? <img src={viewingApp.icon_url} className="w-full h-full object-cover" /> : (viewingApp.is_tv ? <Tv size={24} /> : <Smartphone size={24} />)}
                          </div>
                          {isEditingApp && (
                            <div className="flex-1">
                              <input 
                                type="file" 
                                accept="image/*" 
                                onChange={e => e.target.files?.[0] && handleUploadIcon(e.target.files[0], true)}
                                className="text-[10px] text-slate-500 font-bold block w-full file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-[10px] file:font-black file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 cursor-pointer"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {isEditingApp && (
                        <button 
                          onClick={handleUpdateApp}
                          disabled={isLoading}
                          className="col-span-2 bg-indigo-600 text-white py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg flex items-center justify-center gap-2"
                        >
                          {isLoading ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />}
                          Salvar Alterações
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="h-px bg-slate-100 w-full" />

                {!viewingApp && (
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cadastrar Novo Acesso</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2 space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Identificação (ex: TV Quarto, Celular Pai)</label>
                        <input value={appForm.appName} onChange={e => setAppForm({...appForm, appName: e.target.value})} placeholder="TV Sala" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none" />
                      </div>
                      
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Modelo / Player</label>
                        <select value={appForm.appModel} onChange={e => setAppForm({...appForm, appModel: e.target.value})} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none">
                          <option>IBO PLAYER</option>
                          <option>IBO PRO</option>
                          <option>ULTRA PLAYER</option>
                          <option>QUICKPLAYER</option>
                          <option>LAZER PLAYER</option>
                          <option>SMARTERS PLAYER LITE</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Tipo de Acesso</label>
                        <select value={appForm.accessType} onChange={e => setAppForm({...appForm, accessType: e.target.value as any})} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none">
                          <option value="mac_key">MAC & Device Key</option>
                          <option value="user_pass">Usuário & Senha</option>
                        </select>
                      </div>

                      {appForm.accessType === 'mac_key' ? (
                        <>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Endereço MAC</label>
                            <input value={appForm.macAddress} onChange={e => setAppForm({...appForm, macAddress: e.target.value})} placeholder="00:11:22:33:44:55" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Device Key</label>
                            <input value={appForm.deviceKey} onChange={e => setAppForm({...appForm, deviceKey: e.target.value})} placeholder="123456" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none" />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Usuário</label>
                            <input value={appForm.appUsername} onChange={e => setAppForm({...appForm, appUsername: e.target.value})} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Senha</label>
                            <input value={appForm.appPassword} onChange={e => setAppForm({...appForm, appPassword: e.target.value})} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none" />
                          </div>
                        </>
                      )}

                      <div className="col-span-2 space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Ícone do App</label>
                        <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                          <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 shrink-0 overflow-hidden shadow-sm">
                            {appForm.iconUrl ? <img src={appForm.iconUrl} className="w-full h-full object-cover" /> : <Tv size={20} />}
                          </div>
                          <div className="flex-1">
                            <input 
                              type="file" 
                              accept="image/*" 
                              onChange={e => e.target.files?.[0] && handleUploadIcon(e.target.files[0])}
                              className="text-[10px] text-slate-500 font-bold block w-full file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-[10px] file:font-black file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 cursor-pointer" 
                            />
                          </div>
                        </div>
                      </div>

                      <button 
                        onClick={handleSaveApp}
                        disabled={isLoading}
                        className="col-span-2 bg-slate-900 text-white py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all flex items-center justify-center gap-2 mt-2 shadow-lg shadow-slate-200"
                      >
                        {isLoading ? <RefreshCw className="animate-spin" size={16} /> : <Plus size={16} />}
                        Cadastrar Dispositivo
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
