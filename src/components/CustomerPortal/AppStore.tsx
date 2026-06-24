import React, { useState } from 'react';
import { Tv, MonitorSmartphone, PlayCircle, KeyRound, Copy, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AppStore({ token, catalog, onReload }: { token: string, catalog: any[], onReload: () => void }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [macInput, setMacInput] = useState('');
  const [selectedApp, setSelectedApp] = useState<any>(null);

  const handleWarezTest = async (provider: string) => {
    setLoading(provider);
    try {
      const res = await fetch('/api/portal/test/warez', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar teste');
      setTestResult(data.credentials);
      toast.success('Teste gerado com sucesso!');
      onReload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(null);
    }
  };

  const handleMacTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!macInput || !selectedApp) return;
    setLoading(selectedApp.name);
    try {
      const isSmartOne = selectedApp.name.toLowerCase() === 'smartone';
      const res = await fetch('/api/portal/test/ativeapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ mac: macInput, appName: selectedApp.name, isSmartOne })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao ativar app');
      toast.success(data.message || 'App ativado com sucesso! Reinicie a TV.');
      setSelectedApp(null);
      setMacInput('');
      onReload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado!');
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Loja de Aplicativos</h2>
        <p className="text-gray-400">Escolha um aplicativo compatível com sua TV ou dispositivo e gere um teste gratuito.</p>
      </div>

      {testResult && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            <h3 className="text-lg font-bold text-emerald-400">Seu Teste Está Pronto!</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-900 rounded-xl p-4 flex justify-between items-center border border-gray-800">
              <div>
                <p className="text-xs text-gray-500 mb-1">Usuário</p>
                <p className="text-white font-mono font-medium">{testResult.username}</p>
              </div>
              <button onClick={() => copyToClipboard(testResult.username)} className="p-2 text-gray-400 hover:text-white bg-gray-800 rounded-lg"><Copy className="w-4 h-4" /></button>
            </div>
            <div className="bg-gray-900 rounded-xl p-4 flex justify-between items-center border border-gray-800">
              <div>
                <p className="text-xs text-gray-500 mb-1">Senha</p>
                <p className="text-white font-mono font-medium">{testResult.password}</p>
              </div>
              <button onClick={() => copyToClipboard(testResult.password)} className="p-2 text-gray-400 hover:text-white bg-gray-800 rounded-lg"><Copy className="w-4 h-4" /></button>
            </div>
          </div>
          <button onClick={() => setTestResult(null)} className="mt-4 text-sm text-emerald-400 hover:underline">Fechar</button>
        </div>
      )}

      {/* WarezTV Apps (Login/Pass) */}
      <section>
        <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-4">
          <KeyRound className="w-5 h-5 text-indigo-400" /> Apps com Usuário e Senha
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {['Krator', 'Kplay', 'XCloud'].map(app => (
            <div key={app} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-indigo-500/50 transition-colors group">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center">
                  <MonitorSmartphone className="w-6 h-6 text-indigo-400" />
                </div>
              </div>
              <h4 className="text-white font-bold text-lg">{app}</h4>
              <p className="text-sm text-gray-400 mt-1 mb-4">Recomendado para Android TV, TV Box e Celulares.</p>
              <button
                onClick={() => handleWarezTest(app)}
                disabled={loading === app}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors flex justify-center items-center gap-2 disabled:opacity-50"
              >
                {loading === app ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Gerar Teste'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* MAC Apps (StartPainel & AtiveApp) */}
      <section>
        <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-4">
          <Tv className="w-5 h-5 text-purple-400" /> Apps para Smart TV (Via MAC)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {catalog.filter(c => c.name !== 'StartFlix').map((app: any) => (
            <div key={app.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-purple-500/50 transition-colors">
              <div className="flex items-center gap-4 mb-4">
                {app.icon_url ? (
                  <img src={app.icon_url} alt={app.name} className="w-12 h-12 rounded-xl object-cover" />
                ) : (
                  <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center">
                    <PlayCircle className="w-6 h-6 text-purple-400" />
                  </div>
                )}
                <div>
                  <h4 className="text-white font-bold">{app.name}</h4>
                  <span className="text-xs px-2 py-0.5 bg-gray-800 text-gray-300 rounded-md">Ativação Remota</span>
                </div>
              </div>
              
              {selectedApp?.id === app.id ? (
                <form onSubmit={handleMacTest} className="mt-4 space-y-3">
                  <input
                    type="text"
                    placeholder="Digite o MAC (ex: A1:B2...)"
                    value={macInput}
                    onChange={e => setMacInput(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:ring-1 focus:ring-purple-500 outline-none uppercase"
                    required
                  />
                  <div className="flex gap-2">
                    <button type="submit" disabled={loading === app.name} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg text-sm font-medium flex justify-center">
                      {loading === app.name ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ativar Agora'}
                    </button>
                    <button type="button" onClick={() => { setSelectedApp(null); setMacInput(''); }} className="px-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm">
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setSelectedApp(app)}
                  className="w-full mt-2 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  Selecionar Este App
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
