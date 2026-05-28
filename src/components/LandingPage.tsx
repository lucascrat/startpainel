import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MessageCircle, Zap, Gift, Crown, Lock, X,
  Play, Tv, Phone, Menu, Check,
} from 'lucide-react';

interface LandingApp {
  id: number;
  name: string;
  app_image_url: string | null;
  landing_category: 'free' | 'paid' | null;
  landing_rank: number | null;
  landing_price: string | null;
  description: string | null;
}

interface Banner {
  id: number;
  title: string;
  subtitle: string;
  image_url: string;
  cta_label: string;
  badge: string;
}

interface Props {
  onStartChat: (name: string, phone: string) => void;
  onAdminClick: () => void;
  supportWhatsapp: string;
  attendantName: string;
  attendantImage: string;
}

function onlyDigits(s: string) { return (s || '').replace(/\D/g, ''); }

const SF_RED   = '#E50914';
const SF_DARK  = '#0a0a0a';
const SF_CARD  = '#1a1a1a';
const SF_GOLD  = '#f5a623';

// Placeholder gradient para banners sem imagem
const GRAD_BANNERS = [
  'linear-gradient(135deg, #0a0a0a 0%, #1a0a0a 40%, #2a0808 100%)',
  'linear-gradient(135deg, #0a0a14 0%, #0a0a2a 40%, #080820 100%)',
  'linear-gradient(135deg, #0a0f0a 0%, #0a1a0a 40%, #082008 100%)',
];

