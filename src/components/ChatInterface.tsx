import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, User, Bot, Check, CheckCheck, Paperclip, MoreVertical, Search, Smile, Loader2, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { ChatMessage, PixData } from '../types';
import axios from 'axios';
import { db } from '../lib/firebase';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';

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

import { chatWithAI } from '../services/geminiService';

export default function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // In a real app, we'd use a specific chatId
    const q = query(
      collection(db, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
      setMessages(msgs);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      text: inputText,
      sender: 'user',
      type: 'text',
      createdAt: serverTimestamp()
    };

    setInputText('');
    setIsLoading(true);

    try {
      // 1. Add user message to Firestore
      await addDoc(collection(db, 'messages'), userMessage);

      // 2. Call AI Support (Frontend with Gemini)
      const chatHistory = messages.slice(-5).map(m => ({ 
        role: m.sender === 'user' ? 'user' : 'model', 
        parts: [{ text: m.text }] 
      }));
      
      const response = await chatWithAI(chatHistory, { name: 'Cliente' });

      let aiText = '';
      
      // Check for function calls
      if (response.functionCalls && response.functionCalls.length > 0) {
        const call = response.functionCalls[0];
        if (call.name === 'generate_pix') {
          const { username, amount } = call.args as any;
          aiText = `Gerando seu Pix no valor de R$ ${amount}...`;
          generatePix(username, amount);
        }
      } else {
        aiText = response.text || 'Ocorreu um erro.';
      }

      const aiMessage: ChatMessage = {
        text: aiText,
        sender: 'ai',
        type: 'text',
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'messages'), aiMessage);

    } catch (error: any) {
      console.error('Error sending message:', error);
      const errorMessageText = error.message || 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.';
      const errorMessage: ChatMessage = {
        text: `⚠️ ${errorMessageText}`,
        sender: 'ai',
        type: 'text',
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, 'messages'), errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const generatePix = async (username: string, amount: number) => {
    try {
      const resp = await axios.post('/api/pix/create', { amount, username });
      const pixData = resp.data;
      
      const pixMessage: ChatMessage = {
        text: 'Aqui está seu QR Code para pagamento Pix:',
        sender: 'ai',
        type: 'pix_qr',
        metadata: pixData,
        createdAt: serverTimestamp()
      };
      
      await addDoc(collection(db, 'messages'), pixMessage);
    } catch (error: any) {
      console.error('Pix error:', error);
      const errorData = error.response?.data;
      const errorMessageText = `⚠️ Erro ao gerar Pix: ${errorData?.error || error.message}${errorData?.details ? ` (${errorData.details})` : ''}`;
      
      const errorMessage: ChatMessage = {
        text: errorMessageText,
        sender: 'ai',
        type: 'text',
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, 'messages'), errorMessage);
    }
  };

  return (
    <div className="flex flex-col h-full bg-whatsapp-bg">
      {/* Chat Header - WhatsApp Style */}
      <div className="flex items-center justify-between px-4 py-2 bg-whatsapp-teal shadow-md z-10">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden ring-1 ring-white/20">
            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Support" alt="avatar" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm font-bold text-white tracking-tight">Suporte StartPainel</h1>
            <p className="text-[10px] text-white/80 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              Online - Suporte Ativo
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-5 text-white/80">
          <Search size={18} className="cursor-pointer hover:text-white transition-colors" />
          <MoreVertical size={18} className="cursor-pointer hover:text-white transition-colors" />
        </div>
      </div>

      {/* Chat Area - Scroll with Pattern */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 chat-bg-pattern bg-whatsapp-bg scrollbar-hide flex flex-col"
      >
        <div className="self-center bg-[#e1f3fb] text-[9px] px-3 py-0.5 rounded shadow-sm uppercase font-bold text-slate-600 mb-2 border border-[#d1e3eb]">
          Hoje
        </div>
        
        <AnimatePresence initial={false}>
          {messages.map((msg, idx) => (
            <motion.div
              key={msg.id || idx}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`max-w-[75%] p-2 shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] relative ${
                  msg.sender === 'user' 
                    ? 'bg-whatsapp-light rounded-l-xl rounded-br-xl rounded-tr-none' 
                    : 'bg-white rounded-r-xl rounded-bl-xl rounded-tl-none'
                }`}
              >
                {msg.type === 'pix_qr' ? (
                  <div className="flex flex-col items-center space-y-2 p-1">
                    <p className="text-xs font-bold text-slate-800 tracking-tight">{msg.text}</p>
                    <div className="bg-white p-2 rounded border border-slate-100 shadow-inner">
                      <img src={msg.metadata.qrcode_image} alt="Pix QR Code" className="w-40 h-40" />
                    </div>
                    
                    <PixCopyButton code={msg.metadata.copy_paste} />

                    <p className="text-[9px] text-slate-400 italic text-center">ID: {msg.metadata.txid}</p>
                    <PixStatusIndicator txid={msg.metadata.txid} />
                  </div>
                ) : (
                  <p className={`text-xs leading-snug whitespace-pre-wrap ${
                    msg.text.includes('[SISTEMA]') ? 'text-emerald-700 font-bold italic' : 'text-slate-800'
                  }`}>
                    {msg.text}
                  </p>
                )}
                
                <div className="flex items-center justify-end space-x-1 mt-1">
                  <span className={`text-[9px] ${msg.sender === 'user' ? 'text-slate-500' : 'text-slate-400'}`}>
                    {msg.createdAt && typeof msg.createdAt.toDate === 'function' 
                      ? format(msg.createdAt.toDate(), 'HH:mm') 
                      : format(new Date(), 'HH:mm')}
                  </span>
                  {msg.sender === 'user' && (
                    <CheckCheck size={12} className="text-emerald-500" />
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white rounded-lg rounded-tl-none p-2 shadow-sm">
              <div className="flex space-x-1">
                <div className="w-1 h-1 bg-slate-300 rounded-full animate-bounce" />
                <div className="w-1 h-1 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                <div className="w-1 h-1 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Area - High Density */}
      <div className="h-14 bg-[#f0f0f0] flex items-center px-3 gap-2 border-t border-slate-300">
        <button className="p-1.5 text-slate-500 hover:text-slate-700 transition-colors">
          <Smile size={22} />
        </button>
        <button className="p-1.5 text-slate-500 hover:text-slate-700 transition-colors transform -rotate-45">
          <Paperclip size={22} />
        </button>
        <div className="flex-1">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Digite uma mensagem"
            className="w-full bg-white border-none rounded-full px-4 py-1.5 text-xs focus:ring-0 placeholder:text-slate-400 text-slate-800"
          />
        </div>
        <button 
          onClick={handleSend}
          disabled={!inputText.trim() || isLoading}
          className={`p-2 rounded-full transition-all ${
            inputText.trim() 
              ? 'bg-whatsapp-teal text-white shadow-md active:scale-95' 
              : 'text-slate-400'
          }`}
        >
          <Send size={20} />
        </button>
      </div>
    </div>
  );
}
