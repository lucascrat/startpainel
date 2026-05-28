import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, Zap, Gift, Crown, Lock, X, Play, Phone, Menu, Check, ChevronRight } from 'lucide-react';

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface LandingApp {
  id: number; name: string; app_image_url: string | null;
  landing_category: 'free' | 'paid' | null; landing_rank: number | null;
  landing_price: string | null; description: string | null;
}
interface Banner { id: number; title: string; subtitle: string; image_url: string; cta_label: string; badge: string; }
interface Props {
  onStartChat: (name: string, phone: string) => void;
  onAdminClick: () => void;
  supportWhatsapp: string;
  attendantName: string;
  attendantImage: string;
}

// ─── CORES ───────────────────────────────────────────────────────────────────
const C = {
  red:    '#E50914',
  purple: '#7C3AED',
  purpleL:'#A855F7',
  dark:   '#080808',
  card:   '#111111',
  card2:  '#161616',
  gold:   '#F5A623',
  border: 'rgba(255,255,255,0.07)',
};

function onlyDigits(s: string) { return (s || '').replace(/\D/g, ''); }

// ─── TICKER ITEMS ─────────────────────────────────────────────────────────────
const TICKER = ['STARTFLIX', 'IPTV PREMIUM', 'ATIVAÇÃO INSTANTÂNEA', 'SUPORTE 24H', 'APPS PARCEIROS', 'TOP 10 MAIS VENDIDOS', 'GRÁTIS PRA TESTAR', 'MULTI-DISPOSITIVO', '4K HDR'];

// ─── FEATURES ────────────────────────────────────────────────────────────────
const FEATURES = [
  { n: '01', icon: '⚡', title: 'ATIVAÇÃO INSTANTÂNEA', sub: 'Em minutos tudo funcionando. Sem burocracia, sem espera.' },
  { n: '02', icon: '📱', title: 'MULTI-DISPOSITIVO', sub: 'Smart TV, Android, iPhone, PC — compatível com tudo.' },
  { n: '03', icon: '🤖', title: 'SUPORTE IA + HUMANO', sub: 'Atendimento inteligente 24h com IA e equipe especializada.' },
  { n: '04', icon: '🔒', title: '100% SEGURO', sub: 'Pagamento via PIX. Sem cartão de crédito necessário.' },
  { n: '05', icon: '🎯', title: 'APPS EXCLUSIVOS', sub: 'Catálogo com os melhores players do mercado.' },
  { n: '06', icon: '♾️', title: 'SEM FIDELIDADE', sub: 'Cancela quando quiser. Sem contrato, sem multa.' },
];

