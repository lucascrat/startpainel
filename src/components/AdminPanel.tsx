import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Customer } from '../types';
import { Plus, Trash2, User, RefreshCw, Smartphone, CheckCircle, XCircle, Brain, Save, Key, QrCode } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function AdminPanel() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newRenewalPrice, setNewRenewalPrice] = useState('49.90');
  const [newWhatsapp, setNewWhatsapp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Settings state
  const [geminiKey, setGeminiKey] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);

  const [dbStatus, setDbStatus] = useState<{status: string, error?: string}>({status: 'checking'});
  const [panelStatus, setPanelStatus] = useState<{connected?: boolean, error?: string, message?: string, url?: string, total_clients?: number} | null>(null);
  const [isTestingPanel, setIsTestingPanel] = useState(false);

  useEffect(() => {
    // Check DB status
    const checkDb = async () => {
      try {
        const response = await fetch('/api/db-status');
        const data = await response.json();
        setDbStatus(data);
      } catch (error) {
        setDbStatus({status: 'error', error: 'Failed to reach status API'});
      }
    };
    checkDb();

    // Load initial settings from DB
    const loadSettings = async () => {
      try {
        const response = await fetch('/api/settings/gemini_api_key');
        const data = await response.json();
        if (data.value) {
          setGeminiKey(data.value);
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    };
    
    // Load customers from Postgres
    const loadCustomers = async () => {
      try {
        const response = await fetch('/api/customers');
        const data = await response.json();
        setCustomers(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Error loading customers:', error);
        setCustomers([]);
      }
    };

    loadSettings();
    loadCustomers();
  }, []);

  const refreshCustomers = async () => {
    try {
      const response = await fetch('/api/customers');
      const data = await response.json();
      setCustomers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading customers:', error);
      setCustomers([]);
    }
  };

  const checkPanelStatus = async () => {
    setIsTestingPanel(true);
    try {
      const response = await fetch('/api/panel/status');
      const data = await response.json();
      setPanelStatus(data);
    } catch (error) {
      setPanelStatus({ connected: false, error: 'Servidor inacessível' });
    } finally {
      setIsTestingPanel(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSavingKey(true);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'gemini_api_key',
          value: geminiKey
        })
      });
      alert('Configurações salvas com sucesso!');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Erro ao salvar as configurações.');
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername,
          whatsapp: newWhatsapp,
          renewalPrice: parseFloat(newRenewalPrice) || 49.90
        })
      });
      
      if (response.ok) {
        setNewUsername('');
        setNewRenewalPrice('49.90');
        setNewWhatsapp('');
        refreshCustomers();
        alert('Cliente cadastrado com sucesso!');
      } else {
        const errorData = await response.json();
        alert(`Erro ao cadastrar: ${errorData.error || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Error adding customer:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string | number) => {
    if (!confirm('Excluir cliente?')) return;
    try {
      await fetch(`/api/customers/${id}`, { method: 'DELETE' });
      refreshCustomers();
    } catch (error) {
      console.error('Error deleting customer:', error);
    }
  };

  const handleManualPix = async (customer: Customer) => {
    setIsLoading(true);
    try {
      const price = customer.renewal_price || customer.renewalPrice || 49.90;
      const response = await fetch('/api/pix/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          amount: price, 
          username: customer.username 
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao gerar Pix');
      }

      // Add message to chat
      await axios.post('/api/messages', {
        text: `Cobrança de renovação gerada para ${customer.username}:`,
        sender: 'ai',
        type: 'pix_qr',
        metadata: data
      });

      alert(`Pix de R$ ${price} gerado para ${customer.username}!`);
    } catch (error: any) {
      console.error('Error generating manual pix:', error);
      alert(`Erro: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualRenewal = async (username: string) => {
    if (!confirm(`Deseja renovar manualmente o cliente ${username} no painel?`)) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/panel/renew/${username}`, { method: 'POST' });
      const data = await response.json();

      if (response.ok) {
        alert(data.message);
      } else {
        throw new Error(data.error || 'Erro desconhecido');
      }
    } catch (error: any) {
      console.error('Manual renewal error:', error);
      alert(`Erro ao renovar: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 bg-slate-50 min-h-full">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-emerald-100 flex items-center justify-center text-emerald-600">
              <User size={18} />
            </div>
            <div className="flex flex-col">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-widest leading-tight">
                Gerenciamento de Clientes
              </h2>
              <span className="text-[10px] text-slate-400 font-medium">Controle de Renovação CMS</span>
            </div>
          </div>
            <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded tracking-tighter border ${
              dbStatus.status === 'connected' 
                ? 'text-emerald-600 bg-emerald-50 border-emerald-100' 
                : 'text-rose-600 bg-rose-50 border-rose-100'
            }`}>
              DB: {dbStatus.status.toUpperCase()} {dbStatus.error && `(${dbStatus.error})`}
            </span>
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded tracking-tighter border border-slate-200">
              TOTAL: {Array.isArray(customers) ? customers.length : 0}
            </span>
          </div>
        </div>

        {/* AI Configuration - New Section */}
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 space-y-3"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2 mb-2">
            <Brain size={14} className="text-whatsapp-teal" />
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Configuração do Assistente IA</h3>
          </div>
          
          <div className="flex gap-4 items-end">
            <div className="flex-1 space-y-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pl-1 flex items-center gap-1">
                <Key size={10} />
                Chave da API Gemini (Google AI Studio)
              </label>
              <input 
                type="password" 
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="Insira sua chave AIza..."
                className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded focus:ring-1 focus:ring-emerald-500 outline-none transition-all font-mono"
              />
            </div>
            <button 
              onClick={handleSaveSettings}
              disabled={isSavingKey}
              className="bg-slate-800 text-white h-8 px-4 rounded text-[10px] font-bold uppercase tracking-widest hover:bg-black disabled:opacity-50 transition-all flex items-center gap-2 shadow-sm"
            >
              {isSavingKey ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />}
              Salvar IA
            </button>
          </div>
          <p className="text-[9px] text-slate-400 font-medium">
            * A chave é salva de forma segura e usada pelo backend para processar as conversas.
          </p>
        </motion.div>

        {/* Add Form - High Density */}
        <motion.form 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleAdd} 
          className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex flex-wrap gap-4 items-end"
        >
          <div className="flex-1 min-w-[180px] space-y-1">
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pl-1">Usuário Painel</label>
            <div className="relative">
              <User className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
              <input 
                type="text" 
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="ex: marcos_22"
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded focus:ring-1 focus:ring-emerald-500 outline-none transition-all placeholder:text-slate-300 font-medium"
                required
              />
            </div>
          </div>
          <div className="flex-1 min-w-[180px] space-y-1">
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pl-1">WhatsApp (Info)</label>
            <div className="relative">
              <Smartphone className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
              <input 
                type="text" 
                value={newWhatsapp}
                onChange={(e) => setNewWhatsapp(e.target.value)}
                placeholder="DDD + Número"
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded focus:ring-1 focus:ring-emerald-500 outline-none transition-all placeholder:text-slate-300 font-medium"
              />
            </div>
          </div>
          <div className="w-[100px] space-y-1">
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pl-1">Preço (R$)</label>
            <input 
              type="number" 
              step="0.01"
              value={newRenewalPrice}
              onChange={(e) => setNewRenewalPrice(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded focus:ring-1 focus:ring-emerald-500 outline-none transition-all font-bold text-emerald-600"
            />
          </div>
          <button 
            disabled={isLoading}
            className="bg-emerald-600 text-white h-8 px-4 rounded text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-50 transition-all flex items-center gap-2 shadow-sm"
          >
            {isLoading ? <RefreshCw className="animate-spin" size={14} /> : <Plus size={14} />}
            Cadastrar
          </button>
        </motion.form>

        {/* User Table - Dense */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Base de Dados de Usuários</span>
            <div className="flex gap-2">
              <button className="p-1 hover:bg-slate-200 rounded transition"><RefreshCw size={12} className="text-slate-400" /></button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Usuário Painel</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Preço Renovação</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Status Atendimento</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">WhatsApp</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-tighter text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-xs">
                <AnimatePresence>
                  {Array.isArray(customers) && customers.map((c) => (
                    <motion.tr 
                      key={c.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="hover:bg-slate-50/50 transition group"
                    >
                      <td className="px-4 py-2.5 font-bold text-slate-700">{c.username}</td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-emerald-600 font-bold">
                        <input 
                          type="number" 
                          step="0.01"
                          defaultValue={c.renewal_price || c.renewalPrice || 49.90}
                          onBlur={async (e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val) && c.id) {
                              try {
                                await fetch(`/api/customers/${c.id}`, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ renewalPrice: val })
                                });
                              } catch (err) {
                                console.error("Error updating price:", err);
                              }
                            }
                          }}
                          className="w-20 bg-transparent hover:bg-slate-100 border-none px-1 rounded focus:ring-1 focus:ring-emerald-500 transition-all cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${
                          c.status === 'active' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'
                        }`}>
                          <span className={`w-1 h-1 rounded-full ${c.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          {c.status === 'active' ? 'Ativo' : 'Pendente'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono text-[11px]">{c.whatsapp || '-'}</td>
                      <td className="px-4 py-2.5 text-right flex items-center justify-end gap-1">
                        <button 
                          onClick={() => handleManualRenewal(c.username)}
                          disabled={isLoading}
                          title="Renovar Manualmente no Painel"
                          className="text-amber-500 hover:bg-amber-50 p-1.5 rounded transition-all"
                        >
                          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                        </button>
                        <button 
                          onClick={() => handleManualPix(c)}
                          disabled={isLoading}
                          title="Gerar Cobrança Pix"
                          className="text-emerald-500 hover:bg-emerald-50 p-1.5 rounded transition-all"
                        >
                          <QrCode size={14} />
                        </button>
                        <button 
                          onClick={() => c.id && handleDelete(c.id)}
                          className="text-slate-300 hover:text-rose-500 hover:bg-rose-50 p-1.5 rounded transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
          {(!Array.isArray(customers) || customers.length === 0) && (
            <div className="py-8 text-center text-slate-300 text-[11px] font-bold uppercase tracking-widest">
              Nenhum registro encontrado
            </div>
          )}
        </div>

        {/* CMS Info Footer */}
        <div className="bg-slate-900 rounded-lg p-3 flex flex-col gap-2 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${
                panelStatus === null ? 'bg-yellow-400 animate-pulse' :
                panelStatus.connected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
              }`} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">StartPainel API:</span>
              <span className="text-[11px] font-mono text-emerald-400">
                {panelStatus === null ? 'cms.startpainel.cc' : (panelStatus.url || 'cms.startpainel.cc')}
              </span>
            </div>
            <button 
              onClick={checkPanelStatus}
              disabled={isTestingPanel}
              className="text-[10px] font-bold uppercase p-1.5 bg-white/10 hover:bg-white/20 rounded transition flex items-center gap-1.5 disabled:opacity-50"
            >
              {isTestingPanel ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle size={11} />}
              Testar Conexão
            </button>
          </div>

          {panelStatus && (
            <div className={`text-[10px] font-medium px-2 py-1 rounded ${
              panelStatus.connected 
                ? 'bg-emerald-900/50 text-emerald-300' 
                : 'bg-rose-900/50 text-rose-300'
            }`}>
              {panelStatus.connected 
                ? `✅ ${panelStatus.message} — ${panelStatus.total_clients ?? 0} cliente(s) no painel` 
                : `❌ ${panelStatus.error}`
              }
              {!panelStatus.connected && (
                <span className="block mt-0.5 text-rose-400/70">
                  Configure STARTPAINEL_API_TOKEN no .env do servidor
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

}
