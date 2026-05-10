import React, { useState, useEffect } from 'react';
import ChatInterface from './components/ChatInterface';
import AdminPanel from './components/AdminPanel';
import ActivationTester from './components/ActivationTester';
import CustomerMenu from './components/CustomerMenu';
import { MessageSquare, ShieldCheck, Github, Activity, LogOut, Users } from 'lucide-react';
import { login, getToken, logout } from './lib/auth';

export default function App() {
  const [activeTab, setActiveTab] = useState<'chat' | 'admin' | 'tester' | 'customers'>('chat');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!getToken());
  const [pwInput, setPwInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    const onExpired = () => setIsAuthenticated(false);
    window.addEventListener('admin-auth-expired', onExpired);
    return () => window.removeEventListener('admin-auth-expired', onExpired);
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
      setPwInput('');
    } else {
      setLoginError(r.error || 'Falha no login');
    }
  };

  const handleLogout = () => {
    logout();
    setIsAuthenticated(false);
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-50 font-sans overflow-hidden">
      {/* Navigation Bar - Responsive Style */}
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
          {isAuthenticated && (
            <button
              onClick={handleLogout}
              title="Sair do admin"
              className="flex-1 sm:flex-none flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 rounded text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-red-600 transition whitespace-nowrap"
            >
              <LogOut size={12} className="sm:w-3.5 sm:h-3.5" />
              Sair
            </button>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex relative">
        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col">
            <ChatInterface />
          </div>
        )}
        
        {(activeTab === 'admin' || activeTab === 'tester') && !isAuthenticated && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4">
            <form onSubmit={handleLogin} className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full space-y-6 text-center">
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
        )}

        {activeTab === 'customers' && isAuthenticated && (
          <div className="flex-1 overflow-hidden bg-slate-50">
            <CustomerMenu />
          </div>
        )}
        {activeTab === 'admin' && isAuthenticated && (
          <div className="flex-1 overflow-y-auto bg-slate-50">
            <AdminPanel />
          </div>
        )}
        {activeTab === 'tester' && isAuthenticated && (
          <div className="flex-1 overflow-y-auto bg-slate-50">
            <ActivationTester />
          </div>
        )}
      </main>

      {/* Footer - High Density */}
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
    </div>
  );
}

