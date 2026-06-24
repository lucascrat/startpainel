import React, { useState, useEffect } from 'react';
import { Tv, MonitorSmartphone, PlayCircle, KeyRound, Loader2, X, Sparkles, Zap, ChevronRight, Smartphone } from 'lucide-react';
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
  const [deviceKey, setDeviceKey] = useState('');
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

  const handleTestClick = (type: string, appName: string) => {
    setSelectedApp({ type, app: appName });
    setShowModal(true);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !whatsapp) return;
    
    if ((selectedApp?.type === 'start' || selectedApp?.type === 'ative') && !mac) {
      toast.error("Por favor, informe o MAC Address da sua TV.");
      return;
    }
    
    if (selectedApp?.type === 'ative' && !deviceKey) {
      toast.error("Por favor, informe o Device Key da sua TV.");
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
            type: selectedApp.type,
            app: selectedApp.app,
            mac: (selectedApp.type === 'start' || selectedApp.type === 'ative') ? mac : undefined,
            key: selectedApp.type === 'ative' ? deviceKey : undefined
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

  if (loading) return (
    <div className="min-h-screen bg-[#030014] flex items-center justify-center text-white">
      <div className="relative flex justify-center items-center">
        <div className="absolute animate-ping w-16 h-16 rounded-full bg-indigo-500/20"></div>
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin relative z-10" />
      </div>
    </div>
  );

  // Grouping logic based on names
  const warezNames = ['krator', 'kplay', 'xcloud', 'x-cloud', 'wplay', 'warez'];
  const startNames = ['ultra player', 'quick player', 'easy player', 'fun player', 'fun play'];

  const warezApps = catalog.filter(a => warezNames.some(n => a.name.toLowerCase().includes(n)));
  const startApps = catalog.filter(a => startNames.some(n => a.name.toLowerCase().includes(n)));
  const ativeApps = catalog.filter(a => !warezApps.includes(a) && !startApps.includes(a) && a.name !== 'StartFlix');

  const AppCard = ({ app, type }: { app: any, type: 'warez' | 'start' | 'ative' }) => {
    const isWarez = type === 'warez';
    const isStart = type === 'start';
    
    // Fallback images if DB doesn't have them
    const imageUrl = app.app_image_url || app.icon_url || (isWarez ? 'https://via.placeholder.com/150/4f46e5/ffffff?text=App' : 'https://via.placeholder.com/150/1e1b4b/ffffff?text=App');

    return (
      <div className="relative group overflow-hidden bg-[#0a0a1a] border border-white/5 rounded-3xl p-1 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_40px_-10px_rgba(99,102,241,0.3)]">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
        
        <div className="relative bg-[#05050f]/80 backdrop-blur-xl h-full rounded-[22px] p-5 flex flex-col z-10">
          <div className="flex items-center gap-4 mb-4">
            <div className="relative shrink-0">
              <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
              <img src={imageUrl} alt={app.name} className="relative w-16 h-16 rounded-2xl object-cover bg-[#0a0a1a] shadow-xl ring-1 ring-white/10" />
            </div>
            <div>
              <h4 className="text-white font-bold text-lg leading-tight tracking-tight">{app.name}</h4>
              <span className="inline-flex items-center gap-1 mt-1 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-white/5 text-gray-300 ring-1 ring-white/10">
                {isWarez ? <KeyRound className="w-3 h-3" /> : <Tv className="w-3 h-3" />}
                {isWarez ? 'Usuário e Senha' : 'Ativação Remota'}
              </span>
            </div>
          </div>
          
          <p className="text-sm text-gray-400/80 mb-6 flex-1 line-clamp-2">
            {app.description || `O melhor aplicativo para assistir tudo com a máxima qualidade na sua ${isWarez ? 'TV Box / Celular' : 'Smart TV'}.`}
          </p>
          
          <button
            onClick={() => handleTestClick(type, app.name)}
            className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all duration-300 flex justify-center items-center gap-2 group-hover:shadow-lg
              ${isWarez 
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-indigo-500/25' 
                : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'}`}
          >
            <Sparkles className="w-4 h-4" /> 
            {isWarez ? 'Testar Agora' : 'Ativar Teste na TV'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#030014] text-gray-100 font-sans selection:bg-indigo-500/30 overflow-x-hidden">
      
      {/* Dynamic Background Effects */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/20 rounded-full blur-[150px]"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-violet-600/10 rounded-full blur-[150px]"></div>
        <div className="absolute top-[40%] left-[60%] w-[30%] h-[30%] bg-fuchsia-600/10 rounded-full blur-[120px]"></div>
      </div>

      {/* Header */}
      <header className="fixed w-full top-0 z-40 bg-[#030014]/80 backdrop-blur-2xl border-b border-white/5 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Tv className="w-6 h-6 text-white" />
            </div>
            <h1 className="font-extrabold text-2xl tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">MinhaTV</h1>
          </div>
          <button 
            onClick={onLoginSelect}
            className="text-sm font-bold text-white bg-white/5 hover:bg-white/10 px-5 py-2.5 rounded-xl border border-white/10 transition-all flex items-center gap-2"
          >
            Área do Cliente <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold tracking-widest uppercase mb-6">
            <Zap className="w-3 h-3" /> Liberação Imediata
          </div>
          <h2 className="text-5xl md:text-7xl font-extrabold text-white mb-8 tracking-tight leading-[1.1]">
            Seu entretenimento, <br/>
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">sem complicações.</span>
          </h2>
          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto font-medium">
            Escolha o aplicativo compatível com o seu aparelho abaixo e libere seu <strong className="text-white">teste gratuito em 30 segundos</strong>. Nenhuma configuração difícil necessária.
          </p>
        </div>

        <div className="max-w-7xl mx-auto space-y-24">
          
          {/* WarezTV Section */}
          {warezApps.length > 0 && (
            <section className="relative">
              <div className="flex flex-col items-center text-center mb-10">
                <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-4 ring-1 ring-indigo-500/20">
                  <MonitorSmartphone className="w-6 h-6 text-indigo-400" />
                </div>
                <h3 className="text-3xl font-bold text-white tracking-tight">Celular & TV Box</h3>
                <p className="text-gray-400 mt-2 font-medium">Aplicativos ultra rápidos que funcionam com Usuário e Senha.</p>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {warezApps.map(app => <AppCard key={app.id || app.name} app={app} type="warez" />)}
              </div>
            </section>
          )}

          {/* StartPainel Section */}
          {startApps.length > 0 && (
            <section className="relative">
              <div className="flex flex-col items-center text-center mb-10">
                <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center mb-4 ring-1 ring-purple-500/20">
                  <Tv className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="text-3xl font-bold text-white tracking-tight">Smart TVs (Recomendados)</h3>
                <p className="text-gray-400 mt-2 font-medium">Nossos apps oficiais para Smart TV com ativação remota instantânea.</p>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {startApps.map(app => <AppCard key={app.id || app.name} app={app} type="start" />)}
              </div>
            </section>
          )}

          {/* AtiveApp Section */}
          {ativeApps.length > 0 && (
            <section className="relative">
              <div className="flex flex-col items-center text-center mb-10">
                <div className="w-12 h-12 bg-pink-500/10 rounded-2xl flex items-center justify-center mb-4 ring-1 ring-pink-500/20">
                  <PlayCircle className="w-6 h-6 text-pink-400" />
                </div>
                <h3 className="text-3xl font-bold text-white tracking-tight">Outros Apps para Smart TV</h3>
                <p className="text-gray-400 mt-2 font-medium">Procure um destes na loja da sua TV (Samsung/LG/Roku).</p>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {ativeApps.map(app => <AppCard key={app.id || app.name} app={app} type="ative" />)}
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Futuristic Registration Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-[#030014]/90 backdrop-blur-md" onClick={() => setShowModal(false)}></div>
          
          <div className="bg-[#0a0a1a] border border-white/10 p-1 rounded-[32px] shadow-2xl shadow-indigo-500/20 max-w-md w-full relative z-10 animate-in zoom-in-95 fade-in duration-200">
            <div className="bg-[#05050f] rounded-[28px] p-6 sm:p-8">
              <button 
                onClick={() => setShowModal(false)} 
                className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              
              <div className="mb-8">
                <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-4 ring-1 ring-indigo-500/20">
                  {(selectedApp?.type === 'start' || selectedApp?.type === 'ative') ? <Tv className="w-7 h-7 text-indigo-400" /> : <Smartphone className="w-7 h-7 text-indigo-400" />}
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Falta muito pouco!</h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  Para liberarmos o teste do <strong className="text-white">{selectedApp?.app}</strong>, precisamos apenas do seu nome e WhatsApp.
                </p>
              </div>

              <form onSubmit={handleRegister} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-300">Como podemos te chamar?</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="Seu nome"
                    required
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-300">Seu WhatsApp</label>
                  <input
                    type="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="(11) 99999-9999"
                    required
                  />
                </div>

                {(selectedApp?.type === 'start' || selectedApp?.type === 'ative') && (
                  <div className="space-y-1.5 pt-2">
                    <label className="block text-sm font-semibold text-indigo-300 flex items-center justify-between">
                      MAC Address da TV
                      <span className="text-[10px] uppercase tracking-wider bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">Obrigatório</span>
                    </label>
                    <input
                      type="text"
                      value={mac}
                      onChange={(e) => setMac(e.target.value)}
                      className="w-full bg-indigo-950/20 border border-indigo-500/30 text-white rounded-xl px-4 py-3.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all uppercase font-mono tracking-widest placeholder:text-gray-600"
                      placeholder="A1:B2:C3:D4:E5:F6"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-2">Abra o {selectedApp?.app} na sua TV. O código "MAC" vai estar escrito na tela inicial.</p>
                  </div>
                )}

                {selectedApp?.type === 'ative' && (
                  <div className="space-y-1.5 pt-2">
                    <label className="block text-sm font-semibold text-pink-300 flex items-center justify-between">
                      Device Key
                      <span className="text-[10px] uppercase tracking-wider bg-pink-500/20 text-pink-300 px-2 py-0.5 rounded-full">Obrigatório</span>
                    </label>
                    <input
                      type="text"
                      value={deviceKey}
                      onChange={(e) => setDeviceKey(e.target.value)}
                      className="w-full bg-pink-950/20 border border-pink-500/30 text-white rounded-xl px-4 py-3.5 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition-all font-mono tracking-widest placeholder:text-gray-600"
                      placeholder="Ex: 123456"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-2">A "Device Key" ou "Senha" aparece ao lado do MAC na tela do {selectedApp?.app}.</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={registering}
                  className="w-full mt-8 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl font-bold transition-all duration-300 flex justify-center items-center gap-2 shadow-lg shadow-indigo-500/25 disabled:opacity-50"
                >
                  {registering ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>Liberar Meu Teste Agora <ChevronRight className="w-5 h-5" /></>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
