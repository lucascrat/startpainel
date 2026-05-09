import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Terminal, Send, CheckCircle2, AlertCircle, RefreshCw, Activity } from 'lucide-react';

export default function ActivationTester() {
  const [username, setUsername] = useState('');
  const [txid, setTxid] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastCheck, setLastCheck] = useState<{status: string} | null>(null);

  const addLog = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 49)]);
  };

  const simulatePayment = async () => {
    if (!txid) return alert('Insira um TXID para simular');
    setIsLoading(true);
    addLog(`Simulando pagamento concluído para TXID: ${txid}...`);
    
    try {
      // In our logic, /api/pix/status/:txid checks Efibank, 
      // but if the charge is manually updated to CONCLUIDA in Efibank, this would trigger it.
      // Since we can't easily fake Efibank's response without a sandbox override,
      // we'll use a special test route I'll create in the server.
      
      const res = await fetch(`/api/test/force-renew/${txid}`, { method: 'POST' });
      const data = await res.json();
      
      if (res.ok) {
        addLog(`✅ SUCESSO: ${data.message}`);
      } else {
        addLog(`❌ ERRO: ${data.error || 'Falha na simulação'}`);
      }
    } catch (error: any) {
      addLog(`❌ ERRO DE REDE: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const checkStatus = async () => {
    if (!txid) return;
    try {
      const res = await fetch(`/api/pix/status/${txid}`);
      const data = await res.json();
      setLastCheck(data);
      addLog(`Status atual no Efibank: ${data.status}`);
    } catch (e) {
      addLog('Erro ao consultar status');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
      <header className="flex items-center gap-3 mb-4 sm:mb-8">
        <div className="p-2 sm:p-3 bg-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-200 shrink-0">
          <Activity size={20} className="sm:w-6 sm:h-6" />
        </div>
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-800">Testador</h1>
          <p className="text-[10px] sm:text-sm text-slate-500">Fluxo de Renovação Automática</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {/* Control Panel */}
        <div className="space-y-4">
          <section className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-100">
            <h2 className="text-xs sm:text-sm font-semibold text-slate-700 mb-3 sm:mb-4 flex items-center gap-2">
              <Send size={16} /> Simular Pagamento
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase ml-1">TXID da Cobrança</label>
                <input 
                  type="text" 
                  value={txid}
                  onChange={(e) => setTxid(e.target.value)}
                  placeholder="Insira o txid..."
                  className="w-full px-3 sm:px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                />
              </div>
              <button 
                onClick={simulatePayment}
                disabled={isLoading}
                className="w-full py-2.5 sm:py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs sm:text-sm hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? <RefreshCw size={16} className="animate-spin" /> : 'Forçar Renovação'}
              </button>
            </div>
          </section>

          <section className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-100">
            <h2 className="text-xs sm:text-sm font-semibold text-slate-700 mb-3 sm:mb-4 flex items-center gap-2">
              <Activity size={16} /> Status Atual
            </h2>
            <div className="bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-100 text-center">
              <p className="text-[9px] sm:text-xs text-slate-400 uppercase font-bold mb-1">Status no Efibank</p>
              <div className={`text-base sm:text-lg font-black ${lastCheck?.status === 'CONCLUIDA' ? 'text-emerald-500' : 'text-amber-500'}`}>
                {lastCheck?.status || '---'}
              </div>
              <button 
                onClick={checkStatus}
                className="mt-2 sm:mt-3 text-[9px] sm:text-[10px] font-bold text-indigo-600 hover:underline flex items-center gap-1 mx-auto"
              >
                <RefreshCw size={10} /> ATUALIZAR
              </button>
            </div>
          </section>
        </div>

        {/* Logs */}
        <div className="bg-slate-900 rounded-2xl shadow-xl overflow-hidden flex flex-col border border-slate-800">
          <div className="bg-slate-800 p-2 sm:p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal size={12} className="text-slate-400" />
              <span className="text-[9px] sm:text-[11px] font-bold text-slate-300 uppercase tracking-widest">Logs</span>
            </div>
            <button onClick={() => setLogs([])} className="text-[9px] text-slate-500 hover:text-white">LIMPAR</button>
          </div>
          <div className="flex-1 p-3 sm:p-4 font-mono text-[10px] sm:text-[11px] overflow-y-auto space-y-1 h-[250px] sm:h-[400px]">
            {logs.length === 0 && <div className="text-slate-600 italic">Nenhum evento...</div>}
            {logs.map((log, i) => (
              <div key={i} className={`${log.includes('✅') ? 'text-emerald-400' : log.includes('❌') ? 'text-rose-400' : 'text-slate-300'} break-words`}>
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-100 p-3 sm:p-4 rounded-xl flex gap-2 sm:gap-3">
        <AlertCircle className="text-amber-500 shrink-0" size={18} />
        <div>
          <h3 className="text-[11px] sm:text-sm font-bold text-amber-800">Como testar?</h3>
          <p className="text-[10px] sm:text-[12px] text-amber-700 leading-relaxed mt-1">
            Gere uma cobrança no Chat, copie o <strong>TXID</strong> e cole aqui para forçar a ativação.
          </p>
        </div>
      </div>
    </div>
  );
}
