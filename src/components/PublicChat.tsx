import React, { useEffect, useRef, useState } from 'react';
import { Send, Lock, Volume2, VolumeX, Play, Paperclip, X as XIcon, MessageCircle } from 'lucide-react';
import LandingPage from './LandingPage';

type Msg = {
  role: 'user' | 'model';
  text: string;
  imageData?: string;       // data URL para preview do que o usuário enviou
  audioUrl?: string;
  handoff?: { url: string; label: string } | null;
};

const MUTE_KEY    = 'public_chat_muted';
const SESSION_KEY = 'public_chat_session_id';
const NAME_KEY    = 'public_chat_name';
const PHONE_KEY   = 'public_chat_phone';

function getSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(SESSION_KEY, id); }
  return id;
}

function onlyDigits(s: string): string { return (s || '').replace(/\D/g, ''); }

interface Props { onAdminClick: () => void; }

// Cores tipo WhatsApp
const WA_DARK_GREEN = '#075E54';
const WA_TEAL       = '#128C7E';
const WA_GREEN      = '#25D366';
const WA_BG         = '#E5DDD5';     // fundo da conversa
const WA_USER_BUBBLE = '#DCF8C6';    // verde claro do balão do usuário
const WA_INPUT_BG    = '#F0F0F0';

export default function PublicChat({ onAdminClick }: Props) {
  // --- Estado da sessão / cliente
  const [name,  setName]  = useState<string>(() => localStorage.getItem(NAME_KEY)  || '');
  const [phone, setPhone] = useState<string>(() => localStorage.getItem(PHONE_KEY) || '');
  const [nameInput,  setNameInput]  = useState('');
  const [phoneInput, setPhoneInput] = useState('');

  // --- Identidade do atendente (vem do painel admin)
  const [attendantName,  setAttendantName]  = useState('Lucas');
  const [attendantImage, setAttendantImage] = useState('https://i.pravatar.cc/200?img=12');
  const [supportWhatsapp, setSupportWhatsapp] = useState<string>('');

  // --- Conversa
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input,    setInput]    = useState('');
  const [pendingImage, setPendingImage] = useState<{ data: string; mimeType: string; preview: string } | null>(null);
  const [sending,  setSending]  = useState(false);
  const [muted,    setMuted]    = useState<boolean>(() => localStorage.getItem(MUTE_KEY) === '1');

  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef  = useRef<HTMLAudioElement | null>(null);
  const fileRef   = useRef<HTMLInputElement | null>(null);

  // --- Áudio
  const playAudio = (url: string) => {
    try {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
      const a = new Audio(url); audioRef.current = a; a.play().catch(() => {});
    } catch {}
  };
  const toggleMute = () => {
    const next = !muted; setMuted(next); localStorage.setItem(MUTE_KEY, next ? '1' : '0');
    if (next && audioRef.current) audioRef.current.pause();
  };

  // --- Settings (atendente + whatsapp suporte)
  useEffect(() => {
    fetch('/api/settings/attendant_name').then(r => r.json()).then(d => d?.value && setAttendantName(d.value)).catch(() => {});
    fetch('/api/settings/attendant_image').then(r => r.json()).then(d => d?.value && setAttendantImage(d.value)).catch(() => {});
    fetch('/api/settings/whatsapp_support').then(r => r.json()).then(d => d?.value && setSupportWhatsapp(onlyDigits(d.value))).catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  // --- Entrada (nome + WhatsApp)
  const handleEnter = (e: React.FormEvent) => {
    e.preventDefault();
    const n = nameInput.trim();
    const p = onlyDigits(phoneInput);
    if (!n || p.length < 10) return;
    localStorage.setItem(NAME_KEY, n);
    localStorage.setItem(PHONE_KEY, p);
    setName(n);
    setPhone(p);
  };

  // --- Seleção de imagem
  const onPickImage = () => fileRef.current?.click();
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { alert('Manda só imagem (PNG/JPG).'); return; }
    if (f.size > 5 * 1024 * 1024)     { alert('Imagem grande demais (máx. 5 MB).'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
      setPendingImage({ data: base64, mimeType: f.type, preview: dataUrl });
    };
    reader.readAsDataURL(f);
    e.target.value = '';
  };
  const clearPendingImage = () => setPendingImage(null);

  // --- Envio de mensagem
  const send = async () => {
    if (sending) return;
    const text = input.trim();
    if (!text && !pendingImage) return;

    setInput('');
    const localImagePreview = pendingImage?.preview;
    setMessages(prev => [...prev, { role: 'user', text, imageData: localImagePreview }]);

    const payload: any = { sessionId: getSessionId(), name, phone, message: text };
    if (pendingImage) payload.image = { data: pendingImage.data, mimeType: pendingImage.mimeType };
    setPendingImage(null);
    setSending(true);
    try {
      const res = await fetch('/api/public-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      let audioUrl: string | undefined;
      if (data.audio?.data && data.audio?.mimeType) {
        audioUrl = `data:${data.audio.mimeType};base64,${data.audio.data}`;
        if (!muted) playAudio(audioUrl);
      }
      setMessages(prev => [...prev, {
        role: 'model',
        text: data.text || '⚠️ Sem resposta',
        audioUrl,
        handoff: data.handoff || null,
      }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'model', text: `⚠️ Erro: ${e?.message || 'falha de rede'}` }]);
    } finally {
      setSending(false);
    }
  };

  // --- Floating button para abrir o WhatsApp suporte direto (sempre visível)
  const FloatingWaButton = supportWhatsapp ? (
    <a
      href={`https://wa.me/${supportWhatsapp}`}
      target="_blank"
      rel="noopener noreferrer"
      title="Falar direto no WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-[#25D366] hover:bg-[#1da855] text-white px-4 py-3 rounded-full shadow-xl shadow-emerald-900/30 transition-transform hover:scale-105"
      style={{ boxShadow: '0 8px 24px rgba(37, 211, 102, 0.4)' }}
    >
      <MessageCircle size={20} className="fill-white text-white" />
      <span className="hidden sm:inline text-sm font-bold">WhatsApp</span>
    </a>
  ) : null;

  // ════════════════════════════════════════════════════════════════════════
  // TELA DE ENTRADA — LandPage StartFlix
  // ════════════════════════════════════════════════════════════════════════
  if (!name || !phone) {
    return (
      <LandingPage
        onStartChat={(n, p) => {
          localStorage.setItem(NAME_KEY, n);
          localStorage.setItem(PHONE_KEY, p);
          setName(n);
          setPhone(p);
        }}
        onAdminClick={onAdminClick}
        supportWhatsapp={supportWhatsapp}
        attendantName={attendantName}
        attendantImage={attendantImage}
      />
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // TELA DE CHAT (tema WhatsApp)
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full" style={{ background: WA_BG }}>
      {/* Header estilo WhatsApp */}
      <div className="flex items-center justify-between px-4 py-3 text-white shadow-md z-10" style={{ background: WA_DARK_GREEN }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <img src={attendantImage} alt={attendantName} className="w-10 h-10 rounded-full object-cover ring-2 ring-white/20" />
            <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2" style={{ borderColor: WA_DARK_GREEN }}></span>
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm truncate">{attendantName}</p>
            <p className="text-[10px] text-emerald-100 font-medium">online</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleMute}
            title={muted ? 'Áudio desativado' : 'Áudio ativo'}
            className={`p-2 rounded-full transition ${muted ? 'text-white/40 hover:bg-white/10' : 'text-white hover:bg-white/10'}`}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button
            onClick={onAdminClick}
            title="Acesso administrativo"
            className="p-2 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition"
          >
            <Lock size={14} />
          </button>
        </div>
      </div>

      {/* Área de mensagens */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-4 space-y-2"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Cg fill='%23d3c8b7' fill-opacity='0.25'%3E%3Cpath d='M40 0c-3 4-7 6-12 8-5 1-9 2-13 6s-7 9-8 14c0 3 1 6 3 9 3 4 8 6 13 7 6 0 12-1 17-4 4-2 8-6 9-11 2-5 1-11-3-15-2-2-4-3-6-4Z'/%3E%3C/g%3E%3C/svg%3E\")",
        }}
      >
        {messages.length === 0 && (
          <div className="flex justify-center py-6">
            <div className="bg-white/70 backdrop-blur px-4 py-2 rounded-lg text-[11px] text-slate-600 shadow-sm">
              Olá, {name.split(' ')[0]}! Pode mandar sua mensagem que já te respondo. 😊
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[80%] flex flex-col gap-1">
              <div
                className={`px-3 py-2 text-sm whitespace-pre-wrap break-words shadow-sm ${
                  m.role === 'user' ? 'rounded-2xl rounded-br-sm' : 'rounded-2xl rounded-bl-sm bg-white text-slate-800'
                }`}
                style={m.role === 'user' ? { background: WA_USER_BUBBLE, color: '#111' } : undefined}
              >
                {m.imageData && (
                  <img src={m.imageData} alt="" className="rounded-xl mb-2 max-h-60 w-auto" />
                )}
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

              {/* Botão de handoff para o WhatsApp */}
              {m.role === 'model' && m.handoff?.url && (
                <a
                  href={m.handoff.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1da855] text-white font-bold py-3 px-4 rounded-2xl shadow-lg shadow-emerald-900/20 transition-transform hover:scale-[1.02] mt-1"
                  style={{ boxShadow: '0 6px 20px rgba(37, 211, 102, 0.35)' }}
                >
                  <MessageCircle size={18} className="fill-white" />
                  {m.handoff.label}
                </a>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-white text-slate-400 px-3 py-2 rounded-2xl rounded-bl-sm text-sm italic shadow-sm">
              digitando...
            </div>
          </div>
        )}
      </div>

      {/* Preview da imagem antes de enviar */}
      {pendingImage && (
        <div className="px-3 pt-2 flex items-center gap-2 border-t border-slate-200 bg-white">
          <img src={pendingImage.preview} alt="" className="w-14 h-14 rounded-lg object-cover" />
          <span className="text-xs text-slate-500 flex-1 truncate">Imagem pronta pra enviar</span>
          <button onClick={clearPendingImage} className="p-1 text-slate-400 hover:text-slate-700 transition" title="Remover">
            <XIcon size={16} />
          </button>
        </div>
      )}

      {/* Input bar */}
      <div className="px-2 py-2 border-t border-slate-200" style={{ background: WA_INPUT_BG }}>
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="flex items-end gap-2"
        >
          <button
            type="button"
            onClick={onPickImage}
            title="Anexar imagem"
            className="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-slate-800 transition shrink-0"
          >
            <Paperclip size={20} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onFileChange}
            className="hidden"
          />
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Digite uma mensagem..."
            className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-full text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="submit"
            disabled={(!input.trim() && !pendingImage) || sending}
            className="w-11 h-11 flex items-center justify-center text-white rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            style={{ background: WA_DARK_GREEN }}
          >
            <Send size={18} />
          </button>
        </form>
      </div>

      {FloatingWaButton}
    </div>
  );
}
