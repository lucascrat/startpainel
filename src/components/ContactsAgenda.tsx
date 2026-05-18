import React, { useState, useEffect, useRef } from 'react';
import { Search, MessageSquare, Send, Users, Megaphone, X, RefreshCw, ChevronLeft, Phone, Clock, CheckCheck, AlertTriangle, Loader2 } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { authFetch } from '../lib/auth';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

type Contact = {
  id: number;
  remote_jid: string;
  name: string | null;
  last_message: string | null;
  last_message_time: string | null;
  unread_count: number;
  profile_pic: string | null;
  is_customer?: boolean;
};

type Message = {
  id: number;
  text: string;
  sender: 'customer' | 'ai' | 'attendant';
  type: string;
  created_at: string;
};

type BroadcastResult = {
  sent: number;
  failed: number;
  total: number;
};

function phoneFromJid(jid: string): string {
  if (jid.startsWith('web:')) return 'Chat Web';
  const num = jid.split('@')[0].replace(/\D/g, '');
  if (num.length >= 12) return `+${num.slice(0, 2)} (${num.slice(2, 4)}) ${num.slice(4, 9)}-${num.slice(9)}`;
  return num;
}

function isWhatsApp(jid: string): boolean {
  return !jid.startsWith('web:') && jid.includes('@s.whatsapp.net') || (!jid.startsWith('web:') && !jid.includes('@'));
}