export default function LandingPage({ onStartChat, onAdminClick, supportWhatsapp, attendantName, attendantImage }: Props) {
  const [banners, setBanners]       = useState<Banner[]>([]);
  const [freeApps, setFreeApps]     = useState<LandingApp[]>([]);
  const [paidApps, setPaidApps]     = useState<LandingApp[]>([]);
  const [top10, setTop10]           = useState<LandingApp[]>([]);
  const [allApps, setAllApps]       = useState<LandingApp[]>([]);

  const [currentBanner, setCurrentBanner] = useState(0);
  const [showModal, setShowModal]   = useState(false);
  const [nameInput, setNameInput]   = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [navOpen, setNavOpen]       = useState(false);

  const heroRef    = useRef<HTMLDivElement>(null);
  const freeRef    = useRef<HTMLDivElement>(null);
  const paidRef    = useRef<HTMLDivElement>(null);
  const top10Ref   = useRef<HTMLDivElement>(null);

  // Carrega dados da landpage
  useEffect(() => {
    fetch('/api/landing-data')
      .then(r => r.json())
      .then(d => {
        if (d.banners?.length) setBanners(d.banners);
        const apps: LandingApp[] = d.apps || [];
        setAllApps(apps);
        setFreeApps(apps.filter(a => a.landing_category === 'free'));
        setPaidApps(apps.filter(a => a.landing_category === 'paid'));
        const ranked = apps.filter(a => a.landing_rank != null).sort((a, b) => (a.landing_rank! - b.landing_rank!));
        setTop10(ranked.slice(0, 10));
      })
      .catch(() => {});
  }, []);

  // Auto-avança banner a cada 5s
  useEffect(() => {
    const total = banners.length || 3;
    const t = setInterval(() => setCurrentBanner(c => (c + 1) % total), 5000);
    return () => clearInterval(t);
  }, [banners.length]);

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setNavOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = nameInput.trim();
    const p = onlyDigits(phoneInput);
    if (!n || p.length < 10) return;
    onStartChat(n, p);
    setShowModal(false);
  };

  // Monta lista de banners (usa defaults se não houver dados)
  const displayBanners: Banner[] = banners.length > 0 ? banners : [
    { id: 1, title: 'O melhor IPTV do Brasil', subtitle: 'Mais de 1000 canais, filmes e séries em HD e 4K', image_url: '', cta_label: 'Começar agora', badge: '⚡ Ativação instantânea' },
    { id: 2, title: 'Suporte 24/7 com IA', subtitle: 'Atendimento inteligente e humanizado a qualquer hora', image_url: '', cta_label: 'Falar com suporte', badge: '🤖 IA + Humano' },
    { id: 3, title: 'Apps parceiros exclusivos', subtitle: 'Compatível com Smart TV, Android, iPhone e muito mais', image_url: '', cta_label: 'Ver aplicativos', badge: '📱 Multi-plataforma' },
  ];

  const banner = displayBanners[currentBanner];

  return (
    <div className="flex flex-col min-h-full overflow-y-auto" style={{ background: SF_DARK, color: '#fff', fontFamily: 'Inter, ui-sans-serif, sans-serif' }}>

      {/* ─── NAVBAR ─── */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-4 sm:px-8 py-3" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.95), rgba(0,0,0,0.7))', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(229,9,20,0.15)' }}>
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2 cursor-pointer" onClick={() => scrollTo(heroRef)}>
          <span className="text-2xl font-black tracking-tighter" style={{ color: SF_RED }}>START</span>
          <span className="text-2xl font-black tracking-tighter text-white">FLIX</span>
        </motion.div>

        {/* Links desktop */}
        <div className="hidden sm:flex items-center gap-6 text-sm font-semibold text-gray-300">
          <button onClick={() => scrollTo(heroRef)} className="hover:text-white transition">Início</button>
          <button onClick={() => scrollTo(freeRef)} className="hover:text-white transition flex items-center gap-1"><Gift size={13} />Gratuitos</button>
          <button onClick={() => scrollTo(paidRef)} className="hover:text-white transition flex items-center gap-1"><Zap size={13} />Ativação Imediata</button>
          <button onClick={() => scrollTo(top10Ref)} className="hover:text-white transition flex items-center gap-1"><Crown size={13} />Top 10</button>
        </div>

        <div className="flex items-center gap-2">
          {supportWhatsapp && (
            <a href={`https://wa.me/${supportWhatsapp}`} target="_blank" rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-white transition"
              style={{ background: '#25D366' }}>
              <MessageCircle size={13} />WhatsApp
            </a>
          )}
          <button onClick={() => setShowModal(true)} className="px-4 py-1.5 rounded text-xs font-black text-white transition-all hover:brightness-110"
            style={{ background: SF_RED }}>
            Entrar no Suporte
          </button>
          <button className="sm:hidden p-1 text-gray-300" onClick={() => setNavOpen(v => !v)}>
            <Menu size={20} />
          </button>
        </div>
      </nav>

      {/* Menu mobile */}
      <AnimatePresence>
        {navOpen && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="sticky top-[52px] z-40 flex flex-col gap-3 px-6 py-4 text-sm font-semibold text-gray-300"
            style={{ background: 'rgba(10,10,10,0.97)', borderBottom: '1px solid rgba(229,9,20,0.2)' }}>
            <button onClick={() => scrollTo(heroRef)} className="text-left hover:text-white transition">🏠 Início</button>
            <button onClick={() => scrollTo(freeRef)} className="text-left hover:text-white transition">🎁 Aplicativos Gratuitos</button>
            <button onClick={() => scrollTo(paidRef)} className="text-left hover:text-white transition">⚡ Ativação Imediata</button>
            <button onClick={() => scrollTo(top10Ref)} className="text-left hover:text-white transition">👑 Top 10 Mais Vendidos</button>
            {supportWhatsapp && (
              <a href={`https://wa.me/${supportWhatsapp}`} target="_blank" rel="noopener noreferrer" className="text-left hover:text-white transition" style={{ color: '#25D366' }}>
                💬 WhatsApp Direto
              </a>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── HERO / BANNER CARROSSEL ─── */}
      <div ref={heroRef} className="relative w-full overflow-hidden" style={{ minHeight: 'min(520px, 60vw)' }}>
        <AnimatePresence mode="wait">
          <motion.div key={currentBanner}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }}
            className="absolute inset-0"
            style={{
              background: banner.image_url ? `url(${banner.image_url}) center/cover no-repeat` : GRAD_BANNERS[currentBanner % GRAD_BANNERS.length],
            }}
          >
            {/* overlay */}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0.3) 100%)' }} />
          </motion.div>
        </AnimatePresence>

        {/* conteúdo hero */}
        <div className="relative z-10 flex flex-col justify-center h-full px-6 sm:px-16 py-16 sm:py-24" style={{ minHeight: 'min(520px, 60vw)' }}>
          <AnimatePresence mode="wait">
            <motion.div key={`text-${currentBanner}`}
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.5 }}
              className="max-w-xl">
              <span className="inline-block mb-3 px-3 py-1 rounded-full text-xs font-bold" style={{ background: 'rgba(229,9,20,0.85)', color: '#fff' }}>
                {banner.badge}
              </span>
              <h1 className="text-3xl sm:text-5xl font-black leading-tight mb-3" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.7)' }}>{banner.title}</h1>
              <p className="text-sm sm:text-base text-gray-300 mb-6 max-w-sm" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>{banner.subtitle}</p>
              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={() => setShowModal(true)}
                  className="flex items-center gap-2 px-6 py-3 rounded font-black text-sm text-white transition-all hover:brightness-110 active:scale-95"
                  style={{ background: SF_RED }}>
                  <MessageCircle size={16} />{banner.cta_label}
                </button>
                {supportWhatsapp && (
                  <a href={`https://wa.me/${supportWhatsapp}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-5 py-3 rounded font-bold text-sm text-white transition-all hover:bg-white/20 border border-white/30">
                    <Phone size={14} />WhatsApp
                  </a>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* dots do carrossel */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {displayBanners.map((_, i) => (
            <button key={i} onClick={() => setCurrentBanner(i)}
              className="w-2 h-2 rounded-full transition-all"
              style={{ background: i === currentBanner ? SF_RED : 'rgba(255,255,255,0.4)', width: i === currentBanner ? 20 : 8 }} />
          ))}
        </div>
      </div>

      {/* ─── TICKER DE APPS PARCEIROS (todos os apps do catálogo rolando) ─── */}
      {allApps.length > 0 && (
        <div className="py-6 overflow-hidden" style={{ background: 'rgba(26,26,26,0.8)', borderTop: '1px solid rgba(229,9,20,0.15)', borderBottom: '1px solid rgba(229,9,20,0.15)' }}>
          <p className="text-center text-[10px] font-bold tracking-[0.3em] text-gray-500 uppercase mb-4">Apps Parceiros</p>
          <div className="relative">
            <div className="flex gap-8 items-center" style={{ animation: 'ticker 30s linear infinite', width: 'max-content' }}>
              {[...allApps, ...allApps].map((app, i) => (
                <div key={i} className="flex items-center gap-2 shrink-0 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  {app.app_image_url
                    ? <img src={app.app_image_url} alt={app.name} className="w-8 h-8 rounded object-contain" />
                    : <div className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold text-white" style={{ background: SF_RED }}>{app.name[0]}</div>
                  }
                  <span className="text-xs font-semibold text-gray-300 whitespace-nowrap">{app.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── APLICATIVOS GRATUITOS ─── */}
      {freeApps.length > 0 && (
        <section ref={freeRef} className="px-4 sm:px-8 py-12">
          <div className="flex items-center gap-3 mb-6">
            <Gift size={22} style={{ color: '#22c55e' }} />
            <h2 className="text-xl sm:text-2xl font-black">Aplicativos Disponíveis <span style={{ color: '#22c55e' }}>— Ativação Grátis</span></h2>
          </div>
          <div className="overflow-x-auto pb-4 no-scrollbar">
            <div className="flex gap-4" style={{ width: 'max-content' }}>
              {freeApps.map((app, i) => (
                <motion.div key={app.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
                  className="relative rounded-xl overflow-hidden cursor-pointer group hover:scale-105 transition-transform"
                  style={{ width: 160, background: SF_CARD, border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="relative" style={{ height: 110 }}>
                    {app.app_image_url
                      ? <img src={app.app_image_url} alt={app.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-3xl font-black" style={{ background: 'linear-gradient(135deg, #1a1a1a, #2a2a2a)', color: SF_RED }}>{app.name[0]}</div>
                    }
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[9px] font-black" style={{ background: '#22c55e', color: '#fff' }}>GRÁTIS</span>
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-bold text-white truncate">{app.name}</p>
                    {app.description && <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2">{app.description}</p>}
                    <button onClick={() => setShowModal(true)}
                      className="mt-2 w-full py-1.5 rounded text-[10px] font-black text-white flex items-center justify-center gap-1 transition-all hover:brightness-110"
                      style={{ background: '#22c55e' }}>
                      <Gift size={10} />Ativar grátis
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─── APLICATIVOS PAGOS / ATIVAÇÃO IMEDIATA ─── */}
      {paidApps.length > 0 && (
        <section ref={paidRef} className="px-4 sm:px-8 py-12" style={{ background: 'rgba(26,26,26,0.5)' }}>
          <div className="flex items-center gap-3 mb-6">
            <Zap size={22} style={{ color: SF_GOLD }} />
            <h2 className="text-xl sm:text-2xl font-black">Aplicativos Pagos <span style={{ color: SF_GOLD }}>— Ativação Imediata</span></h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {paidApps.map((app, i) => (
              <motion.div key={app.id} initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.04 }}
                className="relative rounded-xl overflow-hidden cursor-pointer hover:scale-105 transition-transform group"
                style={{ background: SF_CARD, border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="relative" style={{ paddingTop: '70%' }}>
                  {app.app_image_url
                    ? <img src={app.app_image_url} alt={app.name} className="absolute inset-0 w-full h-full object-cover" />
                    : <div className="absolute inset-0 flex items-center justify-center text-4xl font-black" style={{ background: 'linear-gradient(135deg, #1a0505, #2a0a0a)', color: SF_RED }}>{app.name[0]}</div>
                  }
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-black" style={{ background: SF_GOLD, color: '#000' }}>⚡ IMEDIATO</span>
                </div>
                <div className="p-3">
                  <p className="text-xs font-bold text-white truncate">{app.name}</p>
                  {app.landing_price && (
                    <p className="text-sm font-black mt-1" style={{ color: SF_GOLD }}>{app.landing_price}</p>
                  )}
                  <button onClick={() => setShowModal(true)}
                    className="mt-2 w-full py-1.5 rounded text-[10px] font-black text-white flex items-center justify-center gap-1 transition-all hover:brightness-110"
                    style={{ background: SF_RED }}>
                    <Zap size={10} />Ativar agora
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* ─── TOP 10 MAIS VENDIDOS ─── */}
      {top10.length > 0 && (
        <section ref={top10Ref} className="px-4 sm:px-8 py-12">
          <div className="flex items-center gap-3 mb-8">
            <Crown size={22} style={{ color: SF_GOLD }} />
            <h2 className="text-xl sm:text-2xl font-black">Top <span style={{ color: SF_RED }}>10</span> Mais Vendidos</h2>
          </div>
          <div className="overflow-x-auto pb-4 no-scrollbar">
            <div className="flex gap-3" style={{ width: 'max-content' }}>
              {top10.map((app, i) => (
                <motion.div key={app.id} initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
                  className="relative cursor-pointer hover:scale-105 transition-transform"
                  style={{ width: 140 }}>
                  {/* Número grande estilo Netflix */}
                  <div className="absolute -left-4 bottom-8 z-10 font-black select-none leading-none"
                    style={{ fontSize: 72, color: SF_DARK, WebkitTextStroke: `3px ${i < 3 ? SF_GOLD : 'rgba(255,255,255,0.2)'}`, lineHeight: 1 }}>
                    {app.landing_rank}
                  </div>
                  <div className="relative ml-6 rounded-lg overflow-hidden" style={{ height: 170, background: SF_CARD, border: '1px solid rgba(255,255,255,0.07)' }}>
                    {app.app_image_url
                      ? <img src={app.app_image_url} alt={app.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-4xl font-black" style={{ background: 'linear-gradient(135deg, #1a0505, #2a0a0a)', color: SF_RED }}>{app.name[0]}</div>
                    }
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent flex items-end p-2">
                      <p className="text-[10px] font-black text-white leading-tight">{app.name}</p>
                    </div>
                    {i < 3 && (
                      <span className="absolute top-2 right-2 text-base">{['🥇','🥈','🥉'][i]}</span>
                    )}
                  </div>
                  <button onClick={() => setShowModal(true)}
                    className="mt-1.5 ml-6 w-[calc(100%-1.5rem)] py-1.5 rounded text-[10px] font-black text-white flex items-center justify-center gap-1 transition-all hover:brightness-110"
                    style={{ background: SF_RED }}>
                    <Play size={9} fill="white" />Quero esse
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─── FEATURES STRIP ─── */}
      <section className="px-4 sm:px-8 py-10" style={{ background: 'rgba(229,9,20,0.06)', borderTop: '1px solid rgba(229,9,20,0.15)', borderBottom: '1px solid rgba(229,9,20,0.15)' }}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-3xl mx-auto text-center">
          {[
            { icon: <Zap size={20} />, title: 'Ativação Instantânea', sub: 'Em minutos, tudo funcionando' },
            { icon: <Tv size={20} />, title: 'Multi-dispositivo', sub: 'Smart TV, Android, iOS e PC' },
            { icon: <MessageCircle size={20} />, title: 'Suporte 24/7', sub: 'IA + atendimento humanizado' },
            { icon: <Check size={20} />, title: '100% Seguro', sub: 'Pagamento via PIX ou cartão' },
          ].map((f, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2" style={{ background: 'rgba(229,9,20,0.15)', color: SF_RED }}>{f.icon}</div>
              <p className="text-xs font-black text-white">{f.title}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{f.sub}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── CTA FINAL ─── */}
      <section className="px-4 sm:px-8 py-16 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <h2 className="text-2xl sm:text-4xl font-black mb-3">Pronto para <span style={{ color: SF_RED }}>começar</span>?</h2>
          <p className="text-sm text-gray-400 mb-8">Fale com nosso suporte agora e ative seu plano em minutos.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-8 py-4 rounded font-black text-white transition-all hover:brightness-110 active:scale-95 text-sm"
              style={{ background: SF_RED, boxShadow: '0 8px 30px rgba(229,9,20,0.4)' }}>
              <MessageCircle size={18} />Iniciar atendimento
            </button>
            {supportWhatsapp && (
              <a href={`https://wa.me/${supportWhatsapp}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-8 py-4 rounded font-bold text-white transition-all hover:bg-white/10 border border-white/20 text-sm">
                <Phone size={16} />Chamar no WhatsApp
              </a>
            )}
          </div>
        </motion.div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="px-6 py-4 text-center text-[10px] text-gray-600 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex items-center justify-between flex-wrap gap-2 max-w-4xl mx-auto">
          <span className="font-black" style={{ color: SF_RED }}>STARTFLIX</span>
          <span>© 2026 StartPainel — Todos os direitos reservados</span>
          <button onClick={onAdminClick} className="flex items-center gap-1 text-gray-700 hover:text-gray-500 transition">
            <Lock size={10} />Admin
          </button>
        </div>
      </footer>

      {/* ─── BOTÃO FLUTUANTE WHATSAPP ─── */}
      {supportWhatsapp && (
        <a href={`https://wa.me/${supportWhatsapp}`} target="_blank" rel="noopener noreferrer"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full text-sm font-bold text-white shadow-xl transition-transform hover:scale-105"
          style={{ background: '#25D366', boxShadow: '0 8px 24px rgba(37,211,102,0.45)' }}>
          <MessageCircle size={20} className="fill-white text-white" />
          <span className="hidden sm:inline">WhatsApp</span>
        </a>
      )}

      {/* ─── MODAL DE ENTRADA ─── */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl relative"
              style={{ background: '#111', border: '1px solid rgba(229,9,20,0.3)' }}>
              <button onClick={() => setShowModal(false)}
                className="absolute top-3 right-3 z-10 p-1 rounded-full text-gray-500 hover:text-white transition"
                style={{ background: 'rgba(255,255,255,0.07)' }}>
                <X size={16} />
              </button>

              {/* Topo do modal */}
              <div className="px-6 pt-8 pb-6 text-center" style={{ background: 'linear-gradient(135deg, #1a0505, #150000)' }}>
                <div className="relative inline-block">
                  <img src={attendantImage} alt={attendantName} className="w-20 h-20 rounded-full border-4 object-cover mx-auto shadow-lg" style={{ borderColor: SF_RED }} />
                  <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-emerald-400 border-2 border-black"></span>
                </div>
                <h3 className="mt-4 text-lg font-black text-white">{attendantName}</h3>
                <p className="text-[10px] font-bold mt-1" style={{ color: SF_RED }}>● ONLINE AGORA • RESPONDE RÁPIDO</p>
              </div>

              <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
                <div className="text-center mb-2">
                  <p className="text-sm font-bold text-white">Bem-vindo ao StartFlix 👋</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Preencha pra iniciar o atendimento.</p>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Seu nome</label>
                  <input autoFocus value={nameInput} onChange={e => setNameInput(e.target.value)}
                    placeholder="Como você se chama?"
                    className="mt-1 w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Seu WhatsApp</label>
                  <input value={phoneInput} onChange={e => setPhoneInput(e.target.value)}
                    placeholder="Ex.: 88 99999-0000" inputMode="tel"
                    className="mt-1 w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }} />
                  <p className="text-[10px] text-gray-600 mt-1">Para continuarmos o atendimento se desconectar.</p>
                </div>
                <button type="submit"
                  disabled={!nameInput.trim() || onlyDigits(phoneInput).length < 10}
                  className="w-full py-3 rounded-xl font-black text-sm text-white transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ background: SF_RED }}>
                  <MessageCircle size={16} />Iniciar atendimento 💬
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CSS global para ticker e scroll */}
      <style>{`
        @keyframes ticker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      `}</style>
    </div>
  );
}