export default function LandingPage({ onStartChat, onAdminClick, supportWhatsapp, attendantName, attendantImage }: Props) {
  const [banners, setBanners]   = useState<Banner[]>([]);
  const [freeApps, setFreeApps] = useState<LandingApp[]>([]);
  const [paidApps, setPaidApps] = useState<LandingApp[]>([]);
  const [top10, setTop10]       = useState<LandingApp[]>([]);
  const [allApps, setAllApps]   = useState<LandingApp[]>([]);

  const [heroBanner, setHeroBanner] = useState(0);
  const [showModal, setShowModal]   = useState(false);
  const [nameInput, setNameInput]   = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [navOpen, setNavOpen]       = useState(false);
  const [scrolled, setScrolled]     = useState(false);

  const heroRef  = useRef<HTMLDivElement>(null);
  const freeRef  = useRef<HTMLDivElement>(null);
  const paidRef  = useRef<HTMLDivElement>(null);
  const top10Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/landing-data').then(r => r.json()).then(d => {
      if (d.banners?.length) setBanners(d.banners);
      const apps: LandingApp[] = d.apps || [];
      setAllApps(apps);
      setFreeApps(apps.filter(a => a.landing_category === 'free'));
      setPaidApps(apps.filter(a => a.landing_category === 'paid'));
      setTop10(apps.filter(a => a.landing_rank != null).sort((a, b) => (a.landing_rank! - b.landing_rank!)).slice(0, 10));
    }).catch(() => {});
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setHeroBanner(c => (c + 1) % Math.max(banners.length || 1, 3)), 5500);
    return () => clearInterval(t);
  }, [banners.length]);

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setNavOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = nameInput.trim(); const p = onlyDigits(phoneInput);
    if (!n || p.length < 10) return;
    onStartChat(n, p); setShowModal(false);
  };

  const displayBanners: Banner[] = banners.length > 0 ? banners : [
    { id: 1, title: 'O MELHOR IPTV\nDO BRASIL', subtitle: 'Apps exclusivos com ativação instantânea. Suporte 24h com IA.', image_url: '', cta_label: 'INICIAR AGORA', badge: '● SCENE 01 · HERO' },
    { id: 2, title: 'SUPORTE 24H\nCOM IA', subtitle: 'Atendimento inteligente e humanizado. Resolve em minutos.', image_url: '', cta_label: 'FALAR AGORA', badge: '● SCENE 02 · SUPPORT' },
    { id: 3, title: 'TOP 10 APPS\nMAIS VENDIDOS', subtitle: 'Os apps mais populares do mercado com ativação imediata.', image_url: '', cta_label: 'VER APPS', badge: '● SCENE 03 · TOP 10' },
  ];
  const banner = displayBanners[heroBanner % displayBanners.length];

  // ─── GRADIENTS ─────────────────────────────────────────────────────────────
  const heroGrads = [
    `linear-gradient(135deg, #0a0010 0%, #1a0030 50%, #0a0010 100%)`,
    `linear-gradient(135deg, #0a0000 0%, #200010 50%, #0a0000 100%)`,
    `linear-gradient(135deg, #000a10 0%, #001a30 50%, #000a10 100%)`,
  ];

  return (
    <div style={{ background: C.dark, color: '#fff', fontFamily: "'Inter', ui-sans-serif, sans-serif", overflowX: 'hidden' }}>

      {/* ══════════════════════════════════════════════════════
          TICKER TOP
      ══════════════════════════════════════════════════════ */}
      <div style={{ background: C.purple, overflow: 'hidden', height: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', height: '100%', animation: 'ticker 25s linear infinite', width: 'max-content' }}>
          {[...TICKER, ...TICKER, ...TICKER].map((t, i) => (
            <span key={i} style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.2em', color: '#fff', padding: '0 20px', whiteSpace: 'nowrap' }}>
              {t} <span style={{ opacity: 0.5, marginLeft: 4 }}>●</span>
            </span>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          NAVBAR
      ══════════════════════════════════════════════════════ */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: scrolled ? 'rgba(8,8,8,0.98)' : 'rgba(8,8,8,0.85)',
        backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 64, transition: 'background 0.3s',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => scrollTo(heroRef)}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: C.red, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 900, color: '#fff', letterSpacing: '-1px' }}>SF</span>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-0.5px', lineHeight: 1 }}>
              <span style={{ color: C.red }}>START</span><span style={{ color: '#fff' }}>FLIX</span>
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.15em', fontWeight: 700 }}>IPTV PREMIUM</div>
          </div>
        </div>

        {/* Links desktop */}
        <div style={{ display: 'flex', gap: 28, alignItems: 'center' }} className="hidden-mobile">
          {[
            { label: 'Apps Grátis', ref: freeRef },
            { label: 'Ativação Imediata', ref: paidRef },
            { label: 'Top 10', ref: top10Ref },
          ].map(l => (
            <button key={l.label} onClick={() => scrollTo(l.ref)}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', cursor: 'pointer', textTransform: 'uppercase' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}>
              {l.label}
            </button>
          ))}
        </div>

        {/* Right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {supportWhatsapp && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 6px #22c55e' }}></span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Servidores Online</span>
            </div>
          )}
          <button onClick={() => setShowModal(true)}
            style={{ background: C.red, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase' }}>
            <span>🎬</span> Iniciar Agora
          </button>
          <button onClick={() => setNavOpen(v => !v)} style={{ display: 'none', background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }} className="show-mobile">
            <Menu size={20} />
          </button>
        </div>
      </nav>

      {/* Menu mobile */}
      <AnimatePresence>
        {navOpen && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            style={{ position: 'sticky', top: 64, zIndex: 49, background: 'rgba(8,8,8,0.99)', borderBottom: `1px solid ${C.border}`, padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[{ l: 'Apps Grátis 🎁', r: freeRef }, { l: 'Ativação Imediata ⚡', r: paidRef }, { l: 'Top 10 👑', r: top10Ref }].map(i => (
              <button key={i.l} onClick={() => scrollTo(i.r)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 700, textAlign: 'left', cursor: 'pointer', letterSpacing: '0.05em' }}>{i.l}</button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════
          HERO — BANNER CARROSSEL CINEMATOGRÁFICO
      ══════════════════════════════════════════════════════ */}
      <div ref={heroRef} style={{ position: 'relative', minHeight: 'clamp(500px, 80vh, 800px)', overflow: 'hidden' }}>
        {/* BG */}
        <AnimatePresence mode="wait">
          <motion.div key={heroBanner} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1 }}
            style={{
              position: 'absolute', inset: 0,
              background: banner.image_url ? `url(${banner.image_url}) center/cover no-repeat` : heroGrads[heroBanner % heroGrads.length],
            }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(8,8,8,0.97) 0%, rgba(8,8,8,0.75) 55%, rgba(8,8,8,0.3) 100%)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(8,8,8,1) 0%, transparent 60%)' }} />
          </motion.div>
        </AnimatePresence>

        {/* Capas dos apps decorativas (como os posters do cinetop) */}
        {allApps.slice(0, 6).length > 0 && (
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '55%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '40px 40px 80px', overflow: 'hidden', pointerEvents: 'none' }}>
            {allApps.slice(0, 5).map((app, i) => (
              <motion.div key={app.id} initial={{ opacity: 0, y: 20 + i * 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.1, duration: 0.6 }}
                style={{
                  width: 110, flexShrink: 0,
                  transform: `rotate(${(i - 2) * 3}deg) translateY(${Math.abs(i - 2) * 12}px)`,
                  borderRadius: 10, overflow: 'hidden',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  height: 160,
                }}>
                {app.app_image_url
                  ? <img src={app.app_image_url} alt={app.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ width: '100%', height: '100%', background: `linear-gradient(135deg, ${C.card2}, #222)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 900, color: C.red }}>{app.name[0]}</div>
                }
              </motion.div>
            ))}
          </div>
        )}

        {/* Conteúdo do hero */}
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 'clamp(500px, 80vh, 800px)', padding: 'clamp(32px,6vw,80px)' }}>
          {/* Badge de scene */}
          <AnimatePresence mode="wait">
            <motion.div key={`badge-${heroBanner}`} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: `1px solid rgba(124,58,237,0.5)`, borderRadius: 20, padding: '4px 14px', fontSize: 9, fontWeight: 800, letterSpacing: '0.25em', color: C.purpleL, marginBottom: 20, textTransform: 'uppercase' }}>
                {banner.badge || '● SCENE 01 · HERO'}
              </span>
            </motion.div>
          </AnimatePresence>

          {/* Título enorme */}
          <AnimatePresence mode="wait">
            <motion.div key={`title-${heroBanner}`} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.5 }}>
              <h1 style={{ fontSize: 'clamp(42px, 7vw, 90px)', fontWeight: 900, lineHeight: 0.95, letterSpacing: '-2px', marginBottom: 20, maxWidth: 700, textTransform: 'uppercase' }}>
                {banner.title.split('\n').map((line, i) => (
                  <span key={i} style={{ display: 'block', color: i % 2 === 0 ? '#fff' : C.purpleL }}>
                    {line}
                  </span>
                ))}
              </h1>
              <p style={{ fontSize: 'clamp(13px,1.4vw,16px)', color: 'rgba(255,255,255,0.55)', maxWidth: 440, lineHeight: 1.6, marginBottom: 32 }}>
                {banner.subtitle}
              </p>

              {/* Stats row */}
              <div style={{ display: 'flex', gap: 'clamp(16px,3vw,40px)', marginBottom: 36, flexWrap: 'wrap' }}>
                {[
                  { val: allApps.length > 0 ? `${allApps.length}+` : '50+', label: 'Apps Disponíveis' },
                  { val: '24H', label: 'Suporte Online' },
                  { val: '100%', label: 'Seguro & PIX' },
                ].map(s => (
                  <div key={s.val}>
                    <div style={{ fontSize: 'clamp(24px,3vw,38px)', fontWeight: 900, color: C.purpleL, lineHeight: 1, letterSpacing: '-1px' }}>{s.val}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* CTAs */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button onClick={() => setShowModal(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.purple, color: '#fff', border: 'none', borderRadius: 8, padding: 'clamp(12px,1.5vw,16px) clamp(20px,2.5vw,32px)', fontSize: 13, fontWeight: 900, letterSpacing: '0.08em', cursor: 'pointer', textTransform: 'uppercase', boxShadow: `0 8px 32px rgba(124,58,237,0.5)` }}>
                  <span>🎬</span> {banner.cta_label || 'INICIAR AGORA'} <ChevronRight size={16} />
                </button>
                {supportWhatsapp && (
                  <a href={`https://wa.me/${supportWhatsapp}`} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.07)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: 'clamp(12px,1.5vw,16px) clamp(20px,2.5vw,28px)', fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', cursor: 'pointer', textTransform: 'uppercase', textDecoration: 'none' }}>
                    <Phone size={14} /> WhatsApp
                  </a>
                )}
              </div>

              {/* Bullets */}
              <div style={{ display: 'flex', gap: 20, marginTop: 20, flexWrap: 'wrap' }}>
                {['Liberação imediata', 'Sem contrato', 'Suporte 24h'].map(b => (
                  <span key={b} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                    <Check size={11} style={{ color: '#22c55e' }} /> {b}
                  </span>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Dots do carrossel */}
        <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6, zIndex: 3 }}>
          {displayBanners.map((_, i) => (
            <button key={i} onClick={() => setHeroBanner(i)}
              style={{ width: i === heroBanner ? 24 : 6, height: 6, borderRadius: 3, border: 'none', cursor: 'pointer', transition: 'all 0.3s', background: i === heroBanner ? C.purple : 'rgba(255,255,255,0.25)' }} />
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          TICKER DE APPS PARCEIROS
      ══════════════════════════════════════════════════════ */}
      {allApps.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, background: C.card, padding: '14px 0', overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', animation: 'ticker 35s linear infinite', width: 'max-content' }}>
            {[...allApps, ...allApps, ...allApps].map((app, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, flexShrink: 0 }}>
                {app.app_image_url
                  ? <img src={app.app_image_url} alt={app.name} style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'contain' }} />
                  : <div style={{ width: 24, height: 24, borderRadius: 4, background: C.red, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: '#fff' }}>{app.name[0]}</div>
                }
                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap', letterSpacing: '0.05em' }}>{app.name.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          SCENE 01 · APPS GRATUITOS
      ══════════════════════════════════════════════════════ */}
      {freeApps.length > 0 && (
        <section ref={freeRef} style={{ padding: 'clamp(48px,6vw,80px) clamp(20px,4vw,60px)' }}>
          <SceneBadge text="SCENE 01 · FREE APPS" />
          <SectionTitle white="APLICATIVOS" colored="GRATUITOS" accentColor="#22c55e" />
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', maxWidth: 480, marginBottom: 40, lineHeight: 1.6 }}>
            Ative agora mesmo sem pagar nada. Compatíveis com todos os dispositivos.
          </p>
          <div style={{ overflowX: 'auto', paddingBottom: 16 }} className="no-scrollbar">
            <div style={{ display: 'flex', gap: 16, width: 'max-content' }}>
              {freeApps.map((app, i) => (
                <AppCard key={app.id} app={app} index={i} badge="GRÁTIS" badgeColor="#22c55e" onCTA={() => setShowModal(true)} ctaLabel="Ativar grátis" ctaColor="#22c55e" />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════
          SCENE 02 · ATIVAÇÃO IMEDIATA
      ══════════════════════════════════════════════════════ */}
      {paidApps.length > 0 && (
        <section ref={paidRef} style={{ padding: 'clamp(48px,6vw,80px) clamp(20px,4vw,60px)', background: 'rgba(20,14,30,0.6)' }}>
          <SceneBadge text="SCENE 02 · INSTANT ACTIVATION" />
          <SectionTitle white="ATIVAÇÃO" colored="IMEDIATA" accentColor={C.purpleL} />
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', maxWidth: 480, marginBottom: 40, lineHeight: 1.6 }}>
            Pague e use na hora. Sem esperar, sem complicação.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
            {paidApps.map((app, i) => (
              <AppCard key={app.id} app={app} index={i} badge="⚡ IMEDIATO" badgeColor={C.purpleL} onCTA={() => setShowModal(true)} ctaLabel="Ativar agora" ctaColor={C.purple} showPrice />
            ))}
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════
          SCENE 03 · TOP 10
      ══════════════════════════════════════════════════════ */}
      {top10.length > 0 && (
        <section ref={top10Ref} style={{ padding: 'clamp(48px,6vw,80px) clamp(20px,4vw,60px)' }}>
          <SceneBadge text="SCENE 03 · TOP 10" />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 8 }}>
            <span style={{ fontSize: 'clamp(32px,5vw,64px)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-2px', color: '#fff' }}>TOP</span>
            <span style={{ fontSize: 'clamp(32px,5vw,64px)', fontWeight: 900, letterSpacing: '-2px', color: C.purpleL }}>10</span>
            <span style={{ fontSize: 'clamp(14px,2vw,20px)', fontWeight: 900, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em' }}>Mais Vendidos</span>
          </div>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', maxWidth: 480, marginBottom: 40, lineHeight: 1.6 }}>
            Os apps mais escolhidos pelos nossos clientes este mês.
          </p>
          <div style={{ overflowX: 'auto', paddingBottom: 16 }} className="no-scrollbar">
            <div style={{ display: 'flex', gap: 8, width: 'max-content' }}>
              {top10.map((app, i) => (
                <motion.div key={app.id} initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
                  style={{ position: 'relative', width: 130, flexShrink: 0, cursor: 'pointer' }}
                  onClick={() => setShowModal(true)}>
                  {/* Número grande */}
                  <div style={{
                    position: 'absolute', left: -12, bottom: 52, zIndex: 1,
                    fontSize: 76, fontWeight: 900, lineHeight: 1,
                    color: C.dark,
                    WebkitTextStroke: `2.5px ${i < 3 ? C.purpleL : 'rgba(255,255,255,0.15)'}`,
                    userSelect: 'none',
                  }}>
                    {app.landing_rank}
                  </div>
                  {/* Card */}
                  <div style={{ marginLeft: 16, borderRadius: 8, overflow: 'hidden', height: 180, border: `1px solid ${C.border}`, position: 'relative' }}>
                    {app.app_image_url
                      ? <img src={app.app_image_url} alt={app.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: '100%', height: '100%', background: `linear-gradient(135deg, #1a0a2a, #0a0018)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, fontWeight: 900, color: C.purpleL }}>{app.name[0]}</div>
                    }
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 60%)' }} />
                    <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8 }}>
                      <p style={{ fontSize: 9, fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{app.name}</p>
                    </div>
                    {i < 3 && (
                      <div style={{ position: 'absolute', top: 8, right: 8, fontSize: 16 }}>{['🥇','🥈','🥉'][i]}</div>
                    )}
                  </div>
                  {/* CTA */}
                  <button onClick={() => setShowModal(true)}
                    style={{ marginTop: 8, marginLeft: 16, width: 'calc(100% - 16px)', padding: '7px 0', borderRadius: 6, border: 'none', background: C.purple, color: '#fff', fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Play size={8} fill="white" /> Quero esse
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════
          SCENE 04 · POR QUE STARTFLIX — Cards numerados
      ══════════════════════════════════════════════════════ */}
      <section style={{ padding: 'clamp(48px,6vw,80px) clamp(20px,4vw,60px)', background: 'rgba(20,14,30,0.4)' }}>
        <SceneBadge text="SCENE 04 · WHY STARTFLIX" />
        <SectionTitle white="POR QUE ESCOLHER A" colored="STARTFLIX?" accentColor={C.purpleL} />
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', maxWidth: 540, marginBottom: 48, lineHeight: 1.6 }}>
          Seis razões pelas quais milhares de pessoas escolhem a StartFlix todos os dias.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {FEATURES.map((f, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.07 }}
              style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '24px 20px', position: 'relative', overflow: 'hidden' }}>
              {/* Número no canto */}
              <div style={{ position: 'absolute', top: 12, right: 16, fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,0.1)', letterSpacing: '0.1em' }}>/ {f.n}</div>
              {/* Ícone */}
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 16 }}>{f.icon}</div>
              <h3 style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8, color: '#fff' }}>{f.title}</h3>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>{f.sub}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          FINAL SCENE — CTA
      ══════════════════════════════════════════════════════ */}
      <section style={{ padding: 0, overflow: 'hidden' }}>
        {/* Faixa listrada como o cinetop */}
        <div style={{ height: 12, background: `repeating-linear-gradient(45deg, ${C.purple} 0px, ${C.purple} 12px, transparent 12px, transparent 24px)`, opacity: 0.6 }} />
        <div style={{ padding: 'clamp(48px,6vw,80px) clamp(20px,4vw,60px)', background: `linear-gradient(135deg, #0d0020 0%, #1a0a3a 50%, #0d0020 100%)`, textAlign: 'center' }}>
          <span style={{ display: 'inline-block', border: `1px solid rgba(168,85,247,0.4)`, borderRadius: 20, padding: '4px 14px', fontSize: 9, fontWeight: 800, letterSpacing: '0.3em', color: C.purpleL, marginBottom: 24, textTransform: 'uppercase' }}>
            ── FINAL SCENE · ROLL CREDITS ──
          </span>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 style={{ fontSize: 'clamp(32px,5vw,64px)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-2px', lineHeight: 0.95, marginBottom: 16 }}>
              <span style={{ color: '#fff' }}>PRONTO PARA </span>
              <span style={{ color: C.purpleL }}>COMEÇAR?</span>
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 40, maxWidth: 400, margin: '0 auto 40px' }}>
              Fale agora com nosso suporte e ative seu app em minutos.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setShowModal(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.purple, color: '#fff', border: 'none', borderRadius: 8, padding: '16px 36px', fontSize: 14, fontWeight: 900, letterSpacing: '0.08em', cursor: 'pointer', textTransform: 'uppercase', boxShadow: `0 8px 32px rgba(124,58,237,0.5)` }}>
                <MessageCircle size={18} /> INICIAR ATENDIMENTO →
              </button>
              {supportWhatsapp && (
                <a href={`https://wa.me/${supportWhatsapp}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#25D366', color: '#fff', borderRadius: 8, padding: '16px 28px', fontSize: 14, fontWeight: 900, letterSpacing: '0.05em', cursor: 'pointer', textTransform: 'uppercase', textDecoration: 'none', boxShadow: '0 8px 32px rgba(37,211,102,0.35)' }}>
                  <MessageCircle size={18} /> WHATSAPP
                </a>
              )}
            </div>
          </motion.div>
        </div>
        <div style={{ height: 12, background: `repeating-linear-gradient(45deg, ${C.purple} 0px, ${C.purple} 12px, transparent 12px, transparent 24px)`, opacity: 0.6 }} />
      </section>

      {/* FOOTER */}
      <footer style={{ background: '#050505', padding: '20px clamp(20px,4vw,60px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 4, background: C.red, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 8, fontWeight: 900, color: '#fff' }}>SF</span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.05em' }}>
            <span style={{ color: C.red }}>START</span><span style={{ color: '#fff' }}>FLIX</span>
          </span>
        </div>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em' }}>© 2026 STARTPAINEL. TODOS OS DIREITOS RESERVADOS.</span>
        <button onClick={onAdminClick} style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'rgba(255,255,255,0.15)', cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          <Lock size={9} /> Admin
        </button>
      </footer>

      {/* ══════════════════════════════════════════════════════
          WHATSAPP FLOAT
      ══════════════════════════════════════════════════════ */}
      {supportWhatsapp && (
        <a href={`https://wa.me/${supportWhatsapp}`} target="_blank" rel="noopener noreferrer"
          style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 99, display: 'flex', alignItems: 'center', gap: 8, background: '#25D366', color: '#fff', borderRadius: '50px', padding: '12px 20px', fontSize: 13, fontWeight: 900, textDecoration: 'none', boxShadow: '0 8px 28px rgba(37,211,102,0.5)', letterSpacing: '0.05em', transition: 'transform 0.2s' }}
          onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.05)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
          <MessageCircle size={20} fill="white" />
          <span className="hidden-mobile">WhatsApp</span>
        </a>
      )}

      {/* ══════════════════════════════════════════════════════
          MODAL DE ENTRADA
      ══════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(12px)' }}>
            <motion.div initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 20 }}
              style={{ width: '100%', maxWidth: 380, borderRadius: 16, overflow: 'hidden', background: '#0e0e0e', border: `1px solid rgba(124,58,237,0.3)`, boxShadow: `0 24px 60px rgba(124,58,237,0.3)` }}>
              {/* Botão fechar */}
              <button onClick={() => setShowModal(false)}
                style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}>
                <X size={14} />
              </button>

              {/* Header do modal */}
              <div style={{ padding: '32px 24px 24px', textAlign: 'center', background: `linear-gradient(135deg, #0d0020, #1a0a3a)`, borderBottom: `1px solid ${C.border}`, position: 'relative' }}>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img src={attendantImage} alt={attendantName} style={{ width: 72, height: 72, borderRadius: '50%', border: `3px solid ${C.purple}`, objectFit: 'cover', display: 'block', margin: '0 auto' }} />
                  <span style={{ position: 'absolute', bottom: 2, right: 2, width: 16, height: 16, borderRadius: '50%', background: '#22c55e', border: '2px solid #0e0e0e', display: 'block' }}></span>
                </div>
                <h3 style={{ marginTop: 14, fontSize: 16, fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{attendantName}</h3>
                <p style={{ fontSize: 9, color: C.purpleL, fontWeight: 800, letterSpacing: '0.2em', marginTop: 4, textTransform: 'uppercase' }}>● ONLINE AGORA · RESPONDE RÁPIDO</p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} style={{ padding: '24px 24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ textAlign: 'center', marginBottom: 4 }}>
                  <p style={{ fontSize: 14, fontWeight: 900, color: '#fff' }}>Bem-vindo ao StartFlix 👋</p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>Preencha para iniciar o atendimento.</p>
                </div>
                {[
                  { label: 'Seu nome', value: nameInput, set: setNameInput, placeholder: 'Como você se chama?', type: 'text' },
                  { label: 'Seu WhatsApp', value: phoneInput, set: setPhoneInput, placeholder: 'Ex.: 88 99999-0000', type: 'tel' },
                ].map(f => (
                  <div key={f.label}>
                    <label style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.2em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>{f.label}</label>
                    <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} type={f.type}
                      autoFocus={f.label === 'Seu nome'}
                      style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.05)', border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 8, fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                ))}
                <button type="submit"
                  disabled={!nameInput.trim() || onlyDigits(phoneInput).length < 10}
                  style={{ width: '100%', padding: '14px 0', borderRadius: 8, border: 'none', background: C.purple, color: '#fff', fontSize: 13, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: (!nameInput.trim() || onlyDigits(phoneInput).length < 10) ? 0.4 : 1, transition: 'opacity 0.2s', boxShadow: `0 4px 20px rgba(124,58,237,0.4)` }}>
                  <MessageCircle size={16} /> INICIAR ATENDIMENTO
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════
          CSS GLOBAL
      ══════════════════════════════════════════════════════ */}
      <style>{`
        @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-33.333%); } }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @media (max-width: 640px) {
          .hidden-mobile { display: none !important; }
          .show-mobile   { display: flex !important; }
        }
        @media (min-width: 641px) {
          .show-mobile { display: none !important; }
        }
      `}</style>
    </div>
  );
}

// ─── SUB-COMPONENTES ─────────────────────────────────────────────────────────

function SceneBadge({ text }: { text: string }) {
  return (
    <motion.div initial={{ opacity: 0, x: -12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid rgba(124,58,237,0.4)', borderRadius: 20, padding: '4px 14px', fontSize: 9, fontWeight: 800, letterSpacing: '0.25em', color: '#A855F7', marginBottom: 16, textTransform: 'uppercase' }}>
        ● {text}
      </span>
    </motion.div>
  );
}

function SectionTitle({ white, colored, accentColor }: { white: string; colored: string; accentColor: string }) {
  return (
    <h2 style={{ fontSize: 'clamp(32px,5vw,64px)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-2px', lineHeight: 0.95, marginBottom: 16 }}>
      <span style={{ color: '#fff' }}>{white} </span>
      <span style={{ color: accentColor }}>{colored}</span>
    </h2>
  );
}

function AppCard({ app, index, badge, badgeColor, onCTA, ctaLabel, ctaColor, showPrice }: {
  app: LandingApp; index: number; badge: string; badgeColor: string;
  onCTA: () => void; ctaLabel: string; ctaColor: string; showPrice?: boolean;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.05 }}
      style={{ width: 160, flexShrink: 0, borderRadius: 10, overflow: 'hidden', background: '#111', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer' }}
      onClick={onCTA}
      whileHover={{ scale: 1.04, y: -4 } as any}>
      <div style={{ position: 'relative', height: 120 }}>
        {app.app_image_url
          ? <img src={app.app_image_url} alt={app.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #1a0a2a, #0a0018)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 900, color: '#A855F7' }}>{app.name[0]}</div>
        }
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)' }} />
        <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 8, fontWeight: 900, background: badgeColor, color: '#fff', borderRadius: 4, padding: '2px 6px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{badge}</span>
      </div>
      <div style={{ padding: 10 }}>
        <p style={{ fontSize: 10, fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{app.name}</p>
        {showPrice && app.landing_price && (
          <p style={{ fontSize: 13, fontWeight: 900, color: badgeColor, marginBottom: 6 }}>{app.landing_price}</p>
        )}
        {app.description && <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', lineHeight: 1.4, marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as any}>{app.description}</p>}
        <button onClick={e => { e.stopPropagation(); onCTA(); }}
          style={{ width: '100%', padding: '7px 0', borderRadius: 5, border: 'none', background: ctaColor, color: '#fff', fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
          {ctaLabel} →
        </button>
      </div>
    </motion.div>
  );
}
