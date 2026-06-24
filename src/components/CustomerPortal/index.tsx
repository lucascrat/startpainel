import React, { useState, useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import { Tv, CreditCard, LayoutDashboard, LogOut } from 'lucide-react';
import Login from './Login';
import Dashboard from './Dashboard';
import AppStore from './AppStore';
import Payments from './Payments';
import PublicStore from './PublicStore';
import { apiFetch } from '../../lib/auth'; // Using existing fetch wrapper or raw fetch

export default function CustomerPortal() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('portal_token'));
  const [customer, setCustomer] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'store' | 'payments'>('dashboard');
  const [loading, setLoading] = useState(true);
  const [portalData, setPortalData] = useState<any>(null);
  
  // Auth state
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (token) {
      loadPortalData();
    } else {
      setLoading(false);
    }
  }, [token]);

  const loadPortalData = async () => {
    try {
      const res = await fetch('/api/portal/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        if (res.status === 401) handleLogout();
        throw new Error('Falha ao carregar dados');
      }
      const data = await res.json();
      setCustomer(data.customer);
      setPortalData(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('portal_token');
    setToken(null);
    setCustomer(null);
  };

  if (loading) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Carregando...</div>;

  if (!token || !customer) {
    if (showLogin) {
      return (
        <div className="relative">
          <Login onLogin={(t, c) => {
            localStorage.setItem('portal_token', t);
            setToken(t);
            setCustomer(c);
          }} />
          <button 
            onClick={() => setShowLogin(false)}
            className="absolute top-4 left-4 text-gray-400 hover:text-white bg-gray-900 px-4 py-2 rounded-lg"
          >
            ← Voltar para a Loja
          </button>
        </div>
      );
    }

    return (
      <PublicStore 
        onLoginSelect={() => setShowLogin(true)} 
        onRegisterSuccess={(t, c, testRes) => {
          localStorage.setItem('portal_token', t);
          setToken(t);
          setCustomer(c);
          if (testRes) {
            // Em vez de só carregar, podemos jogar o resultado do teste na tela de loja e mudar a aba
            setActiveTab('store');
            // Como passamos testResult? Vamos injetar no estado global se necessário ou deixar a aba Store buscar
          }
        }} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col md:flex-row">
      <Toaster theme="dark" position="top-right" />
      
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-gray-900 border-b md:border-b-0 md:border-r border-gray-800 p-4 flex flex-col">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Tv className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-xl leading-tight bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">MinhaTV</h1>
            <p className="text-xs text-gray-400">Portal do Cliente</p>
          </div>
        </div>

        <nav className="flex md:flex-col gap-2 overflow-x-auto pb-4 md:pb-0 flex-1">
          <button onClick={() => setActiveTab('dashboard')} className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
            <LayoutDashboard className="w-5 h-5" /> Meu Painel
          </button>
          <button onClick={() => setActiveTab('store')} className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeTab === 'store' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
            <Tv className="w-5 h-5" /> Instalar Apps
          </button>
          <button onClick={() => setActiveTab('payments')} className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeTab === 'payments' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
            <CreditCard className="w-5 h-5" /> Assinatura e Pagamentos
          </button>
        </nav>

        <div className="mt-auto hidden md:block pt-4 border-t border-gray-800">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-indigo-400 font-bold uppercase">
              {customer.username.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{customer.username}</p>
            </div>
            <button onClick={handleLogout} className="text-gray-500 hover:text-red-400 transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          {activeTab === 'dashboard' && <Dashboard data={portalData} onReload={loadPortalData} />}
          {activeTab === 'store' && <AppStore token={token} catalog={portalData?.apps_catalog || []} onReload={loadPortalData} />}
          {activeTab === 'payments' && <Payments token={token} data={portalData} onReload={loadPortalData} />}
        </div>
      </main>
    </div>
  );
}
