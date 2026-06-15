import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, MousePointerClick, Loader2 } from 'lucide-react';
import { authFetch } from '../lib/auth';

export default function BrowserRemote() {
  const [isRunning, setIsRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startBrowser = async () => {
    setLoading(true);
    try {
      await authFetch('/api/admin/browser/start', { method: 'POST' });
      setIsRunning(true);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const stopBrowser = async () => {
    setLoading(true);
    try {
      await authFetch('/api/admin/browser/stop', { method: 'POST' });
      setIsRunning(false);
      setImageSrc(null);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const fetchScreenshot = async () => {
    try {
      const res = await authFetch('/api/admin/browser/screenshot');
      if (!res.ok) {
        if (res.status === 404) {
          setIsRunning(false);
          setImageSrc(null);
        }
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setImageSrc(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setIsRunning(true);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (isRunning) {
      fetchScreenshot();
      intervalRef.current = setInterval(fetchScreenshot, 2000); // 2 seconds polling
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    
    // Calcula X,Y relativo (escala)
    const scaleX = 1280 / rect.width;
    const scaleY = 900 / rect.height;

    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);

    await authFetch('/api/admin/browser/click', {
      method: 'POST',
      body: JSON.stringify({ x, y })
    });
    
    // Força um screenshot imediato
    fetchScreenshot();
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isRunning) return;
    e.preventDefault();
    await authFetch('/api/admin/browser/type', {
      method: 'POST',
      body: JSON.stringify({ text: e.key })
    });
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white font-sans outline-none" tabIndex={0} onKeyDown={handleKeyDown}>
      <div className="flex items-center justify-between p-4 bg-slate-800 border-b border-slate-700">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <MousePointerClick className="text-emerald-400" /> Navegador Remoto
          </h2>
          <p className="text-xs text-slate-400 mt-1">Interaja com o robô na nuvem para passar por captchas e fazer login.</p>
        </div>
        <div className="flex gap-2">
          {!isRunning ? (
            <button onClick={startBrowser} disabled={loading} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Iniciar Navegador
            </button>
          ) : (
            <button onClick={stopBrowser} disabled={loading} className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Square size={16} />} Parar Navegador
            </button>
          )}
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-950">
        {isRunning && imageSrc ? (
          <div className="relative border-4 border-slate-700 rounded-xl overflow-hidden shadow-2xl cursor-crosshair">
            <img 
              ref={imgRef}
              src={imageSrc} 
              alt="Browser Screen" 
              className="max-w-full h-auto object-contain pointer-events-auto"
              style={{ maxHeight: '80vh' }}
              onClick={handleImageClick}
            />
            <div className="absolute top-2 right-2 bg-black/60 px-2 py-1 rounded text-[10px] uppercase font-bold tracking-widest text-emerald-400 backdrop-blur-sm pointer-events-none">Ao Vivo</div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-500">
            {loading ? (
              <>
                <Loader2 size={48} className="animate-spin mb-4" />
                <p className="font-medium">Iniciando ambiente remoto...</p>
              </>
            ) : (
              <>
                <MousePointerClick size={48} className="mb-4 opacity-50" />
                <p className="font-medium">O navegador está desligado.</p>
                <p className="text-sm mt-1">Clique em Iniciar Navegador acima.</p>
              </>
            )}
          </div>
        )}
      </div>
      
      {isRunning && (
        <div className="bg-slate-800 p-2 text-center text-xs text-slate-400 border-t border-slate-700">
          Você pode usar o mouse para clicar na tela e o teclado para digitar (a tela deve estar em foco).
        </div>
      )}
    </div>
  );
}
