import React, { useState } from 'react';
import ChatInterface from './components/ChatInterface';
import AdminPanel from './components/AdminPanel';
import ActivationTester from './components/ActivationTester';
import { MessageSquare, ShieldCheck, Github, Activity } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'chat' | 'admin' | 'tester'>('chat');

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans">
      {/* Navigation Bar - High Density Style */}
      <nav className="flex items-center justify-between px-4 py-2 bg-white border-b border-slate-200 shadow-sm z-20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-whatsapp-teal rounded flex items-center justify-center text-white font-bold text-xs shadow-md">SP</div>
          <div className="flex flex-col">
            <span className="font-bold text-slate-800 tracking-tighter text-sm uppercase">StartPainel</span>
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-none">Automated Support</span>
          </div>
        </div>
        <div className="flex bg-slate-100 p-0.5 rounded border border-slate-200">
          <button 
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition ${
              activeTab === 'chat' ? 'bg-white text-whatsapp-teal shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <MessageSquare size={14} />
            Chat
          </button>
          <button 
            onClick={() => setActiveTab('admin')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition ${
              activeTab === 'admin' ? 'bg-white text-whatsapp-teal shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <ShieldCheck size={14} />
            Admin
          </button>
          <button 
            onClick={() => setActiveTab('tester')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition ${
              activeTab === 'tester' ? 'bg-white text-whatsapp-teal shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Activity size={14} />
            Teste
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex">
        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col">
            <ChatInterface />
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

