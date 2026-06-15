import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Square, MousePointerClick, Loader2,
  ChevronLeft, ChevronRight, RotateCw, Home, Globe
} from 'lucide-react';
import { authFetch } from '../lib/auth';

const BROWSER_W = 1280;
const BROWSER_H = 900;

export default function BrowserRemote() {
  const [isRunning, setIsRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState('');
  const [addressBar, setAddressBar] = useState('');
  const [clickIndicator, setClickIndicator] = useState<{ pctX: number; pctY: number } | null>(null);
  const [navigating, setNavigating] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Screenshot polling ── */
  const fetchScreenshot = useCallback(async () => {
    try {
      const res = await authFetch('/api/admin/browser/screenshot');
      if (!res.ok) {
        if (res.status === 404) { setIsRunning(false); setImageSrc(null); }
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setImageSrc(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
      setIsRunning(true);
    } catch {}
  }, []);

  /* ── URL polling ── */
  const fetchUrl = useCallback(async () => {
    try {
      const res = await authFetch('/api/admin/browser/url');
      const data = await res.json();
      if (data.url) {
        setCurrentUrl(data.url);
        setAddressBar(data.url);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (isRunning) {
      fetchScreenshot();
      fetchUrl();
      intervalRef.current = setInterval(() => {
        fetchScreenshot();
        fetchUrl();
      }, 1500);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, fetchScreenshot, fetchUrl]);

  /* ── Start / Stop ── */
  const startBrowser = async () => {
    setLoading(true);
    setStartupError(null);
    try {
      const res = await authFetch('/api/admin/browser/start', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setStartupError(data.error || 'Erro desconhecido ao iniciar navegador');
      } else {
        setIsRunning(true);
      }
    } catch (e: any) {
      setStartupError(e.message || 'Erro de rede');
    }
    setLoading(false);
  };

  const stopBrowser = async () => {
    setLoading(true);
    try {
      await authFetch('/api/admin/browser/stop', { method: 'POST' });
      setIsRunning(false);
      setImageSrc(null);
      setCurrentUrl('');
      setAddressBar('');
    } catch {}
    setLoading(false);
  };

  /* ── Navigate ── */
  const navigate = async (url?: string) => {
    const target = (url ?? addressBar).trim();
    if (!target) return;
    setNavigating(true);
    try {
      await authFetch('/api/admin/browser/navigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target }),
      });
      setTimeout(fetchScreenshot, 800);
      setTimeout(fetchScreenshot, 2000);
      setTimeout(fetchUrl, 2200);
    } catch {}
    setNavigating(false);
  };

  const goHome = () => navigate('https://www.google.com.br');

  /* ── Click ── */
  const handleImageClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    const x = Math.round((relX / rect.width) * BROWSER_W);
    const y = Math.round((relY / rect.height) * BROWSER_H);

    setClickIndicator({ pctX: (relX / rect.width) * 100, pctY: (relY / rect.height) * 100 });
    setTimeout(() => setClickIndicator(null), 700);

    try {
      await authFetch('/api/admin/browser/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y }),
      });
    } catch {}

    setTimeout(fetchScreenshot, 500);
    setTimeout(fetchScreenshot, 1300);
    setTimeout(() => { fetchScreenshot(); fetchUrl(); }, 2500);
  };

  /* ── Keyboard ── */
  const handleKeyDown = async (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isRunning) return;
    // Allow normal typing in address bar
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    e.preventDefault();
    try {
      await authFetch('/api/admin/browser/type', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: e.key }),
      });
      setTimeout(fetchScreenshot, 400);
    } catch {}
  };

  /* ── Scroll ── */
  const handleWheel = async (e: React.WheelEvent<HTMLDivElement>) => {
    if (!isRunning) return;
    try {
      await authFetch('/api/admin/browser/scroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deltaY: e.deltaY }),
      });
      setTimeout(fetchScreenshot, 300);
    } catch {}
  };

  return (
    <div
      className="flex flex-col h-full bg-slate-900 text-white font-sans outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      ref={containerRef}
    >
      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <MousePointerClick size={18} className="text-emerald-400" />
          <span className="font-bold text-sm">Navegador Remoto</span>
          <span className="text-slate-500 text-xs hidden sm:inline">| Interaja com o robô na nuvem</span>
        </div>
        {!isRunning ? (
          <button
            onClick={startBrowser}
            disabled={loading}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Iniciar Navegador
          </button>
        ) : (
          <button
            onClick={stopBrowser}
            disabled={loading}
            className="px-4 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
            Parar
          </button>
        )}
      </div>

      {/* ── Address Bar ── */}
      {isRunning && (
        <div className="flex items-center gap-1 px-3 py-2 bg-slate-800 border-b border-slate-700">
          {/* Botão Home */}
          <button
            onClick={goHome}
            title="Ir para Google"
            className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <Home size={15} />
          </button>

          {/* Botão Reload */}
          <button
            onClick={() => navigate(currentUrl)}
            title="Recarregar"
            className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <RotateCw size={15} className={navigating ? 'animate-spin' : ''} />
          </button>

          {/* Barra de URL */}
          <div className="flex-1 flex items-center gap-2 bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 focus-within:border-emerald-500 transition">
            <Globe size={13} className="text-slate-500 flex-shrink-0" />
            <input
              type="text"
              value={addressBar}
              onChange={e => setAddressBar(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); navigate(); }
              }}
              placeholder="Digite uma URL ou pesquise no Google..."
              className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 outline-none min-w-0"
            />
          </div>

          {/* Botão Ir */}
          <button
            onClick={() => navigate()}
            disabled={navigating}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg text-xs font-bold transition"
          >
            {navigating ? <Loader2 size={13} className="animate-spin" /> : 'Ir'}
          </button>
        </div>
      )}

      {/* ── Viewport ── */}
      <div
        className="flex-1 overflow-auto flex items-start justify-center bg-slate-950 p-2"
        onWheel={handleWheel}
      >
        {isRunning && imageSrc ? (
          <div
            className="relative border-2 border-slate-700 rounded-lg overflow-hidden shadow-2xl cursor-crosshair select-none"
            onClick={handleImageClick}
            style={{ lineHeight: 0 }}
          >
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Browser Screen"
              draggable={false}
              style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 200px)', display: 'block', pointerEvents: 'none' }}
            />

            {/* Badge ao vivo */}
            <div className="absolute top-2 right-2 bg-black/70 px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-widest text-emerald-400 backdrop-blur-sm pointer-events-none flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
              Ao Vivo
            </div>

            {/* Indicador de clique */}
            {clickIndicator && (
              <div
                className="absolute pointer-events-none z-10"
                style={{
                  left: `${clickIndicator.pctX}%`,
                  top: `${clickIndicator.pctY}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <div className="w-7 h-7 rounded-full border-2 border-yellow-400 bg-yellow-400/20 animate-ping" />
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-500 h-full">
            {loading ? (
              <>
                <Loader2 size={48} className="animate-spin mb-4" />
                <p className="font-medium">Iniciando navegador remoto...</p>
                <p className="text-xs text-slate-600 mt-1">Isso pode levar alguns segundos</p>
              </>
            ) : (
              <div className="text-center">
                <MousePointerClick size={48} className="mx-auto mb-4 opacity-30" />
                <p className="font-medium">Navegador desligado</p>
                <p className="text-sm mt-1">Clique em <strong className="text-emerald-400">Iniciar Navegador</strong> acima.</p>
                {startupError && (
                  <div className="mt-4 p-3 bg-red-900/40 text-red-400 border border-red-800 rounded max-w-lg text-left">
                    <p className="font-bold text-sm">Erro ao iniciar:</p>
                    <p className="text-xs mt-1 whitespace-pre-wrap font-mono">{startupError}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Status Bar ── */}
      {isRunning && (
        <div className="bg-slate-800 px-3 py-1 text-center border-t border-slate-700 flex items-center justify-between">
          <span className="text-[10px] text-slate-500">
            Scroll da página funciona · Teclado digita no navegador (clique na tela primeiro)
          </span>
          <span className="text-[10px] text-slate-600 font-mono truncate max-w-xs" title={currentUrl}>
            {currentUrl}
          </span>
        </div>
      )}
    </div>
  );
}
