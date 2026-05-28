import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, Lock, X, Play, Phone, Menu, Check, ChevronRight, Star, Tv, Film, TrendingUp, Zap, Gift, Crown } from 'lucide-react';

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
interface TMDBItem {
  id: number;
  title?: string; name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string; first_air_date?: string;
  media_type?: string;
  overview: string;
}

// ─── CONSTANTES ──────────────────────────────────────────────────────────────
const C = { red: '#E50914', purple: '#7C3AED', purpleL: '#A855F7', dark: '#080808', card: '#111111', card2: '#161616', gold: '#F5A623', border: 'rgba(255,255,255,0.07)' };
const TMDB_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJkZDQ0NTBjMDFjNDY1OWYxOGIyNDYyNWU5YTUwNDY5NSIsIm5iZiI6MTc3OTk5NTczMy41NDEsInN1YiI6IjZhMTg5NDU1M2JkNDljZmUwMzE1NzQ2MyIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.ad11yNH6CrKADdAMBhC4y6uoDvzsnaIU6yHeIJmMQkk';
const TMDB_IMG  = 'https://image.tmdb.org/t/p/';
const TMDB_HEADERS = { Authorization: `Bearer ${TMDB_TOKEN}`, accept: 'application/json' };
const TICKER = ['STARTFLIX', 'IPTV PREMIUM', 'ATIVAÇÃO INSTANTÂNEA', 'SUPORTE 24H', 'APPS PARCEIROS', 'TOP 10 MAIS VENDIDOS', '100K+ TÍTULOS', '4K HDR', 'MULTI-DISPOSITIVO'];
const FEATURES = [
  { n: '01', icon: '⚡', title: 'ATIVAÇÃO INSTANTÂNEA', sub: 'Em minutos tudo funcionando. Sem burocracia, sem espera.' },
  { n: '02', icon: '📱', title: 'MULTI-DISPOSITIVO',    sub: 'Smart TV, Android, iPhone, PC — compatível com tudo.' },
  { n: '03', icon: '🤖', title: 'SUPORTE IA + HUMANO',  sub: 'Atendimento inteligente 24h com IA e equipe especializada.' },
  { n: '04', icon: '🔒', title: '100% SEGURO',           sub: 'Pagamento via PIX. Sem cartão de crédito necessário.' },
  { n: '05', icon: '🎯', title: 'APPS EXCLUSIVOS',       sub: 'Catálogo com os melhores players do mercado.' },
  { n: '06', icon: '♾️', title: 'SEM FIDELIDADE',        sub: 'Cancela quando quiser. Sem contrato, sem multa.' },
];
function onlyDigits(s: string) { return (s || '').replace(/\D/g, ''); }
function tmdbTitle(i: TMDBItem) { return i.title || i.name || ''; }
function tmdbYear(i: TMDBItem) { const d = i.release_date || i.first_air_date || ''; return d.slice(0, 4); }
function stars(v: number) { return (v / 2).toFixed(1); }

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function LandingPage({ onStartChat, onAdminClick, supportWhatsapp, attendantName, attendantImage }: Props) {
  // Landing data
  const [banners, setBanners]   = useState<Banner[]>([]);
  const [freeApps, setFreeApps] = useState<LandingApp[]>([]);
  const [paidApps, setPaidApps] = useState<LandingApp[]>([]);
  const [top10, setTop10]       = useState<LandingApp[]>([]);
  const [allApps, setAllApps]   = useState<LandingApp[]>([]);
  // TMDB
  const [trending, setTrending] = useState<TMDBItem[]>([]);
  const [popular,  setPopular]  = useState<TMDBItem[]>([]);
  const [latest,   setLatest]   = useState<TMDBItem[]>([]);
  const [series,   setSeries]   = useState<TMDBItem[]>([]);
  const [catalogTab, setCatalogTab] = useState<'hot' | 'new' | 'series'>('hot');
  // UI state
  const [heroBanner, setHeroBanner] = useState(0);
  const [showModal, setShowModal]   = useState(false);
  const [nameInput, setNameInput]   = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [navOpen, setNavOpen]       = useState(false);
  const [scrolled, setScrolled]     = useState(false);

  const heroRef    = useRef<HTMLDivElement>(null);
  const appsRef    = useRef<HTMLDivElement>(null);
  const catalogRef = useRef<HTMLDivElement>(null);
  const top10Ref   = useRef<HTMLDivElement>(null);

  // Fetch landing data + TMDB
  useEffect(() => {
    fetch('/api/landing-data').then(r => r.json()).then(d => {
      if (d.banners?.length) setBanners(d.banners);
      const apps: LandingApp[] = d.apps || [];
      setAllApps(apps);
      setFreeApps(apps.filter(a => a.landing_category === 'free'));
      setPaidApps(apps.filter(a => a.landing_category === 'paid'));
      setTop10(apps.filter(a => a.landing_rank != null).sort((a, b) => a.landing_rank! - b.landing_rank!).slice(0, 10));
    }).catch(() => {});

    const fetchTMDB = (url: string) =>
      fetch(url, { headers: TMDB_HEADERS }).then(r => r.json()).then(d => d.results || []).catch(() => []);

    Promise.all([
      fetchTMDB('https://api.themoviedb.org/3/trending/all/week?language=pt-BR'),
      fetchTMDB('https://api.themoviedb.org/3/movie/popular?language=pt-BR&page=1'),
      fetchTMDB('https://api.themoviedb.org/3/movie/now_playing?language=pt-BR&page=1'),
      fetchTMDB('https://api.themoviedb.org/3/tv/popular?language=pt-BR&page=1'),
    ]).then(([tr, pop, lat, ser]) => {
      setTrending(tr.filter((i: TMDBItem) => i.backdrop_path));
      setPopular(pop.filter((i: TMDBItem) => i.poster_path));
      setLatest(lat.filter((i: TMDBItem) => i.poster_path));
      setSeries(ser.filter((i: TMDBItem) => i.poster_path));
    });

    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Auto-avança hero
  useEffect(() => {
    const total = trending.length || 3;
    const t = setInterval(() => setHeroBanner(c => (c + 1) % total), 6000);
    return () => clearInterval(t);
  }, [trending.length]);

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => { ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setNavOpen(false); };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = nameInput.trim(); const p = onlyDigits(phoneInput);
    if (!n || p.length < 10) return;
    onStartChat(n, p); setShowModal(false);
  };

  const heroItem = trending[heroBanner];
  const catalogItems = catalogTab === 'hot' ? popular : catalogTab === 'new' ? latest : series;

  return (
    <div style={{ background: C.dark, color: '#fff', fontFamily: "'Inter', ui-sans-serif, sans-serif", overflowX: 'hidden' }}>

      {/* ━━━ TICKER TOP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div style={{ background: C.purple, overflow: 'hidden', height: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', height: '100%', animation: 'ticker 28s linear infinite', width: 'max-content' }}>
          {[...TICKER, ...TICKER, ...TICKER].map((t, i) => (
            <span key={i} style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.2em', color: '#fff', padding: '0 20px', whiteSpace: 'nowrap' }}>
              {t} <span style={{ opacity: 0.4 }}>●</span>
            </span>
          ))}
        </div>
      </div>

      {/* ━━━ NAVBAR ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: scrolled ? 'rgba(8,8,8,0.98)' : 'transparent', backdropFilter: 'blur(20px)', borderBottom: scrolled ? `1px solid ${C.border}` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 clamp(16px,4vw,48px)', height: 64, transition: 'all 0.4s' }}>
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

        <div className="nav-links" style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
          {[{ l: 'Catálogo', r: catalogRef }, { l: 'Apps Disponíveis', r: appsRef }, { l: 'Top 10', r: top10Ref }].map(item => (
            <button key={item.l} onClick={() => scrollTo(item.r)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', cursor: 'pointer', textTransform: 'uppercase', padding: 0, transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#fff')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}>
              {item.l}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {supportWhatsapp && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} className="nav-online">
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 8px #22c55e', animation: 'pulse 2s infinite' }}></span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Online</span>
            </div>
          )}
          <button onClick={() => setShowModal(true)} style={{ background: C.purple, color: '#fff', border: 'none', borderRadius: 6, padding: '9px 18px', fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase', boxShadow: `0 4px 20px rgba(124,58,237,0.4)` }}>
            🎬 Iniciar Agora
          </button>
          <button onClick={() => setNavOpen(v => !v)} className="nav-burger" style={{ display: 'none', background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
            <Menu size={20} />
          </button>
        </div>
      </nav>

      {/* Menu mobile */}
      <AnimatePresence>
        {navOpen && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ position: 'sticky', top: 64, zIndex: 49, background: 'rgba(8,8,8,0.99)', borderBottom: `1px solid ${C.border}`, padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[{ l: '🎬 Catálogo', r: catalogRef }, { l: '📱 Apps Disponíveis', r: appsRef }, { l: '👑 Top 10', r: top10Ref }].map(i => (
              <button key={i.l} onClick={() => scrollTo(i.r)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 700, textAlign: 'left', cursor: 'pointer' }}>{i.l}</button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ━━━ HERO — BACKDROP TMDB ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div ref={heroRef} style={{ position: 'relative', minHeight: 'clamp(560px, 85vh, 860px)', overflow: 'hidden' }}>
        {/* Backdrop com crossfade */}
        <AnimatePresence mode="wait">
          <motion.div key={heroBanner} initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.2 }}
            style={{ position: 'absolute', inset: 0, backgroundImage: heroItem?.backdrop_path ? `url(${TMDB_IMG}w1280${heroItem.backdrop_path})` : 'linear-gradient(135deg,#0d0020,#1a0a3a)', backgroundSize: 'cover', backgroundPosition: 'center top' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(8,8,8,0.97) 0%, rgba(8,8,8,0.70) 50%, rgba(8,8,8,0.20) 100%)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(8,8,8,1) 0%, transparent 55%)' }} />
          </motion.div>
        </AnimatePresence>

        {/* Coluna de posters flutuantes (lado direito) */}
        <div className="hero-posters" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '45%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 'clamp(16px,4vw,60px)', paddingBottom: 60, overflow: 'hidden', pointerEvents: 'none' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {trending.slice(0, 5).map((item, i) => (
              <motion.div key={item.id} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.12, duration: 0.7 }}
                style={{ width: 'clamp(75px,8vw,105px)', flexShrink: 0, borderRadius: 10, overflow: 'hidden', boxShadow: `0 20px 60px rgba(0,0,0,0.9)`, border: '1px solid rgba(255,255,255,0.1)', transform: `rotate(${(i - 2) * 3.5}deg) translateY(${Math.abs(i - 2) * 14}px)`, height: 'clamp(110px,12vw,155px)' }}>
                {item.poster_path
                  ? <img src={`${TMDB_IMG}w342${item.poster_path}`} alt={tmdbTitle(item)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ width: '100%', height: '100%', background: '#1a0a2a' }} />
                }
              </motion.div>
            ))}
          </div>
        </div>

        {/* Conteúdo hero */}
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: 'clamp(560px, 85vh, 860px)', padding: 'clamp(32px,5vw,72px)', paddingBottom: 'clamp(48px,6vw,80px)' }}>
          <AnimatePresence mode="wait">
            <motion.div key={heroBanner} initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.6 }}>
              {/* Badge de scene */}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid rgba(124,58,237,0.5)', borderRadius: 20, padding: '4px 14px', fontSize: 9, fontWeight: 800, letterSpacing: '0.25em', color: C.purpleL, marginBottom: 20, textTransform: 'uppercase' }}>
                {heroItem ? `● ${heroItem.media_type === 'tv' ? 'SÉRIE' : 'FILME'} EM DESTAQUE` : '● SCENE 01 · HERO'}
              </span>

              {/* Título */}
              <h1 style={{ fontSize: 'clamp(36px,6.5vw,84px)', fontWeight: 900, lineHeight: 0.93, letterSpacing: '-2px', marginBottom: 16, maxWidth: 700, textTransform: 'uppercase' }}>
                {heroItem ? (
                  <>
                    {tmdbTitle(heroItem).split(' ').map((word, wi) => (
                      <span key={wi} style={{ color: wi % 3 === 2 ? C.purpleL : '#fff' }}>{word} </span>
                    ))}
                  </>
                ) : (
                  <><span style={{ color: '#fff' }}>O MELHOR IPTV </span><span style={{ color: C.purpleL }}>DO BRASIL</span></>
                )}
              </h1>

              {/* Overview */}
              {heroItem?.overview && (
                <p style={{ fontSize: 'clamp(12px,1.2vw,14px)', color: 'rgba(255,255,255,0.5)', maxWidth: 440, lineHeight: 1.65, marginBottom: 24, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as any}>
                  {heroItem.overview}
                </p>
              )}

              {/* Meta row */}
              {heroItem && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.gold, fontWeight: 800 }}>
                    <Star size={12} fill={C.gold} /> {stars(heroItem.vote_average)}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em' }}>{tmdbYear(heroItem)}</span>
                  <span style={{ fontSize: 9, fontWeight: 900, background: 'rgba(124,58,237,0.3)', border: '1px solid rgba(124,58,237,0.5)', borderRadius: 4, padding: '2px 8px', letterSpacing: '0.1em', color: C.purpleL }}>{heroItem.media_type === 'tv' ? 'SÉRIE' : 'FILME'}</span>
                  <span style={{ fontSize: 9, fontWeight: 900, background: 'rgba(229,9,20,0.2)', border: '1px solid rgba(229,9,20,0.4)', borderRadius: 4, padding: '2px 8px', letterSpacing: '0.1em', color: '#ff6b6b' }}>4K HDR</span>
                </div>
              )}

              {/* Stats */}
              <div style={{ display: 'flex', gap: 'clamp(20px,3vw,48px)', marginBottom: 32, flexWrap: 'wrap' }}>
                {[{ val: '100K+', label: 'Títulos no Catálogo' }, { val: '500+', label: 'Canais Ao Vivo' }, { val: '24H', label: 'Suporte Online' }].map(s => (
                  <div key={s.val}>
                    <div style={{ fontSize: 'clamp(22px,2.8vw,36px)', fontWeight: 900, color: C.purpleL, lineHeight: 1, letterSpacing: '-1px' }}>{s.val}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 3 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* CTAs */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
                <button onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.purple, color: '#fff', border: 'none', borderRadius: 8, padding: 'clamp(12px,1.5vw,16px) clamp(20px,2.5vw,32px)', fontSize: 13, fontWeight: 900, letterSpacing: '0.08em', cursor: 'pointer', textTransform: 'uppercase', boxShadow: `0 8px 32px rgba(124,58,237,0.5)` }}>
                  🎬 INICIAR AGORA <ChevronRight size={16} />
                </button>
                <button onClick={() => scrollTo(catalogRef)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: 'clamp(12px,1.5vw,16px) clamp(20px,2.5vw,28px)', fontSize: 13, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase' }}>
                  <Play size={14} fill="white" /> VER CATÁLOGO
                </button>
              </div>

              {/* Bullets */}
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                {['Liberação imediata', 'Sem contrato', 'Cancela quando quiser'].map(b => (
                  <span key={b} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
                    <Check size={10} style={{ color: '#22c55e' }} />{b}
                  </span>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Dots carrossel */}
        <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6, zIndex: 3 }}>
          {trending.slice(0, 8).map((_, i) => (
            <button key={i} onClick={() => setHeroBanner(i)} style={{ width: i === heroBanner ? 22 : 6, height: 6, borderRadius: 3, border: 'none', cursor: 'pointer', transition: 'all 0.3s', background: i === heroBanner ? C.purple : 'rgba(255,255,255,0.2)' }} />
          ))}
        </div>
      </div>

      {/* ━━━ TICKER DE APPS PARCEIROS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {allApps.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, background: C.card, padding: '12px 0', overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', animation: 'ticker 35s linear infinite', width: 'max-content' }}>
            {[...allApps, ...allApps, ...allApps].map((app, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, flexShrink: 0 }}>
                {app.app_image_url ? <img src={app.app_image_url} alt={app.name} style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'contain' }} /> : <div style={{ width: 22, height: 22, borderRadius: 4, background: C.red, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900, color: '#fff' }}>{app.name[0]}</div>}
                <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap', letterSpacing: '0.08em' }}>{app.name.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ━━━ CATÁLOGO TMDB ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {(popular.length > 0 || series.length > 0) && (
        <section ref={catalogRef} style={{ padding: 'clamp(48px,6vw,80px) clamp(16px,4vw,56px)' }}>
          <SceneBadge text="SCENE 02 · CATALOG" />
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 8 }}>
            <div>
              <h2 style={{ fontSize: 'clamp(28px,4.5vw,60px)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-2px', lineHeight: 0.93 }}>
                <span style={{ color: '#fff' }}>FILMES E </span><span style={{ color: C.purpleL }}>SÉRIES</span>
              </h2>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 8, letterSpacing: '0.1em', fontWeight: 700, textTransform: 'uppercase' }}>
                <span style={{ color: '#22c55e' }}>●</span> BIBLIOTECA ATUALIZADA HOJE · + DE 100.000 TÍTULOS
              </p>
            </div>
          </div>

          {/* Abas */}
          <div style={{ display: 'flex', gap: 6, marginTop: 24, marginBottom: 28, flexWrap: 'wrap' }}>
            {[{ id: 'hot', icon: '🔥', label: 'EM ALTA' }, { id: 'new', icon: '✨', label: 'LANÇAMENTOS' }, { id: 'series', icon: '📺', label: 'SÉRIES' }].map(tab => (
              <button key={tab.id} onClick={() => setCatalogTab(tab.id as any)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s', background: catalogTab === tab.id ? C.purple : 'rgba(255,255,255,0.07)', color: catalogTab === tab.id ? '#fff' : 'rgba(255,255,255,0.45)', boxShadow: catalogTab === tab.id ? `0 4px 16px rgba(124,58,237,0.4)` : 'none' }}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* Grid de posters */}
          <div style={{ overflowX: 'auto', paddingBottom: 12 }} className="no-scrollbar">
            <AnimatePresence mode="wait">
              <motion.div key={catalogTab} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
                style={{ display: 'flex', gap: 12, width: 'max-content' }}>
                {catalogItems.slice(0, 18).map((item, i) => (
                  <motion.div key={item.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                    onClick={() => setShowModal(true)}
                    style={{ width: 'clamp(110px,10vw,150px)', flexShrink: 0, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: C.card2, border: `1px solid ${C.border}`, position: 'relative' }}
                    whileHover={{ scale: 1.04, y: -4 } as any}>
                    <div style={{ position: 'relative', paddingTop: '150%' }}>
                      {item.poster_path
                        ? <img src={`${TMDB_IMG}w342${item.poster_path}`} alt={tmdbTitle(item)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <div style={{ position: 'absolute', inset: 0, background: '#1a0a2a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🎬</div>
                      }
                      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 50%)' }} />
                      {/* Badges */}
                      <div style={{ position: 'absolute', top: 6, left: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {i < 5 && <span style={{ fontSize: 7, fontWeight: 900, background: '#E50914', color: '#fff', borderRadius: 3, padding: '2px 5px', letterSpacing: '0.1em' }}>🔥 EM ALTA</span>}
                        <span style={{ fontSize: 7, fontWeight: 900, background: 'rgba(0,0,0,0.7)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, padding: '2px 5px', letterSpacing: '0.05em' }}>4K</span>
                      </div>
                      {/* Rating */}
                      <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(0,0,0,0.75)', borderRadius: 4, padding: '2px 5px' }}>
                        <Star size={8} fill={C.gold} style={{ color: C.gold }} />
                        <span style={{ fontSize: 8, fontWeight: 800, color: C.gold }}>{stars(item.vote_average)}</span>
                      </div>
                      {/* Título e ano */}
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '6px 8px' }}>
                        <p style={{ fontSize: 9, fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as any}>{tmdbTitle(item)}</p>
                        <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{tmdbYear(item)}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 12, fontStyle: 'italic' }}>Arraste para ver mais →</p>
        </section>
      )}

      {/* ━━━ APPS DISPONÍVEIS (GRATUITOS + PAGOS) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {(freeApps.length > 0 || paidApps.length > 0) && (
        <section ref={appsRef} style={{ padding: 'clamp(48px,6vw,80px) clamp(16px,4vw,56px)', background: 'rgba(20,14,30,0.5)' }}>
          <SceneBadge text="SCENE 03 · APPS" />
          <h2 style={{ fontSize: 'clamp(28px,4.5vw,60px)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-2px', lineHeight: 0.93, marginBottom: 12 }}>
            <span style={{ color: '#fff' }}>APLICATIVOS </span><span style={{ color: C.purpleL }}>DISPONÍVEIS</span>
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', maxWidth: 520, marginBottom: 48, lineHeight: 1.6 }}>
            Tudo em um só lugar. Sem precisar pagar várias assinaturas.
          </p>

          {/* Gratuitos */}
          {freeApps.length > 0 && (
            <div style={{ marginBottom: 48 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <span style={{ fontSize: 10, fontWeight: 900, background: '#22c55e', color: '#fff', borderRadius: 4, padding: '3px 10px', letterSpacing: '0.1em' }}>🎁 GRÁTIS</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Ativação gratuita — sem pagar nada</span>
              </div>
              <div style={{ overflowX: 'auto', paddingBottom: 8 }} className="no-scrollbar">
                <div style={{ display: 'flex', gap: 14, width: 'max-content' }}>
                  {freeApps.map((app, i) => <AppCard key={app.id} app={app} index={i} badge="GRÁTIS" badgeColor="#22c55e" onCTA={() => setShowModal(true)} ctaLabel="Ativar grátis" ctaColor="#22c55e" />)}
                </div>
              </div>
            </div>
          )}

          {/* Pagos */}
          {paidApps.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <span style={{ fontSize: 10, fontWeight: 900, background: C.purple, color: '#fff', borderRadius: 4, padding: '3px 10px', letterSpacing: '0.1em' }}>⚡ IMEDIATO</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Pague e use na hora</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 14 }}>
                {paidApps.map((app, i) => <AppCard key={app.id} app={app} index={i} badge="⚡ IMEDIATO" badgeColor={C.purpleL} onCTA={() => setShowModal(true)} ctaLabel="Ativar agora" ctaColor={C.purple} showPrice />)}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ━━━ TOP 10 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {top10.length > 0 && (
        <section ref={top10Ref} style={{ padding: 'clamp(48px,6vw,80px) clamp(16px,4vw,56px)' }}>
          <SceneBadge text="SCENE 04 · TOP 10" />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'clamp(28px,5vw,60px)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-2px', color: '#fff' }}>TOP</span>
            <span style={{ fontSize: 'clamp(28px,5vw,60px)', fontWeight: 900, letterSpacing: '-2px', color: C.purpleL }}>10</span>
            <span style={{ fontSize: 'clamp(12px,1.5vw,18px)', fontWeight: 900, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Mais Vendidos Este Mês</span>
          </div>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', maxWidth: 480, marginBottom: 40, lineHeight: 1.6 }}>Os apps mais escolhidos pelos nossos clientes.</p>
          <div style={{ overflowX: 'auto', paddingBottom: 12 }} className="no-scrollbar">
            <div style={{ display: 'flex', gap: 8, width: 'max-content' }}>
              {top10.map((app, i) => (
                <motion.div key={app.id} initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
                  style={{ position: 'relative', width: 128, flexShrink: 0, cursor: 'pointer' }} onClick={() => setShowModal(true)}>
                  <div style={{ position: 'absolute', left: -10, bottom: 50, zIndex: 1, fontSize: 72, fontWeight: 900, lineHeight: 1, color: C.dark, WebkitTextStroke: `2.5px ${i < 3 ? C.purpleL : 'rgba(255,255,255,0.15)'}`, userSelect: 'none' }}>{app.landing_rank}</div>
                  <div style={{ marginLeft: 14, borderRadius: 8, overflow: 'hidden', height: 175, border: `1px solid ${C.border}`, position: 'relative' }}>
                    {app.app_image_url ? <img src={app.app_image_url} alt={app.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: '#1a0a2a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 900, color: C.purpleL }}>{app.name[0]}</div>}
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 55%)' }} />
                    <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8 }}><p style={{ fontSize: 8, fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{app.name}</p></div>
                    {i < 3 && <div style={{ position: 'absolute', top: 8, right: 8, fontSize: 16 }}>{['🥇','🥈','🥉'][i]}</div>}
                  </div>
                  <button style={{ marginTop: 8, marginLeft: 14, width: 'calc(100% - 14px)', padding: '7px 0', borderRadius: 6, border: 'none', background: C.purple, color: '#fff', fontSize: 8, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Play size={8} fill="white" /> Quero esse
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ━━━ POR QUE STARTFLIX — Cards numerados ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section style={{ padding: 'clamp(48px,6vw,80px) clamp(16px,4vw,56px)', background: 'rgba(20,14,30,0.4)' }}>
        <SceneBadge text="SCENE 05 · WHY STARTFLIX" />
        <h2 style={{ fontSize: 'clamp(28px,4.5vw,60px)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-2px', lineHeight: 0.93, marginBottom: 12 }}>
          <span style={{ color: '#fff' }}>POR QUE ESCOLHER A </span><span style={{ color: C.purpleL }}>STARTFLIX?</span>
        </h2>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', maxWidth: 540, marginBottom: 48, lineHeight: 1.6 }}>Seis razões pelas quais milhares de pessoas escolhem a StartFlix.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14 }}>
          {FEATURES.map((f, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.07 }}
              style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '22px 18px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 12, right: 14, fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.08)', letterSpacing: '0.1em' }}>/ {f.n}</div>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 14 }}>{f.icon}</div>
              <h3 style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8, color: '#fff' }}>{f.title}</h3>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', lineHeight: 1.6 }}>{f.sub}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ━━━ FINAL SCENE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section style={{ overflow: 'hidden' }}>
        <div style={{ height: 12, background: `repeating-linear-gradient(45deg, ${C.purple} 0px, ${C.purple} 12px, transparent 12px, transparent 24px)`, opacity: 0.55 }} />
        <div style={{ padding: 'clamp(56px,7vw,96px) clamp(16px,4vw,56px)', background: 'linear-gradient(135deg, #0d0020 0%, #1a0a3a 50%, #0d0020 100%)', textAlign: 'center' }}>
          <span style={{ display: 'inline-block', border: '1px solid rgba(168,85,247,0.4)', borderRadius: 20, padding: '4px 16px', fontSize: 9, fontWeight: 800, letterSpacing: '0.3em', color: C.purpleL, marginBottom: 28, textTransform: 'uppercase' }}>── FINAL SCENE · ROLL CREDITS ──</span>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 style={{ fontSize: 'clamp(30px,5vw,64px)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-2px', lineHeight: 0.93, marginBottom: 16 }}>
              <span style={{ color: '#fff' }}>PRONTO PARA </span><span style={{ color: C.purpleL }}>COMEÇAR?</span>
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 40, maxWidth: 400, margin: '0 auto 40px' }}>Fale agora com nosso suporte e ative seu app em minutos.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.purple, color: '#fff', border: 'none', borderRadius: 8, padding: '16px 36px', fontSize: 14, fontWeight: 900, letterSpacing: '0.08em', cursor: 'pointer', textTransform: 'uppercase', boxShadow: `0 8px 32px rgba(124,58,237,0.5)` }}>
                <MessageCircle size={18} /> INICIAR ATENDIMENTO →
              </button>
              {supportWhatsapp && (
                <a href={`https://wa.me/${supportWhatsapp}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#25D366', color: '#fff', borderRadius: 8, padding: '16px 28px', fontSize: 14, fontWeight: 900, textDecoration: 'none', textTransform: 'uppercase', boxShadow: '0 8px 32px rgba(37,211,102,0.35)' }}>
                  <MessageCircle size={18} /> WHATSAPP
                </a>
              )}
            </div>
          </motion.div>
        </div>
        <div style={{ height: 12, background: `repeating-linear-gradient(45deg, ${C.purple} 0px, ${C.purple} 12px, transparent 12px, transparent 24px)`, opacity: 0.55 }} />
      </section>

      {/* FOOTER */}
      <footer style={{ background: '#040404', padding: '18px clamp(16px,4vw,56px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 22, height: 22, borderRadius: 4, background: C.red, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 7, fontWeight: 900, color: '#fff' }}>SF</span></div>
          <span style={{ fontSize: 12, fontWeight: 900 }}><span style={{ color: C.red }}>START</span><span style={{ color: '#fff' }}>FLIX</span></span>
        </div>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.15)', letterSpacing: '0.1em' }}>© 2026 STARTPAINEL. TODOS OS DIREITOS RESERVADOS.</span>
        <button onClick={onAdminClick} style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'rgba(255,255,255,0.12)', cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          <Lock size={9} /> Admin
        </button>
      </footer>

      {/* WHATSAPP FLOAT */}
      {supportWhatsapp && (
        <a href={`https://wa.me/${supportWhatsapp}`} target="_blank" rel="noopener noreferrer" style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 99, display: 'flex', alignItems: 'center', gap: 8, background: '#25D366', color: '#fff', borderRadius: '50px', padding: '12px 20px', fontSize: 13, fontWeight: 900, textDecoration: 'none', boxShadow: '0 8px 28px rgba(37,211,102,0.5)' }}>
          <MessageCircle size={20} fill="white" />
          <span className="wa-label">WhatsApp</span>
        </a>
      )}

      {/* ━━━ MODAL DE ENTRADA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(16px)' }}>
            <motion.div initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 20 }}
              style={{ width: '100%', maxWidth: 380, borderRadius: 16, overflow: 'hidden', background: '#0e0e0e', border: `1px solid rgba(124,58,237,0.35)`, boxShadow: `0 24px 60px rgba(124,58,237,0.3)`, position: 'relative' }}>
              <button onClick={() => setShowModal(false)} style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}><X size={14} /></button>
              <div style={{ padding: '30px 24px 22px', textAlign: 'center', background: 'linear-gradient(135deg, #0d0020, #1a0a3a)', borderBottom: `1px solid ${C.border}`, position: 'relative' }}>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img src={attendantImage} alt={attendantName} style={{ width: 68, height: 68, borderRadius: '50%', border: `3px solid ${C.purple}`, objectFit: 'cover', display: 'block', margin: '0 auto' }} />
                  <span style={{ position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: '50%', background: '#22c55e', border: '2px solid #0e0e0e', display: 'block' }}></span>
                </div>
                <h3 style={{ marginTop: 12, fontSize: 15, fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{attendantName}</h3>
                <p style={{ fontSize: 9, color: C.purpleL, fontWeight: 800, letterSpacing: '0.2em', marginTop: 4, textTransform: 'uppercase' }}>● ONLINE AGORA · RESPONDE RÁPIDO</p>
              </div>
              <form onSubmit={handleSubmit} style={{ padding: '22px 24px 26px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ textAlign: 'center', marginBottom: 2 }}>
                  <p style={{ fontSize: 14, fontWeight: 900, color: '#fff' }}>Bem-vindo ao StartFlix 👋</p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>Preencha para iniciar o atendimento.</p>
                </div>
                {[{ label: 'Seu nome', value: nameInput, set: setNameInput, placeholder: 'Como você se chama?', type: 'text', af: true }, { label: 'Seu WhatsApp', value: phoneInput, set: setPhoneInput, placeholder: 'Ex.: 88 99999-0000', type: 'tel', af: false }].map(f => (
                  <div key={f.label}>
                    <label style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.2em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>{f.label}</label>
                    <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} type={f.type} autoFocus={f.af}
                      style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.05)', border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 8, fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                ))}
                <button type="submit" disabled={!nameInput.trim() || onlyDigits(phoneInput).length < 10}
                  style={{ width: '100%', padding: '14px 0', borderRadius: 8, border: 'none', background: C.purple, color: '#fff', fontSize: 13, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: (!nameInput.trim() || onlyDigits(phoneInput).length < 10) ? 0.4 : 1, boxShadow: `0 4px 20px rgba(124,58,237,0.4)` }}>
                  <MessageCircle size={16} /> INICIAR ATENDIMENTO
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CSS */}
      <style>{`
        @keyframes ticker  { 0% { transform: translateX(0); } 100% { transform: translateX(-33.333%); } }
        @keyframes pulse   { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        .no-scrollbar::-webkit-scrollbar { display:none; }
        .no-scrollbar { -ms-overflow-style:none; scrollbar-width:none; }
        @media (max-width:680px) {
          .nav-links, .nav-online { display:none !important; }
          .nav-burger { display:flex !important; }
          .hero-posters { display:none !important; }
          .wa-label { display:none; }
        }
      `}</style>
    </div>
  );
}

// ─── SUB-COMPONENTES ──────────────────────────────────────────────────────────
function SceneBadge({ text }: { text: string }) {
  return (
    <motion.div initial={{ opacity: 0, x: -12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid rgba(124,58,237,0.4)', borderRadius: 20, padding: '4px 14px', fontSize: 9, fontWeight: 800, letterSpacing: '0.25em', color: '#A855F7', marginBottom: 16, textTransform: 'uppercase' }}>
        ● {text}
      </span>
    </motion.div>
  );
}

function AppCard({ app, index, badge, badgeColor, onCTA, ctaLabel, ctaColor, showPrice }: {
  app: LandingApp; index: number; badge: string; badgeColor: string;
  onCTA: () => void; ctaLabel: string; ctaColor: string; showPrice?: boolean;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.05 }}
      style={{ width: 155, flexShrink: 0, borderRadius: 10, overflow: 'hidden', background: '#111', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer' }}
      onClick={onCTA} whileHover={{ scale: 1.04, y: -4 } as any}>
      <div style={{ position: 'relative', height: 115 }}>
        {app.app_image_url ? <img src={app.app_image_url} alt={app.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#1a0a2a,#0a0018)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 900, color: '#A855F7' }}>{app.name[0]}</div>}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(0,0,0,0.7) 0%,transparent 60%)' }} />
        <span style={{ position: 'absolute', top: 7, left: 7, fontSize: 7, fontWeight: 900, background: badgeColor, color: '#fff', borderRadius: 4, padding: '2px 6px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{badge}</span>
      </div>
      <div style={{ padding: '10px 10px 12px' }}>
        <p style={{ fontSize: 10, fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{app.name}</p>
        {showPrice && app.landing_price && <p style={{ fontSize: 13, fontWeight: 900, color: badgeColor, marginBottom: 6 }}>{app.landing_price}</p>}
        {app.description && <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.32)', lineHeight: 1.4, marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as any}>{app.description}</p>}
        <button onClick={e => { e.stopPropagation(); onCTA(); }} style={{ width: '100%', padding: '7px 0', borderRadius: 5, border: 'none', background: ctaColor, color: '#fff', fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
          {ctaLabel} →
        </button>
      </div>
    </motion.div>
  );
}