export default function ContactsAgenda() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filtered, setFiltered] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

  // Broadcast
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<BroadcastResult | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'whatsapp' | 'web'>('all');

  const scrollRef = useRef<HTMLDivElement>(null);

  const loadContacts = async () => {
    try {
      setLoadingContacts(true);
      const res = await authFetch('/api/contacts/all');
      const data = await res.json();
      setContacts(data);
      setFiltered(data);
    } catch {
      toast.error('Erro ao carregar contatos');
    } finally {
      setLoadingContacts(false);
    }
  };

  const loadMessages = async (contact: Contact) => {
    setLoadingMessages(true);
    try {
      const res = await authFetch(`/api/messages?remoteJid=${encodeURIComponent(contact.remote_jid)}`);
      const data = await res.json();
      setMessages(data);
    } catch {
      toast.error('Erro ao carregar mensagens');
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => { loadContacts(); }, []);

  useEffect(() => {
    const lower = search.toLowerCase();
    let list = contacts;
    if (filterType === 'whatsapp') list = list.filter(c => !c.remote_jid.startsWith('web:'));
    if (filterType === 'web') list = list.filter(c => c.remote_jid.startsWith('web:'));
    if (lower) list = list.filter(c =>
      (c.name || '').toLowerCase().includes(lower) ||
      c.remote_jid.toLowerCase().includes(lower) ||
      (c.last_message || '').toLowerCase().includes(lower)
    );
    setFiltered(list);
  }, [search, contacts, filterType]);

  useEffect(() => {
    if (selected) loadMessages(selected);
  }, [selected]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const handleSelect = (c: Contact) => {
    setSelected(c);
    if (window.innerWidth < 640) setShowSidebar(false);
  };

  const handleBroadcast = async () => {
    if (!broadcastText.trim()) return;
    setBroadcasting(true);
    setBroadcastResult(null);
    try {
      const res = await authFetch('/api/contacts/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: broadcastText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro no envio');
      setBroadcastResult(data);
      toast.success(`Aviso enviado para ${data.sent} contatos!`);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao disparar aviso');
    } finally {
      setBroadcasting(false);
    }
  };

  const whatsappCount = contacts.filter(c => !c.remote_jid.startsWith('web:')).length;
  const webCount = contacts.filter(c => c.remote_jid.startsWith('web:')).length;

  return (
    <div className="flex h-full bg-slate-50 overflow-hidden relative">

      {/* MODAL BROADCAST */}
      {showBroadcast && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                  <Megaphone size={16} className="text-amber-600" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest">Disparar Aviso</h3>
                  <p className="text-[10px] text-slate-400 font-bold">Envia para todos os contatos WhatsApp</p>
                </div>
              </div>
              <button onClick={() => { setShowBroadcast(false); setBroadcastResult(null); setBroadcastText(''); }}
                className="p-1.5 text-slate-400 hover:text-slate-700 transition rounded-full hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Stats */}
              <div className="flex gap-3">
                <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-emerald-700">{whatsappCount}</p>
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">WhatsApp</p>
                </div>
                <div className="flex-1 bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-slate-500">{webCount}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Chat Web</p>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
                <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-700 font-medium">
                  A mensagem será enviada <strong>somente para contatos do WhatsApp</strong>. Contatos de chat web não receberão.
                </p>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Mensagem</label>
                <textarea
                  value={broadcastText}
                  onChange={e => setBroadcastText(e.target.value)}
                  placeholder={`Olá! Informamos que nosso novo número de suporte é *XX XXXXX-XXXX*. Por favor, salve e entre em contato por lá. Obrigado! 🙏`}
                  rows={5}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">{broadcastText.length} caracteres</p>
              </div>

              {broadcastResult && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-1">
                  <p className="text-xs font-black text-emerald-700 uppercase tracking-widest">Resultado</p>
                  <div className="flex gap-4 text-sm">
                    <span className="text-emerald-700">✅ Enviados: <strong>{broadcastResult.sent}</strong></span>
                    {broadcastResult.failed > 0 && <span className="text-red-600">❌ Falhas: <strong>{broadcastResult.failed}</strong></span>}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setShowBroadcast(false); setBroadcastResult(null); setBroadcastText(''); }}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleBroadcast}
                  disabled={!broadcastText.trim() || broadcasting}
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-widest rounded-xl transition flex items-center justify-center gap-2"
                >
                  {broadcasting ? <><Loader2 size={14} className="animate-spin" /> Enviando...</> : <><Send size={14} /> Disparar</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SIDEBAR — Lista de contatos */}
      <div className={`${showSidebar ? 'flex' : 'hidden'} sm:flex flex-col w-full sm:w-80 bg-white border-r border-slate-200 z-10`}>
        {/* Header */}
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={14} className="text-slate-500" />
              <h2 className="font-black text-slate-800 uppercase tracking-widest text-xs">Agenda</h2>
              <span className="bg-slate-200 text-slate-600 text-[9px] font-black px-1.5 py-0.5 rounded-full">
                {contacts.length}
              </span>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setShowBroadcast(true)}
                title="Disparar aviso para todos"
                className="flex items-center gap-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition shadow-sm"
              >
                <Megaphone size={11} />
                Aviso
              </button>
              <button onClick={loadContacts} className="p-1.5 hover:bg-slate-200 rounded-lg transition text-slate-400">
                <RefreshCw size={13} />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome ou número..."
              className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg">
            {(['all', 'whatsapp', 'web'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilterType(f)}
                className={`flex-1 py-1 text-[9px] font-black uppercase tracking-widest rounded transition ${
                  filterType === f ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'
                }`}
              >
                {f === 'all' ? `Todos (${contacts.length})` : f === 'whatsapp' ? `WA (${whatsappCount})` : `Web (${webCount})`}
              </button>
            ))}
          </div>
        </div>

        {/* Contacts list */}
        <div className="flex-1 overflow-y-auto">
          {loadingContacts ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={20} className="animate-spin text-slate-300" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <Users size={24} className="text-slate-200 mx-auto" />
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nenhum contato</p>
            </div>
          ) : filtered.map(contact => (
            <div
              key={contact.id}
              onClick={() => handleSelect(contact)}
              className={`px-3 py-2.5 border-b border-slate-50 flex items-center gap-2.5 cursor-pointer transition hover:bg-slate-50 ${
                selected?.id === contact.id ? 'bg-emerald-50 border-l-2 border-l-emerald-500' : ''
              }`}
            >
              {/* Avatar */}
              <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-black ${
                contact.remote_jid.startsWith('web:') ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-700'
              }`}>
                {contact.profile_pic
                  ? <img src={contact.profile_pic} className="w-full h-full rounded-full object-cover" alt="" />
                  : (contact.name?.[0] || contact.remote_jid[0]).toUpperCase()
                }
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1 min-w-0">
                    <p className="text-[11px] font-black text-slate-800 truncate">
                      {contact.name || phoneFromJid(contact.remote_jid)}
                    </p>
                    {contact.remote_jid.startsWith('web:') && (
                      <span className="text-[7px] bg-indigo-100 text-indigo-600 px-1 py-0.5 rounded font-black uppercase tracking-widest shrink-0">web</span>
                    )}
                    {contact.is_customer && (
                      <span className="text-[7px] bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded font-black uppercase tracking-widest shrink-0">cliente</span>
                    )}
                  </div>
                  {contact.last_message_time && (
                    <span className="text-[9px] text-slate-400 shrink-0 ml-1">
                      {formatDistanceToNow(new Date(contact.last_message_time), { locale: ptBR, addSuffix: false })}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 truncate">{contact.last_message || 'Sem mensagens'}</p>
                {!contact.remote_jid.startsWith('web:') && (
                  <p className="text-[9px] text-slate-300 flex items-center gap-0.5 mt-0.5">
                    <Phone size={8} />{phoneFromJid(contact.remote_jid)}
                  </p>
                )}
              </div>

              {contact.unread_count > 0 && (
                <div className="w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center text-[8px] font-black text-white shrink-0">
                  {contact.unread_count}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* MAIN — Conversa */}
      <div className={`flex-1 flex flex-col min-w-0 ${!showSidebar ? 'flex' : 'hidden sm:flex'}`}>
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4">
            <div className="w-20 h-20 bg-white rounded-full shadow-lg flex items-center justify-center">
              <MessageSquare size={36} className="text-slate-300" />
            </div>
            <div className="space-y-1">
              <p className="font-black text-slate-600 uppercase tracking-widest text-sm">Agenda de Contatos</p>
              <p className="text-xs text-slate-400 max-w-xs">
                {contacts.length} contatos salvos. Selecione um para ver o histórico de conversa.
              </p>
            </div>
            <div className="flex gap-4 text-center">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 min-w-[100px]">
                <p className="text-2xl font-black text-emerald-600">{whatsappCount}</p>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">WhatsApp</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 min-w-[100px]">
                <p className="text-2xl font-black text-indigo-500">{webCount}</p>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Chat Web</p>
              </div>
            </div>
            <button
              onClick={() => setShowSidebar(true)}
              className="sm:hidden px-5 py-2 bg-emerald-600 text-white rounded-full text-[10px] font-black uppercase tracking-widest"
            >
              Ver Contatos
            </button>
          </div>
        ) : (
          <>
            {/* Header da conversa */}
            <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 shadow-sm">
              <button onClick={() => { setShowSidebar(true); setSelected(null); }} className="sm:hidden text-slate-400">
                <ChevronLeft size={20} />
              </button>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${
                selected.remote_jid.startsWith('web:') ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-700'
              }`}>
                {selected.profile_pic
                  ? <img src={selected.profile_pic} className="w-full h-full rounded-full object-cover" alt="" />
                  : (selected.name?.[0] || selected.remote_jid[0]).toUpperCase()
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-black text-slate-800 text-sm truncate">{selected.name || phoneFromJid(selected.remote_jid)}</p>
                  {selected.is_customer && (
                    <span className="text-[8px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-black uppercase tracking-widest">cliente</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  {!selected.remote_jid.startsWith('web:') && (
                    <span className="flex items-center gap-0.5"><Phone size={9} />{phoneFromJid(selected.remote_jid)}</span>
                  )}
                  {selected.last_message_time && (
                    <span className="flex items-center gap-0.5">
                      <Clock size={9} />
                      {formatDistanceToNow(new Date(selected.last_message_time), { locale: ptBR, addSuffix: true })}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => loadMessages(selected)} className="p-1.5 text-slate-400 hover:text-slate-600 transition">
                <RefreshCw size={14} />
              </button>
            </div>

            {/* Mensagens */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#f0f2f5]">
              {loadingMessages ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 size={20} className="animate-spin text-slate-300" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-center">
                  <p className="text-xs text-slate-400">Nenhuma mensagem encontrada.</p>
                </div>
              ) : messages.map((msg, i) => (
                <div key={msg.id || i} className={`flex ${msg.sender === 'customer' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-xl shadow-sm text-xs leading-snug whitespace-pre-wrap break-words ${
                    msg.sender === 'customer'
                      ? 'bg-white text-slate-800 rounded-tl-none'
                      : 'bg-[#dcf8c6] text-slate-800 rounded-tr-none'
                  }`}>
                    {msg.sender !== 'customer' && (
                      <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest mb-0.5">
                        {msg.sender === 'ai' ? '🤖 Lucas' : '👤 Atendente'}
                      </p>
                    )}
                    <div className="prose prose-sm max-w-none prose-p:my-0">
                      <ReactMarkdown>{msg.text || ''}</ReactMarkdown>
                    </div>
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-[9px] text-slate-400">
                        {msg.created_at ? format(new Date(msg.created_at), 'dd/MM HH:mm') : ''}
                      </span>
                      {msg.sender !== 'customer' && <CheckCheck size={10} className="text-emerald-500" />}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Rodapé info */}
            <div className="px-4 py-2 bg-white border-t border-slate-100 flex items-center gap-2">
              <div className="text-[9px] text-slate-400 flex items-center gap-3 flex-wrap">
                <span>{messages.length} mensagens</span>
                <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{selected.remote_jid}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
