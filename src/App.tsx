import React, { useState, useEffect } from 'react';
import ChatInterface from './components/ChatInterface';
import AdminPanel from './components/AdminPanel';
import ActivationTester from './components/ActivationTester';
import CustomerMenu from './components/CustomerMenu';
import PublicChat from './components/PublicChat';
import PaymentReceipts from './components/PaymentReceipts';
import AppCatalog from './components/AppCatalog';
import AtiveAppCatalog from './components/AtiveAppCatalog';
import ContactsAgenda from './components/ContactsAgenda';
import BrowserRemote from './components/BrowserRemote';
import CustomerPortal from './components/CustomerPortal';
import { MessageSquare, ShieldCheck, Github, Activity, LogOut, Users, X, Receipt, AppWindow, BookUser, Zap } from 'lucide-react';
import { login, getToken, logout } from './lib/auth';
import { Toaster } from 'sonner';

export default function App() {
  const [activeTab, setActiveTab] = useState<'chat' | 'admin' | 'tester' | 'customers' | 'receipts' | 'apps' | 'agenda' | 'ativeapps'>('chat');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!getToken());
  const [showLogin, setShowLogin] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const isCustomerPortal = window.location.hostname.includes('minhatv') || window.location.search.includes('portal=1');

  useEffect(() => {
    const onExpired = () => setIsAuthenticated(false);
    window.addEventListener('admin-auth-expired', onExpired);

    // Abre login via URL ?admin=1
    if (new URLSearchParams(window.location.search).get('admin') === '1') {
      setShowLogin(true);
    }

    // Atalho de teclado: pressionar 'a' 3× em < 1.5s
    let keyBuf = '';
    let keyTimer: ReturnType<typeof setTimeout>;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'a') return;
      keyBuf += 'a';
      clearTimeout(keyTimer);
      keyTimer = setTimeout(() => { keyBuf = ''; }, 1500);
      if (keyBuf.length >= 3) { setShowLogin(true); keyBuf = ''; }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('admin-auth-expired', onExpired);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwInput) return;
    setLoggingIn(true);
    setLoginError(null);
    const r = await login(pwInput);
    setLoggingIn(false);
    if (r.ok) {
      setIsAuthenticated(true);
      setShowLogin(false);
      setPwInput('');
    } else {
      setLoginError(r.error || 'Senha incorreta');
    }
  };

  const handleLogout = () => {
    logout();
    setIsAuthenticated(false);
  };

  if (isCustomerPortal) {
    return <CustomerPortal />;
  }

  const loginModal = showLogin && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4">
      <form onSubmit={handleLogin} className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full space-y-6 text-center relative">
        <button
          type="button"
          onClick={() => { setShowLogin(false); setPwInput(''); setLoginError(null); }}
          className="absolute top-3 right-3 text-slate-300 hover:text-slate-600 transition"
          aria-label="Fechar"
        >
          <X size={18} />
        </button>
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
          <ShieldCheck size={32} />
        </div>
        <div>
          <h3 className="font-black text-slate-800 uppercase tracking-widest">Acesso Restrito</h3>
          <p className="text-xs text-slate-500 font-bold mt-1">Senha de administrador</p>
        </div>
        <input
          type="password"
          autoFocus
          value={pwInput}
          onChange={(e) => { setPwInput(e.target.value); setLoginError(null); }}
          placeholder="••••••••"
          className="w-full text-center text-lg font-mono py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
        />
        {loginError && (
          <p className="text-[11px] font-bold text-red-500 uppercase tracking-wider">{loginError}</p>
        )}
        <button
          type="submit"
          disabled={loggingIn || !pwInput}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold uppercase tracking-widest text-xs rounded-xl transition-colors"
        >
          {loggingIn ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );

  // Public-facing view: only customer chat + discrete admin entry icon.
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col min-h-[100dvh] font-sans">
        <main className="flex-1">
          <PublicChat onAdminClick={() => setShowLogin(true)} />
        </main>
        {loginModal}
        <Toaster position="top-right" richColors />
      </div>
    );
  }

  // Admin view (full tabs).
  return (
    <div className="flex flex-col h-[100dvh] bg-slate-50 font-sans overflow-hidden">
      <nav className="flex flex-col sm:flex-row items-center justify-between px-3 py-2 bg-white border-b border-slate-200 shadow-sm z-20 gap-2 sm:gap-0">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-whatsapp-teal rounded flex items-center justify-center text-white font-bold text-[10px] sm:text-xs shadow-md shrink-0">SP</div>
          <div className="flex flex-col">
            <span className="font-bold text-slate-800 tracking-tighter text-xs sm:text-sm uppercase leading-none">StartPainel</span>
            <span className="text-[8px] sm:text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-tight">Automated Support</span>
          </div>
        </div>

        <div className="flex bg-slate-100 p-0.5 rounded border border-slate-200 w-full sm:w-auto overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 rounded text-[9px] sm:text-[10px] font-bold uppercase tracking-wider transition whitespace-nowrap ${
              activeTab === 'chat' ? 'bg-white text-whatsapp-teal shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <MessageSquare size={12} className="sm:w-3.5 sm:h-3.5" />
            Chat
          </button>
          <button
            onClick={() => setActiveTab('customers')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 rounded text-[9px] sm:text-[10px] font-bold uppercase tracking-wider transition whitespace-nowrap ${
              activeTab === 'customers' ? 'bg-white text-whatsapp-teal shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Users size={12} className="sm:w-3.5 sm:h-3.5" />
            Clientes
          </button>
          <button
            onClick={() => setActiveTab('receipts')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 rounded text-[9px] sm:text-[10px] font-bold uppercase tracking-wider transition whitespace-nowrap ${
              activeTab === 'receipts' ? 'bg-white text-whatsapp-teal shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Receipt size={12} className="sm:w-3.5 sm:h-3.5" />
            Comprovantes
          </button>
          <button
            onClick={() => setActiveTab('apps')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 rounded text-[9px] sm:text-[10px] font-bold uppercase tracking-wider transition whitespace-nowrap ${
              activeTab === 'apps' ? 'bg-white text-whatsapp-teal shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <AppWindow size={12} className="sm:w-3.5 sm:h-3.5" />
            Apps
          </button>
          <button
            onClick={() => setActiveTab('agenda')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 rounded text-[9px] sm:text-[10px] font-bold uppercase tracking-wider transition whitespace-nowrap ${
              activeTab === 'agenda' ? 'bg-white text-whatsapp-teal shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <BookUser size={12} className="sm:w-3.5 sm:h-3.5" />
            Agenda
          </button>
          <button
            onClick={() => setActiveTab('ativeapps')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 rounded text-[9px] sm:text-[10px] font-bold uppercase tracking-wider transition whitespace-nowrap ${
              activeTab === 'ativeapps' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Zap size={12} className="sm:w-3.5 sm:h-3.5" />
            AtiveApp
          </button>
          <button
            onClick={() => setActiveTab('admin')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 rounded text-[9px] sm:text-[10px] font-bold uppercase tracking-wider transition whitespace-nowrap ${
              activeTab === 'admin' ? 'bg-white text-whatsapp-teal shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <ShieldCheck size={12} className="sm:w-3.5 sm:h-3.5" />
            Admin
          </button>
          <button
            onClick={() => setActiveTab('tester')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 rounded text-[9px] sm:text-[10px] font-bold uppercase tracking-wider transition whitespace-nowrap ${
              activeTab === 'tester' ? 'bg-white text-whatsapp-teal shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Activity size={12} className="sm:w-3.5 sm:h-3.5" />
            Teste
          </button>
          <button
            onClick={() => setActiveTab('browser')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 rounded text-[9px] sm:text-[10px] font-bold uppercase tracking-wider transition whitespace-nowrap ${
              activeTab === 'browser' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <AppWindow size={12} className="sm:w-3.5 sm:h-3.5" />
            Navegador Remoto
          </button>
          <button
            onClick={handleLogout}
            title="Sair do admin"
            className="flex-1 sm:flex-none flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 rounded text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-red-600 transition whitespace-nowrap"
          >
            <LogOut size={12} className="sm:w-3.5 sm:h-3.5" />
            Sair
          </button>
        </div>
      </nav>

      <main className="flex-1 overflow-hidden flex relative">
        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col">
            <ChatInterface />
          </div>
        )}
        {activeTab === 'customers' && (
          <div className="flex-1 overflow-hidden bg-slate-50">
            <CustomerMenu />
          </div>
        )}
        {activeTab === 'receipts' && (
          <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
            <PaymentReceipts />
          </div>
        )}
        {activeTab === 'apps' && (
          <div className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6">
            <div className="max-w-5xl mx-auto">
              <AppCatalog />
            </div>
          </div>
        )}
        {activeTab === 'agenda' && (
          <div className="flex-1 overflow-hidden">
            <ContactsAgenda />
          </div>
        )}
        {activeTab === 'ativeapps' && (
          <div className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6">
            <div className="max-w-5xl mx-auto">
              <AtiveAppCatalog />
            </div>
          </div>
        )}
        {activeTab === 'admin' && (
          <div className="flex-1 overflow-y-auto bg-slate-50">
            <AdminPanel />
          </div>
        )}
        {activeTab === 'tester' && (
          <div className="flex-1 overflow-y-auto bg-slate-50">
            <ActivationTester />
          </div>
        )}
        {activeTab === 'browser' && (
          <div className="flex-1 overflow-hidden">
            <BrowserRemote />
          </div>
        )}
      </main>

      <footer className="px-4 py-1 bg-slate-900 text-white text-[9px] flex justify-between items-center z-20 uppercase tracking-widest font-medium">
        <div className="flex items-center gap-3">
          <span>© 2026 STARTPAINEL SUPPORT</span>
          <span className="text-emerald-400">API EFIBANK: ONLINE</span>
        </div>
        <div className="flex items-center gap-4">
          <span>V1.0.4 - BETA</span>
          <a href="#" className="hover:text-emerald-400 flex items-center gap-1 transition-colors">
            <Github size={10} />
            SOURCE
          </a>
        </div>
      </footer>
      <Toaster position="top-right" richColors />
    </div>
  );
}
