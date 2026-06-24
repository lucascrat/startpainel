import React, { useState, useEffect } from 'react';
import { Tv, MonitorSmartphone, PlayCircle, KeyRound, Loader2, X, CheckCircle2, Copy } from 'lucide-react';
import { toast } from 'sonner';

export default function PublicStore({ onLoginSelect, onRegisterSuccess }: { onLoginSelect: () => void, onRegisterSuccess: (token: string, customer: any, testResult?: any) => void }) {
  const [catalog, setCatalog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<any>(null); // { provider: 'wareztv', app: 'Krator', macRequired: false }
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [mac, setMac] = useState('');
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    fetch('/api/portal/public-catalog')
      .then(r => r.json())
      .then(data => {
        setCatalog(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleTestClick = (provider: string, appName: string, requiresMac: boolean) => {
    setSelectedApp({ provider, app: appName, macRequired: requiresMac });
    setShowModal(true);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !whatsapp) return;
    if (selectedApp?.macRequired && !mac) {
      toast.error("Por favor, informe o MAC Address da sua TV.");
      return;
    }

    setRegistering(true);
    try {
      const res = await fetch('/api/portal/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          whatsapp,
          appToTest: selectedApp ? {
            provider: selectedApp.provider,
            app: selectedApp.app,
            mac: selectedApp.macRequired ? mac : undefined
          } : undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao registrar');
      
      toast.success("Conta criada com sucesso!");
      setShowModal(false);
      onRegisterSuccess(data.token, data.customer, data.testResult);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRegistering(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Tv className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-bold text-xl bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">MinhaTV</h1>
          </div>
          <button 
            onClick={onLoginSelect}
            className="text-sm font-medium text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg transition-colors"
          >
            Já sou cliente (Login)
          </button>
        </div>
      </header>

      {/* Hero */}
      <div className="max-w-6xl mx-auto px-4 py-12 md:py-20 text-center">
        <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-6">
          Assista tudo na sua <span className="text-indigo-400">TV Box, Smart TV ou Celular</span>
        </h2>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
          Escolha o aplicativo compatível com o seu aparelho abaixo e gere um <strong>teste gratuito</strong> agora mesmo, sem compromisso!
        </p>
      </div>

      {/* Catalog */}
      <div className="max-w-6xl mx-auto px-4 pb-20 space-y-12">
        
        {/* WarezTV Apps */}
        <section>
          <div className="mb-6 border-b border-gray-800 pb-2">
            <h3 className="text-2xl font-bold text-white flex items-center gap-2">
              <KeyRound className="w-6 h-6 text-indigo-400" /> Apps com Usuário e Senha
            </h3>
            <p className="text-gray-400 text-sm mt-1">Recomendados para Android TV, TV Box e Celulares.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {['Krator', 'Kplay', 'XCloud'].map(app => (
              <div key={app} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-indigo-500/50 transition-colors flex flex-col h-full">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-14 h-14 bg-indigo-500/10 rounded-xl flex items-center justify-center">
                    <MonitorSmartphone className="w-8 h-8 text-indigo-400" />
                  </div>
                </div>
                <h4 className="text-white font-bold text-xl">{app}</h4>
                <p className="text-sm text-gray-400 mt-2 mb-6 flex-1">O {app} é rápido, não trava e é perfeito para o seu aparelho Android. Requer apenas baixar e colocar o usuário e senha que vamos gerar.</p>
                <button
                  onClick={() => handleTestClick('wareztv', app, false)}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-colors"
                >
                  Testar Grátis Agora
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Smart TV Apps */}
        <section>
          <div className="mb-6 border-b border-gray-800 pb-2">
            <h3 className="text-2xl font-bold text-white flex items-center gap-2">
              <Tv className="w-6 h-6 text-purple-400" /> Apps para Smart TV (Samsung/LG)
            </h3>
            <p className="text-gray-400 text-sm mt-1">Ativação remota via MAC Address. Procure um desses na loja da sua TV.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {catalog.filter(c => c.name !== 'StartFlix').map((app: any) => (
              <div key={app.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-purple-500/50 transition-colors flex flex-col">
                <div className="flex items-center gap-4 mb-4">
                  {app.icon_url ? (
                    <img src={app.icon_url} alt={app.name} className="w-14 h-14 rounded-xl object-cover bg-gray-800" />
                  ) : (
                    <div className="w-14 h-14 bg-purple-500/10 rounded-xl flex items-center justify-center">
                      <PlayCircle className="w-7 h-7 text-purple-400" />
                    </div>
                  )}
                  <div>
                    <h4 className="text-white font-bold">{app.name}</h4>
                  </div>
                </div>
                <div className="mt-auto pt-4 border-t border-gray-800/50">
                  <button
                    onClick={() => handleTestClick('mac', app.name, true)}
                    className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 hover:text-purple-400 text-white rounded-xl text-sm font-medium transition-colors"
                  >
                    Ativar Teste neste App
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>

      {/* Registration Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-800 p-6 md:p-8 rounded-2xl shadow-2xl max-w-md w-full relative animate-in fade-in zoom-in-95 duration-200">
            <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white">
              <X className="w-6 h-6" />
            </button>
            
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold text-white mb-2">Quase lá!</h3>
              <p className="text-gray-400 text-sm">
                Preencha os dados abaixo para criarmos seu acesso e liberarmos o teste no <strong>{selectedApp?.app}</strong>.
              </p>
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Seu Nome</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ex: João da Silva"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Seu WhatsApp</label>
                <input
                  type="tel"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ex: 11999999999"
                  required
                />
              </div>

              {selectedApp?.macRequired && (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">MAC Address do {selectedApp.app}</label>
                  <input
                    type="text"
                    value={mac}
                    onChange={(e) => setMac(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none uppercase font-mono"
                    placeholder="Ex: 00:1A:2B:3C:4D:5E"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Geralmente aparece na tela inicial do aplicativo na sua TV.</p>
                </div>
              )}

              <button
                type="submit"
                disabled={registering}
                className="w-full mt-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all flex justify-center items-center gap-2"
              >
                {registering ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Criar Conta e Liberar Teste'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
