import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Square, MousePointerClick, Loader2, Crosshair } from 'lucide-react';
import { authFetch } from '../lib/auth';

// Dimensões reais do viewport do Puppeteer
const BROWSER_W = 1280;
const BROWSER_H = 900;

export default function BrowserRemote() {
  const [isRunning, setIsRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [clickIndicator, setClickIndicator] = useState<{ pctX: number; pctY: number } | null>(null);
  const [lastCoords, setLastCoords] = useState<string>('');
  const imgRef = useRef<HTMLImageElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startBrowser = async () => {
    setLoading(true);
    setStartupError(null);
    try {
      const res = await authFetch('/api/admin/browser/start', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setStartupError(data.error || 'Erro desconhecido ao iniciar navegador');
        setIsRunning(false);
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
    } catch (e) {}
    setLoading(false);
  };

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
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (isRunning) {
      fetchScreenshot();
      intervalRef.current = setInterval(fetchScreenshot, 1500);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, fetchScreenshot]);

  const handleImageClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imgRef.current) return;

    // getBoundingClientRect nos dá o tamanho REAL renderizado da imagem
    const rect = imgRef.current.getBoundingClientRect();

    // Posição relativa dentro da imagem
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;

    // Converte para coordenadas do browser real (escala)
    const x = Math.round((relX / rect.width) * BROWSER_W);
    const y = Math.round((relY / rect.height) * BROWSER_H);

    // Feedback visual — bolinha no ponto clicado
    const pctX = (relX / rect.width) * 100;
    const pctY = (relY / rect.height) * 100;
    setClickIndicator({ pctX, pctY });
    setLastCoords(`Clique: imagem(${relX.toFixed(0)}, ${relY.toFixed(0)}) → browser(${x}, ${y})`);
    setTimeout(() => setClickIndicator(null), 700);

    try {
      await authFetch('/api/admin/browser/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y }),
      });
    } catch (e) {}

    // Screenshots rápidos para mostrar resultado do clique
    setTimeout(fetchScreenshot, 500);
    setTimeout(fetchScreenshot, 1200);
    setTimeout(fetchScreenshot, 2500);
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isRunning) return;
    e.preventDefault();
    try {
      await authFetch('/api/admin/browser/type', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: e.key }),
      });
    } catch (err) {}
  };

  return (
    <div
      className="flex flex-col h-full bg-slate-900 text-white font-sans outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-slate-800 border-b border-slate-700">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <MousePointerClick className="text-emerald-400" /> Navegador Remoto
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Interaja com o robô na nuvem para passar por captchas e fazer login.
          </p>
        </div>
        <div className="flex gap-2">
          {!isRunning ? (
            <button
              onClick={startBrowser}
              disabled={loading}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              Iniciar Navegador
            </button>
          ) : (
            <button
              onClick={stopBrowser}
              disabled={loading}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Square size={16} />}
              Parar Navegador
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-950">
        {isRunning && imageSrc ? (
          <div
            className="relative border-4 border-slate-700 rounded-xl overflow-hidden shadow-2xl cursor-crosshair select-none"
            onClick={handleImageClick}
            style={{ lineHeight: 0 }}
          >
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Browser Screen"
              draggable={false}
              style={{ maxWidth: '100%', maxHeight: '80vh', display: 'block', pointerEvents: 'none' }}
            />

            {/* Badge ao vivo */}
            <div className="absolute top-2 right-2 bg-black/60 px-2 py-1 rounded text-[10px] uppercase font-bold tracking-widest text-emerald-400 backdrop-blur-sm pointer-events-none">
              ● Ao Vivo
            </div>

            {/* Indicador visual de clique */}
            {clickIndicator && (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: `${clickIndicator.pctX}%`,
                  top: `${clickIndicator.pctY}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <div className="w-6 h-6 rounded-full border-2 border-yellow-400 bg-yellow-400/30 animate-ping" />
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-500">
            {loading ? (
              <>
                <Loader2 size={48} className="animate-spin mb-4" />
                <p className="font-medium">Iniciando ambiente remoto...</p>
              </>
            ) : (
              <div className="text-center text-slate-500 mt-20">
                <MousePointerClick size={48} className="mx-auto mb-4 opacity-50" />
                <p className="font-medium">O navegador está desligado.</p>
                <p className="text-sm mt-1">Clique em Iniciar Navegador acima.</p>
                {startupError && (
                  <div className="mt-4 p-3 bg-red-900/40 text-red-400 border border-red-800 rounded max-w-lg mx-auto">
                    <p className="font-bold">Erro ao iniciar:</p>
                    <p className="text-sm whitespace-pre-wrap">{startupError}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {isRunning && (
        <div className="bg-slate-800 p-2 text-center border-t border-slate-700 flex items-center justify-center gap-4">
          <span className="text-xs text-slate-400">
            Clique na tela para interagir · Teclado digita (tela deve estar em foco)
          </span>
          {lastCoords && (
            <span className="text-xs text-slate-500 font-mono">{lastCoords}</span>
          )}
        </div>
      )}
    </div>
  );
}
