import React, { useEffect, useRef, useState } from 'react';
import { Send, Lock, Volume2, VolumeX, Play } from 'lucide-react';

type Msg = { role: 'user' | 'model'; text: string; audioUrl?: string };

const MUTE_KEY = 'public_chat_muted';

const SESSION_KEY = 'public_chat_session_id';
const NAME_KEY = 'public_chat_name';

function getSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

interface Props {
  onAdminClick: () => void;
}

export default function PublicChat({ onAdminClick }: Props) {
  const [name, setName] = useState<string>(() => localStorage.getItem(NAME_KEY) || '');
  const [nameInput, setNameInput] = useState('');
  const [attendantName, setAttendantName] = useState('Atendente');
  const [attendantImage, setAttendantImage] = useState('https://cdn-icons-png.flaticon.com/512/4712/4712027.png');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [muted, setMuted] = useState<boolean>(() => localStorage.getItem(MUTE_KEY) === '1');
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playAudio = (url: string) => {
    try {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
      const a = new Audio(url);
      audioRef.current = a;
      a.play().catch(() => {});
    } catch {}
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStorage.setItem(MUTE_KEY, next ? '1' : '0');
    if (next && audioRef.current) { audioRef.current.pause(); }
  };

  useEffect(() => {
    fetch('/api/settings/attendant_name').then(r => r.json()).then(d => d.value && setAttendantName(d.value)).catch(() => {});
    fetch('/api/settings/attendant_image').then(r => r.json()).then(d => d.value && setAttendantImage(d.value)).catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const handleSetName = (e: React.FormEvent) => {
    e.preventDefault();
    const n = nameInput.trim();
    if (!n) return;
    localStorage.setItem(NAME_KEY, n);
    setName(n);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text }]);
    setSending(true);
    try {
      const res = await fetch('/api/public-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: getSessionId(), name, message: text }),
      });
      const data = await res.json();
      let audioUrl: string | undefined;
      if (data.audio?.data && data.audio?.mimeType) {
        audioUrl = `data:${data.audio.mimeType};base64,${data.audio.data}`;
        if (!muted) playAudio(audioUrl);
      }
      setMessages(prev => [...prev, { role: 'model', text: data.text || '⚠️ Sem resposta', audioUrl }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'model', text: `⚠️ Erro: ${e?.message || 'falha de rede'}` }]);
    } finally {
      setSending(false);
    }
  };

  // Name gate
  if (!name) {
    return (
      <div className="flex flex-col h-full bg-slate-50">
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200">
          <div className="flex items-center gap-3">
            <img src={attendantImage} alt="" className="w-9 h-9 rounded-full object-cover" />
            <div>
              <p className="font-bold text-sm text-slate-800">{attendantName}</p>
              <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest">Online</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleMute}
              title={muted ? 'Áudio desativado — clique para ativar' : 'Áudio ativo — clique para silenciar'}
              className={`p-1.5 transition ${muted ? 'text-slate-300 hover:text-slate-500' : 'text-emerald-500 hover:text-emerald-700'}`}
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <button
              onClick={onAdminClick}
              title="Acesso administrativo"
              className="p-1.5 text-slate-300 hover:text-slate-500 transition"
            >
              <Lock size={14} />
            </button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <form onSubmit={handleSetName} className="w-full max-w-sm space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest text-center">Bem-vindo</h2>
            <p className="text-xs text-slate-500 text-center">Como você se chama?</p>
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              placeholder="Seu nome"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="submit"
              disabled={!nameInput.trim()}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold uppercase tracking-widest text-xs rounded-xl transition-colors"
            >
              Iniciar atendimento
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3">
          <img src={attendantImage} alt="" className="w-9 h-9 rounded-full object-cover" />
          <div>
            <p className="font-bold text-sm text-slate-800">{attendantName}</p>
            <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest">Online</p>
          </div>
        </div>
        <button
          onClick={onAdminClick}
          title="Acesso administrativo"
          className="p-1.5 text-slate-300 hover:text-slate-500 transition"
        >
          <Lock size={14} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-xs text-slate-400 py-8">
            Olá, {name}! Pode mandar sua mensagem que já te respondo. 😊
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                m.role === 'user'
                  ? 'bg-emerald-600 text-white rounded-br-sm'
                  : 'bg-white text-slate-800 border border-slate-200 rounded-bl-sm'
              }`}
            >
              {m.text}
              {m.audioUrl && (
                <button
                  onClick={() => playAudio(m.audioUrl!)}
                  title="Reproduzir áudio"
                  className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition align-middle"
                >
                  <Play size={10} />
                </button>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-white text-slate-400 border border-slate-200 px-4 py-2.5 rounded-2xl rounded-bl-sm text-sm">
              digitando...
            </div>
          </div>
        )}
      </div>

      <div className="px-3 py-3 bg-white border-t border-slate-200">
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="flex items-center gap-2"
        >
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Digite uma mensagem..."
            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-full text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="w-10 h-10 flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-full transition-colors"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
