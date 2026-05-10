import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, User, Bot, Check, CheckCheck, Paperclip, MoreVertical, Search, Smile, Loader2, RefreshCw, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { ChatMessage, PixData } from '../types';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';

function PixStatusIndicator({ txid }: { txid: string }) {
  const [status, setStatus] = useState<string>('ATIVA');
  const [loading, setLoading] = useState(false);

  const checkStatus = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/pix/status/${txid}`);
      setStatus(res.data.status);
    } catch (e) {
      console.error('Failed to check pix status', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
    // Poll every 5 seconds if not paid or expired
    const interval = setInterval(() => {
      if (status === 'ATIVA') {
        checkStatus();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [txid, status]);

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    'ATIVA': { label: 'Aguardando Pagamento', color: 'text-amber-600', bg: 'bg-amber-100' },
    'CONCLUIDA': { label: 'Pagamento Aprovado', color: 'text-emerald-700', bg: 'bg-emerald-100' },
    'REMOVIDA_PELO_USUARIO_RECEBEDOR': { label: 'Expirado', color: 'text-rose-600', bg: 'bg-rose-100' },
    'REMOVIDA_PELO_PSP': { label: 'Expirado', color: 'text-rose-600', bg: 'bg-rose-100' },
  };

  const config = statusConfig[status] || { label: status, color: 'text-slate-600', bg: 'bg-slate-100' };

  return (
    <div className="flex flex-col items-center gap-1 mt-2 w-full">
      <div className={`px-3 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-1.5 ${config.bg} ${config.color} transition-colors w-full justify-center`}>
        {status === 'ATIVA' && <Loader2 size={12} className="animate-spin" />}
        {status === 'CONCLUIDA' && <CheckCheck size={12} />}
        {config.label}
      </div>
    </div>
  );
}

function PixCopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full space-y-1 mt-1">
      <button 
        onClick={handleCopy}
        className={`w-full text-[10px] font-bold py-2 rounded uppercase tracking-tighter transition-all shadow-sm flex items-center justify-center gap-2 ${
          copied ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-emerald-600 text-white hover:bg-emerald-700'
        }`}
      >
        {copied ? (
          <>
            <Check size={14} />
            COPIADO!
          </>
        ) : (
          <>
            <RefreshCw size={12} className="animate-pulse" />
            Copiar Código Pix
          </>
        )}
      </button>
      <div 
        onClick={handleCopy}
        className="w-full text-[8px] sm:text-[9px] font-mono bg-slate-50 text-slate-500 py-2 px-2 rounded-lg border border-slate-200 break-all text-left cursor-pointer hover:bg-slate-100 transition-colors"
        title="Clique para copiar"
      >
        {code}
      </div>
    </div>
  );
}


export default function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attendantName, setAttendantName] = useState('Suporte StartPainel');
  const [attendantImage, setAttendantImage] = useState('https://cdn-icons-png.flaticon.com/512/4712/4712027.png');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadContacts = async () => {
    try {
      const res = await axios.get('/api/contacts');
      setContacts(res.data);
      // Auto-select first contact if none selected
      if (!selectedContact && res.data.length > 0) {
        // setSelectedContact(res.data[0]); // Optional auto-select
      }
    } catch (e) {}
  };

  const loadMessages = async () => {
    if (!selectedContact) {
      setMessages([]);
      return;
    }
    try {
      const res = await axios.get(`/api/messages?remoteJid=${selectedContact.remote_jid}`);
      setMessages(res.data);
    } catch (e) {}
  };

  useEffect(() => {
    loadContacts();
    const interval = setInterval(loadContacts, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 3000);
    return () => clearInterval(interval);
  }, [selectedContact]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [nameRes, imgRes] = await Promise.all([
          axios.get('/api/settings/attendant_name'),
          axios.get('/api/settings/attendant_image')
        ]);
        if (nameRes.data.value) setAttendantName(nameRes.data.value);
        if (imgRes.data.value) setAttendantImage(imgRes.data.value);
      } catch (e) {}
    };
    loadSettings();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e?: React.FormEvent | React.MouseEvent, imageFile?: File) => {
    if (e) e.preventDefault();
    if ((!inputText.trim() && !imageFile) || isLoading) return;

    let userMessage: any = {
      text: inputText,
      sender: 'attendant',
      type: 'text',
      createdAt: new Date().toISOString(),
      remoteJid: selectedContact?.remote_jid,
      contactName: selectedContact?.name
    };

    let parts: any[] = [];
    if (inputText.trim()) {
      parts.push({ text: inputText });
    }

    if (imageFile) {
      const base64 = await fileToBase64(imageFile);
      const mimeType = imageFile.type;
      userMessage.type = 'image';
      userMessage.imageData = base64;
      parts.push({
        inlineData: {
          data: base64.split(',')[1],
          mimeType: mimeType
        }
      });
    }

    // Optimistic UI Update
    setMessages(prev => [...prev, { ...userMessage, id: 'temp-' + Date.now() }]);

    setInputText('');
    setIsLoading(true);

    try {
      // 1. Add user message to DB
      await axios.post('/api/messages', userMessage);

      // 2. Call AI Support (Backend)
      // Prepare history including the current message if it has an image
      const recentMessages = messages.slice(-10).map(m => {
        const mParts: any[] = [{ text: m.text }];
        if (m.type === 'image' && m.imageData) {
          mParts.push({
            inlineData: {
              data: m.imageData.split(',')[1],
              mimeType: 'image/jpeg' 
            }
          });
        }
        return {
          role: (m.sender === 'ai' || m.sender === 'attendant') ? 'model' : 'user',
          parts: mParts
        };
      });

      // Add the current message's parts to history for the call
      recentMessages.push({
        role: 'user',
        parts: parts
      });
      
      const response = await axios.post('/api/chat', { 
        messages: recentMessages, 
        userInfo: { name: 'Cliente' } 
      });

      const aiResponse = response.data;
      let aiText = '';
      
      // Check for function calls
      if (aiResponse.functionCalls && aiResponse.functionCalls.length > 0) {
        const call = aiResponse.functionCalls[0];
        if (call.name === 'generate_pix') {
          const { username, amount } = call.args as any;
          aiText = `Gerando seu Pix no valor de R$ ${amount}...`;
          generatePix(username, amount);
        } else if (call.name === 'get_customer_info') {
          const { username } = call.args as any;
          aiText = await fetchCustomerInfo(username);
        }
      } else {
        aiText = aiResponse.text || 'Ocorreu um erro.';
      }

      const aiMessage = {
        text: aiText,
        sender: 'ai',
        type: 'text',
        remoteJid: selectedContact?.remote_jid,
        contactName: selectedContact?.name
      };

      await axios.post('/api/messages', aiMessage);

    } catch (error: any) {
      console.error('Error sending message:', error);
      const errorMessageText = error.response?.data?.error || error.message || 'Desculpe, ocorreu um erro ao processar sua mensagem.';
      
      await axios.post('/api/messages', {
        text: `⚠️ ${errorMessageText}`,
        sender: 'ai',
        type: 'text'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleSendMessage(undefined, file);
    }
  };

  const fetchCustomerInfo = async (username: string) => {
    try {
      const resp = await axios.get(`/api/customers/by-username/${username}`);
      const c = resp.data;
      
      let infoText = `Encontrei seus dados, ${c.username}!\n\n`;
      
      if (c.expiration_date) {
        const expDate = new Date(c.expiration_date).toLocaleDateString('pt-BR');
        infoText += `📅 *Vencimento:* ${expDate}\n\n`;
      }

      if (c.apps && c.apps.length > 0) {
        infoText += `📱 *Seus Aplicativos:* \n`;
        c.apps.forEach((app: any) => {
          infoText += `\n*${app.app_name}* (${app.app_model})\n`;
          if (app.access_type === 'mac_key') {
            infoText += `• MAC: \`${app.mac_address}\`\n• Key: \`${app.device_key}\`\n`;
          } else {
            infoText += `• Usuário: \`${app.username}\`\n• Senha: \`${app.password}\`\n`;
            if (app.provider_url) infoText += `• Host: \`${app.provider_url}\`\n`;
          }
          if (app.android_link) infoText += `• Android: ${app.android_link}\n`;
          if (app.ios_link) infoText += `• iPhone: ${app.ios_link}\n`;
        });
      } else {
        infoText += `Ainda não tenho aplicativos configurados para você.`;
      }
      
      return infoText;
    } catch (error) {
      return "Desculpe, não consegui encontrar os dados para esse usuário.";
    }
  };

  const generatePix = async (username: string, amount: number) => {
    try {
      const resp = await axios.post('/api/pix/create', { amount, username });
      const pixData = resp.data;
      
      await axios.post('/api/messages', {
        text: 'Aqui está seu QR Code para pagamento Pix:',
        sender: 'ai',
        type: 'pix_qr',
        metadata: pixData
      });
    } catch (error: any) {
      console.error('Pix error:', error);
      const errorData = error.response?.data;
      const errorMessageText = `⚠️ Erro ao gerar Pix: ${errorData?.error || error.message}${errorData?.details ? ` (${errorData.details})` : ''}`;
      
      await axios.post('/api/messages', {
        text: errorMessageText,
        sender: 'ai',
        type: 'text'
      });
    }
  };

  return (
    <div className="flex h-full bg-whatsapp-bg overflow-hidden relative">
      {/* Sidebar - Contacts List */}
      <div className={`${showSidebar ? 'flex' : 'hidden'} sm:flex flex-col w-full sm:w-80 bg-white border-r border-slate-200 z-30`}>
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-black text-slate-800 uppercase tracking-widest text-xs">Conversas</h2>
          <div className="flex gap-2">
             <button onClick={loadContacts} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
               <RefreshCw size={14} />
             </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {contacts.length === 0 && (
            <div className="p-10 text-center space-y-2">
              <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300">
                <Search size={20} />
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nenhum contato encontrado</p>
              <p className="text-[8px] text-slate-400">Aguarde mensagens ou envie a primeira pelo WhatsApp.</p>
            </div>
          )}
          
          {contacts.map(contact => (
            <div 
              key={contact.id}
              onClick={() => {
                setSelectedContact(contact);
                if (window.innerWidth < 640) setShowSidebar(false);
              }}
              className={`p-3 border-b border-slate-50 flex items-center gap-3 cursor-pointer transition-all hover:bg-slate-50 ${
                selectedContact?.remote_jid === contact.remote_jid ? 'bg-emerald-50/50 border-l-4 border-l-emerald-500' : ''
              }`}
            >
              <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 shrink-0 border border-slate-200 overflow-hidden shadow-sm">
                {contact.profile_pic ? <img src={contact.profile_pic} className="w-full h-full object-cover" /> : <User size={20} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <h4 className="text-xs font-black text-slate-800 truncate uppercase tracking-tight">{contact.name || contact.remote_jid.split('@')[0]}</h4>
                  <span className="text-[8px] font-bold text-slate-400 whitespace-nowrap">
                    {contact.last_message_time ? format(new Date(contact.last_message_time), 'HH:mm') : ''}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 truncate leading-tight flex items-center gap-1">
                   {contact.last_message || 'Sem mensagens'}
                </p>
              </div>
              {contact.unread_count > 0 && (
                <div className="w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center text-[8px] font-black text-white shadow-sm">
                  {contact.unread_count}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Content */}
      <div className={`flex-1 flex flex-col min-w-0 ${!showSidebar ? 'flex' : 'hidden sm:flex'}`}>
        {!selectedContact ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-[#f0f2f5] p-6 text-center space-y-4">
             <div className="w-20 h-20 bg-white rounded-full shadow-xl flex items-center justify-center text-whatsapp-teal animate-pulse">
                <MessageSquare size={40} />
             </div>
             <div className="space-y-1">
               <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">WhatsApp Multi-Chat</h3>
               <p className="text-[10px] text-slate-400 font-bold max-w-xs mx-auto">Selecione uma conversa na lista lateral para começar a responder seus clientes.</p>
             </div>
             <button onClick={() => setShowSidebar(true)} className="sm:hidden px-6 py-2 bg-whatsapp-teal text-white rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg">Ver Contatos</button>
          </div>
        ) : (
          <>
            {/* Chat Header - WhatsApp Style */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-whatsapp-teal shadow-md z-10">
              <div className="flex items-center space-x-2 sm:space-x-3">
                <button onClick={() => setShowSidebar(true)} className="sm:hidden p-1 text-white/80"><Search size={18} /></button>
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-200 overflow-hidden ring-1 ring-white/20 shrink-0">
                  <img src={selectedContact.profile_pic || attendantImage} className="w-full h-full object-cover" alt="avatar" />
                </div>
                <div className="flex flex-col min-w-0">
                  <h1 className="text-xs sm:text-sm font-bold text-white tracking-tight truncate">{selectedContact.name || selectedContact.remote_jid.split('@')[0]}</h1>
                  <p className="text-[9px] sm:text-[10px] text-white/80 flex items-center gap-1">
                    <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                    WhatsApp ({selectedContact.remote_jid.split('@')[0]})
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3 sm:space-x-5 text-white/80">
                <Search size={16} className="cursor-pointer hover:text-white transition-colors" />
                <MoreVertical size={16} className="cursor-pointer hover:text-white transition-colors" />
              </div>
            </div>

            {/* Chat Area - Scroll with Pattern */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 sm:space-y-3 chat-bg-pattern bg-whatsapp-bg scrollbar-hide flex flex-col"
            >
              <div className="self-center bg-[#e1f3fb] text-[8px] sm:text-[9px] px-2 sm:px-3 py-0.5 rounded shadow-sm uppercase font-bold text-slate-600 mb-1 sm:mb-2 border border-[#d1e3eb]">
                Mensagens de {selectedContact.name || 'Cliente'}
              </div>
              
              <AnimatePresence initial={false}>
                {messages.map((msg, idx) => (
                  <motion.div
                    key={msg.id || idx}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`flex ${msg.sender === 'customer' ? 'justify-start' : 'justify-end'}`}
                  >
                    <div 
                      className={`max-w-[85%] sm:max-w-[75%] p-2 shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] relative ${
                        msg.sender === 'customer' 
                          ? 'bg-white rounded-lg rounded-tl-none' 
                          : 'bg-whatsapp-light rounded-lg rounded-tr-none'
                      }`}
                    >
                      <div className={`absolute top-0 w-3 h-3 ${
                        msg.sender === 'customer' 
                          ? '-left-2.5 bg-white [clip-path:polygon(0_0,100%_0,100%_100%)]'
                          : '-right-2.5 bg-whatsapp-light [clip-path:polygon(0_0,0_100%,100%_0)]'
                      }`} />
                      
                      {msg.type === 'pix_qr' ? (
                        <div className="flex flex-col items-center space-y-1.5 p-0.5">
                          <p className="text-[11px] sm:text-xs font-bold text-slate-800 tracking-tight text-center">{msg.text}</p>
                          <div className="bg-white p-1.5 sm:p-2 rounded border border-slate-100 shadow-inner">
                            <img src={msg.metadata.qrcode_image} alt="Pix QR Code" className="w-32 h-32 sm:w-40 sm:h-40" />
                          </div>
                          <PixCopyButton code={msg.metadata.copy_paste} />
                          <p className="text-[8px] text-slate-400 italic text-center truncate w-full">ID: {msg.metadata.txid}</p>
                          <PixStatusIndicator txid={msg.metadata.txid} />
                        </div>
                      ) : msg.type === 'image' ? (
                        <div className="space-y-1.5">
                          <img src={msg.imageData} alt="Uploaded" className="rounded-lg max-w-full h-auto shadow-sm" />
                          {msg.text && <p className="text-[11px] sm:text-xs text-slate-800 leading-snug">{msg.text}</p>}
                        </div>
                      ) : (
                        <div className={`text-[11px] sm:text-xs leading-snug whitespace-pre-wrap ${
                          msg.text.includes('[SISTEMA]') ? 'text-emerald-700 font-bold italic' : 'text-slate-800'
                        } prose prose-sm prose-slate max-w-none prose-p:my-0.5 prose-headings:my-1 prose-ul:my-0.5 prose-li:my-0`}>
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                        </div>
                      )}
                      
                      <div className="flex items-center justify-end space-x-1 mt-0.5">
                        <span className={`text-[8px] sm:text-[9px] ${msg.sender === 'customer' ? 'text-slate-400' : 'text-slate-500'}`}>
                          {msg.createdAt 
                            ? format(new Date(msg.createdAt), 'HH:mm') 
                            : format(new Date(), 'HH:mm')}
                        </span>
                        {msg.sender !== 'customer' && (
                          <CheckCheck size={10} className="text-emerald-500 sm:w-3 sm:h-3" />
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white rounded-xl rounded-tl-none p-3 shadow-sm border border-slate-100 flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">IA digitando</span>
                    <div className="flex space-x-1">
                      <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" />
                      <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                      <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="min-h-[55px] sm:min-h-[50px] bg-[#f0f0f0] flex items-center px-2 sm:px-3 pt-1.5 pb-[calc(env(safe-area-inset-bottom)+8px)] sm:pb-1.5 gap-1.5 sm:gap-2 border-t border-slate-300">
              <button className="p-1 text-slate-500 hover:text-slate-700 transition-colors hidden sm:block">
                <Smile size={22} />
              </button>
              <button className="p-1.5 text-slate-500 hover:text-slate-700 transition-colors transform -rotate-45 shrink-0" onClick={() => fileInputRef.current?.click()}>
                <Paperclip size={20} className="sm:w-[22px] sm:h-[22px]" />
              </button>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
              <div className="flex-1">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Digite aqui..."
                  className="w-full bg-white border-none rounded-full px-3 sm:px-4 py-1.5 text-[11px] sm:text-xs focus:ring-0 placeholder:text-slate-400 text-slate-800"
                />
              </div>
              <button 
                onClick={handleSendMessage}
                disabled={!inputText.trim() || isLoading}
                className={`p-2 rounded-full transition-all shrink-0 ${
                  inputText.trim() ? 'bg-whatsapp-teal text-white shadow-md active:scale-95' : 'text-slate-400'
                }`}
              >
                <Send size={18} className="sm:w-5 sm:h-5" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
