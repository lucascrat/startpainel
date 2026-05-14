import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Customer, CustomerApp } from '../types';
import { authFetch } from '../lib/auth';
import { toast } from 'sonner';
import { 
  Plus, Trash2, User, RefreshCw, Smartphone, CheckCircle, 
  Brain, Save, Key, QrCode, DollarSign, TrendingUp, 
  Tv, Monitor, Globe, ChevronRight, Calendar, Info, X, Eye,
  Cpu, ExternalLink, Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';

export default function AdminPanel() {
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'financial' | 'automations' | 'ai' | 'startflix'>('users');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [financials, setFinancials] = useState<any>(null);
  const [startflixUsers, setStartflixUsers] = useState<any[]>([]);
  const [startflixPayments, setStartflixPayments] = useState<any[]>([]);
  const [isSyncingStartflix, setIsSyncingStartflix] = useState(false);
  
  // Search and Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired'>('all');
  
  // New Customer Form
  const [newUsername, setNewUsername] = useState('');
  const [newName, setNewName] = useState('');
  const [newRenewalPrice, setNewRenewalPrice] = useState('49.90');
  const [newLinesCount, setNewLinesCount] = useState('1');
  const [newWhatsapp, setNewWhatsapp] = useState('');
  const [newExpirationDate, setNewExpirationDate] = useState('');
  const [newPlaylistUrl, setNewPlaylistUrl] = useState('');
  
  // App Management
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [isAppModalOpen, setIsAppModalOpen] = useState(false);
  const [viewingApp, setViewingApp] = useState<CustomerApp | null>(null);
  const [isEditingApp, setIsEditingApp] = useState(false);
  
  // New App Form
  const [appName, setAppName] = useState('');
  const [appModel, setAppModel] = useState('IBO PLAYER');
  const [accessType, setAccessType] = useState<'mac_key' | 'user_pass' | 'xtream'>('mac_key');
  const [macAddress, setMacAddress] = useState('');
  const [deviceKey, setDeviceKey] = useState('');
  const [appUsername, setAppUsername] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [providerUrl, setProviderUrl] = useState('');
  const [appHost, setAppHost] = useState('');
  const [androidLink, setAndroidLink] = useState('');
  const [iosLink, setIosLink] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [appSiteUrl, setAppSiteUrl] = useState('');
  const [defaultCostPerLine, setDefaultCostPerLine] = useState('5.00');
  const [isTv, setIsTv] = useState(true);
  
  // Automations
  const [automations, setAutomations] = useState<any[]>([]);
  const [autoName, setAutoName] = useState('');
  const [autoSiteUrl, setAutoSiteUrl] = useState('');
  const [autoUser, setAutoUser] = useState('');
  const [autoPass, setAutoPass] = useState('');
  const [autoType, setAutoType] = useState('ibo_player');

  const [autoCreateCms, setAutoCreateCms] = useState(false);
  const [autoActivateStartflix, setAutoActivateStartflix] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [geminiKey, setGeminiKey] = useState('');
  const [geminiKeyMasked, setGeminiKeyMasked] = useState<string | null>(null);
  const [geminiKeyConfigured, setGeminiKeyConfigured] = useState(false);
  const [attendantName, setAttendantName] = useState('Suporte StartPainel');
  const [attendantImage, setAttendantImage] = useState('https://cdn-icons-png.flaticon.com/512/4712/4712027.png');
  const [aiSystemPrompt, setAiSystemPrompt] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [dbStatus, setDbStatus] = useState<{status: string, error?: string}>({status: 'checking'});
  const [aiUsageData, setAiUsageData] = useState<{summary: any, recent: any[], daily?: any[], byModel?: any[]}>({summary: {}, recent: []});
  // Queue agora vem do backend como objetos completos. workerOnline = PC com 'npm run worker'
  // mandou heartbeat nos ultimos 30s.
  type QueueJob = { id: number; type: string; status: string; payload?: any; error?: string };
  type QueueStatus = {
    pending: QueueJob[];
    processing: QueueJob | null;
    recent?: QueueJob[];
    isBusy: boolean;
    workerOnline?: boolean;
    workers?: any[];
  };
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({pending: [], processing: null, isBusy: false, workerOnline: false});

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (activeSubTab === 'automations') {
      loadAutomations();
    }
    if (activeSubTab === 'ai') {
      loadAiUsage();
    }
    if (activeSubTab === 'startflix') {
      loadStartflixUsers();
      loadStartflixPayments();
    }
  }, [activeSubTab]);

  const loadStartflixUsers = async () => {
    try {
      const response = await fetch('/api/startflix/users');
      const data = await response.json();
      setStartflixUsers(Array.isArray(data) ? data : []);
    } catch (error) {}
  };

  const loadStartflixPayments = async () => {
    try {
      const response = await fetch('/api/startflix/payments');
      const data = await response.json();
      setStartflixPayments(Array.isArray(data) ? data : []);
    } catch (error) {}
  };

  const handleSyncStartflix = async (username: string, expirationDate: string) => {
    setIsSyncingStartflix(true);
    const pending = toast.loading(`Sincronizando ${username} com Startflix...`);
    try {
      const response = await fetch('/api/startflix/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, expirationDate })
      });
      const data = await response.json();
      toast.dismiss(pending);
      if (data.success) {
        toast.success(`${username} sincronizado com sucesso!`);
        if (activeSubTab === 'startflix') loadStartflixUsers();
      } else {
        toast.error(`Erro ao sincronizar: ${data.error}`);
      }
    } catch (error: any) {
      toast.dismiss(pending);
      toast.error(`Erro: ${error.message}`);
    } finally {
      setIsSyncingStartflix(false);
    }
  };

  const loadAiUsage = async () => {
    try {
      const response = await fetch('/api/ai-usage');
      const data = await response.json();
      setAiUsageData(data);
    } catch (error) {}
  };

  useEffect(() => {
    if (appModel === 'ULTRA PLAYER') {
      setIconUrl('https://d2j6dbq0eux0bg.cloudfront.net/images/37357712/5068789407.jpg');
    }
  }, [appModel]);

  const loadAll = async () => {
    await Promise.all([
      checkDb(),
      loadSettings(),
      loadCustomers(),
      loadFinancials(),
      loadAutomations(),
      loadStartflixUsers(),
      loadStartflixPayments()
    ]);
  };

  const checkDb = async () => {
    try {
      const response = await fetch('/api/db-status');
      const data = await response.json();
      setDbStatus(data);
    } catch (error) {
      setDbStatus({status: 'error'});
    }
  };

  const loadSettings = async () => {
    try {
      const resKey = await authFetch('/api/settings/gemini_api_key');
      const dataKey = await resKey.json();
      setGeminiKeyConfigured(!!dataKey.configured);
      setGeminiKeyMasked(dataKey.masked ?? null);

      const resCost = await authFetch('/api/settings/default_cost_per_line');
      const dataCost = await resCost.json();
      if (dataCost.value) setDefaultCostPerLine(dataCost.value);

      const resName = await authFetch('/api/settings/attendant_name');
      const dataName = await resName.json();
      if (dataName.value) setAttendantName(dataName.value);

      const resImg = await authFetch('/api/settings/attendant_image');
      const dataImg = await resImg.json();
      if (dataImg.value) setAttendantImage(dataImg.value);

      const resPrompt = await authFetch('/api/settings/ai_system_prompt');
      const dataPrompt = await resPrompt.json();
      if (dataPrompt.value) setAiSystemPrompt(dataPrompt.value);
    } catch (error) {}
  };

  const loadQueueStatus = async () => {
    try {
      const response = await fetch('/api/panel/queue');
      const data = await response.json();
      setQueueStatus(data);
    } catch (error) {}
  };

  useEffect(() => {
    const interval = setInterval(loadQueueStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadAutomations = async () => {
    try {
      const response = await fetch('/api/automations');
      const data = await response.json();
      setAutomations(data);
    } catch (error) {}
  };

  const loadCustomers = async () => {
    try {
      const response = await fetch('/api/customers');
      const data = await response.json();
      setCustomers(Array.isArray(data) ? data : []);
    } catch (error) {
      setCustomers([]);
    }
  };

  const loadFinancials = async () => {
    try {
      const response = await fetch('/api/financials');
      const data = await response.json();
      setFinancials(data);
    } catch (error) {}
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;
    setIsLoading(true);
    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername,
          name: newName,
          whatsapp: newWhatsapp,
          renewalPrice: parseFloat(newRenewalPrice),
          linesCount: parseInt(newLinesCount),
          costPerCredit: parseFloat(defaultCostPerLine),
          expirationDate: newExpirationDate || null
        })
      });
      
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.details || errData.error || 'Erro ao cadastrar');
      }

      setNewUsername('');
      setNewName('');
      setNewWhatsapp('');
      setNewExpirationDate('');
      setNewLinesCount('1');
      setNewPlaylistUrl('');
      setStatusFilter('all');
      setSearchTerm('');
      loadCustomers();

      if (autoCreateCms) {
        toast.success('Cliente local cadastrado! Iniciando automação no StartPainel para buscar a M3U...');
        try {
          const cmsResponse = await fetch('/api/automations/startpainel/create-client', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: newUsername })
          });
          const cmsData = await cmsResponse.json();
          if (cmsData.success) {
            toast.success(`Sucesso no StartPainel!\nURL M3U copiada para a área de transferência:\n${cmsData.playlistUrl}`);
            navigator.clipboard.writeText(cmsData.playlistUrl);
          } else {
            toast.error(`Erro na automação do StartPainel: ${cmsData.message}`);
          }
        } catch (err: any) {
          toast.error(`Erro na comunicação com o robô: ${err.message}`);
        }
      }

      if (autoActivateStartflix) {
        handleSyncStartflix(newUsername, newExpirationDate);
      }

      toast.success('Cliente cadastrado com sucesso!');
    } catch (error: any) {
      toast.error(`Erro: ${error.message}`);
    } finally { setIsLoading(false); }
  };

  const handleAddApp = async () => {
    if (!selectedCustomerId) return;
    if (!appName.trim()) {
      toast.error('Por favor, preencha o campo Identificação (ex: TV Sala)');
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`/api/customers/${selectedCustomerId}/apps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appName, appModel, accessType, macAddress, deviceKey,
          appUsername, appPassword, providerUrl, host: appHost,
          androidLink, iosLink, iconUrl, appSiteUrl, isTv
        })
      });
      if (response.ok) {
        setAppName('');
        setMacAddress('');
        setAppUsername('');
        setAppPassword('');
        setDeviceKey('');
        setProviderUrl('');
        setAppHost('');
        setAndroidLink('');
        setIosLink('');
        setIconUrl('');
        setAppSiteUrl('');
        loadCustomers();
        toast.success('App cadastrado com sucesso!');
      } else {
        const errData = await response.json();
        toast.error(`Erro ao cadastrar app: ${errData.details || errData.error}`);
      }
    } catch (error: any) {
      toast.error(`Erro: ${error.message}`);
    } finally { setIsLoading(false); }
  };

  // Upload de imagem pro R2 via /api/upload. Backend espera JSON com:
  //   { data: <base64-puro>, mimeType: <image/*>, prefix: 'icons' }
  // E exige Bearer token admin — por isso authFetch (nao fetch).
  const handleUploadIcon = async (file: File, isEditing = false) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione um arquivo de imagem.');
      return;
    }
    const MAX_BYTES = 5 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      toast.error(`Imagem muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo 5MB.`);
      return;
    }
    setIsLoading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
      const res = await authFetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: base64, mimeType: file.type, prefix: 'icons' }),
      });
      const json = await res.json().catch(() => ({}));
      console.log('[Upload] status=', res.status, 'response=', json);
      if (!res.ok || !json.url) {
        throw new Error(json.error || json.message || `HTTP ${res.status}`);
      }
      const url = json.url as string;
      if (json.storage === 'inline-fallback' && json.r2Error) {
        const code = json.r2Error?.code || json.r2Error?.name || 'Erro';
        const msg = json.r2Error?.message || 'sem detalhes';
        toast.warning(`R2 falhou (${code}): ${msg}. Imagem salva inline.`, { duration: 8000 });
      }
      if (isEditing && viewingApp) {
        setViewingApp({ ...viewingApp, icon_url: url });
      } else {
        setIconUrl(url);
      }
    } catch (err: any) {
      console.error('[Upload] erro:', err);
      toast.error(`Erro ao subir imagem: ${err?.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteApp = async (appId: number) => {
    if (!confirm('Deseja excluir este acesso?')) return;
    try {
      await fetch(`/api/apps/${appId}`, { method: 'DELETE' });
      if (viewingApp?.id === appId) setViewingApp(null);
      loadCustomers();
    } catch (error) {}
  };

  const handleUpdateApp = async () => {
    if (!viewingApp) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/apps/${viewingApp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(viewingApp)
      });
      if (response.ok) {
        setIsEditingApp(false);
        loadCustomers();
        toast.success('App atualizado com sucesso!');
      } else {
        const errData = await response.json();
        toast.error(`Erro ao atualizar app: ${errData.details || errData.error}`);
      }
    } catch (error: any) {
      toast.error(`Erro: ${error.message}`);
    } finally { setIsLoading(false); }
  };

  const handleDeleteCustomer = async (id: number) => {
    if (!confirm('Excluir cliente?')) return;
    try {
      await fetch(`/api/customers/${id}`, { method: 'DELETE' });
      loadCustomers();
    } catch (error) {}
  };

  const handleSaveFinancial = async (customer: Customer, field: string, value: any) => {
    try {
      await fetch(`/api/customers/${customer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...customer, [field]: value })
      });
      loadCustomers();
      loadFinancials();
    } catch (error) {}
  };

  const handleSaveSettings = async () => {
    setIsSavingKey(true);
    try {
      const saveSetting = (key: string, value: string) => authFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
      });

      // Only update Gemini key when admin actually typed a new value.
      if (geminiKey.trim().length > 0) {
        await saveSetting('gemini_api_key', geminiKey.trim());
        setGeminiKey('');
      }
      await saveSetting('default_cost_per_line', defaultCostPerLine);
      await saveSetting('attendant_name', attendantName);
      await saveSetting('attendant_image', attendantImage);
      await saveSetting('ai_system_prompt', aiSystemPrompt);
      toast.success('Configurações salvas!');
      loadSettings();
    } catch (error) {} finally { setIsSavingKey(false); }
  };

  const handleBroadcast = async () => {
    if (!broadcastMessage.trim()) return;
    if (!confirm(`Deseja enviar este comunicado para TODOS os ${customers.length} clientes?`)) return;
    
    setIsBroadcasting(true);
    try {
      const response = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: broadcastMessage })
      });
      if (response.ok) {
        toast.success('Disparo iniciado em segundo plano! As mensagens chegarão aos poucos para evitar bloqueios.');
        setBroadcastMessage('');
      }
    } catch (error) {
      toast.error('Erro ao iniciar disparo.');
    } finally { setIsBroadcasting(false); }
  };

  const handleAddAutomation = async () => {
    if (!autoName || !autoSiteUrl) return;
    setIsLoading(true);
    try {
      await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: autoName, siteUrl: autoSiteUrl, username: autoUser, password: autoPass, type: autoType })
      });
      setAutoName(''); setAutoSiteUrl(''); setAutoUser(''); setAutoPass('');
      loadAutomations();
    } catch (error) {} finally { setIsLoading(false); }
  };

  const handleDeleteAutomation = async (id: number) => {
    if (!confirm('Excluir automação?')) return;
    try {
      await fetch(`/api/automations/${id}`, { method: 'DELETE' });
      loadAutomations();
    } catch (error) {}
  };

  // Generaliza ativacao de player no CMS (Ultra Player, Fun Play, etc).
  // Worker no PC abre Chrome visivel, navega no CMS e ativa.
  const handleActivatePlayer = async (
    username: string,
    mac: string,
    playerType: 'ultra' | 'funplay',
    playerLabel: string,
  ) => {
    if (!mac) {
      toast.error('Este aplicativo precisa de MAC Address para ativação.');
      return;
    }
    setIsLoading(true);
    const endpoint = playerType === 'funplay'
      ? '/api/automations/startpainel/activate-funplay'
      : '/api/automations/startpainel/activate-ultra';
    // Toast persistente avisando que o robo vai abrir Chrome no PC. Substituido pelo
    // resultado quando o job terminar (5min max). NAO usa await — fire-and-forget
    // visualmente, mas a promise abaixo decide o toast final.
    const pending = toast.loading(`Ativando ${playerLabel}... olhe seu Chrome 👀 (até 5min)`);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, mac }),
      });
      const data = await response.json().catch(() => ({}));
      toast.dismiss(pending);
      if (data.success) {
        toast.success(`${playerLabel} ativado com sucesso no CMS!`);
      } else {
        // Mensagem ja vem amigavel do worker (ex: 'Cliente X nao encontrado no painel CMS')
        toast.error(data.message || 'Falha na automação.');
      }
    } catch (error: any) {
      toast.dismiss(pending);
      toast.error(`Erro: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Wrappers de retrocompat — usados pelo botao existente.
  const handleRunUltraPlayer = (username: string, mac: string) =>
    handleActivatePlayer(username, mac, 'ultra', 'Ultra Player');
  const handleRunFunPlay = (username: string, mac: string) =>
    handleActivatePlayer(username, mac, 'funplay', 'Fun Play');

  // Generaliza atualizacao de lista IBO via robo (IBO PRO ou IBO PLAYER classico).
  // Backend busca M3U + MAC + Key pelo username.
  const handleRunIboAutomation = async (
    username: string,
    variant: 'pro' | 'player',
    label: string,
    siteUrl: string,
  ) => {
    if (!username) {
      toast.error('Username do cliente nao identificado.');
      return;
    }
    const endpoint = variant === 'pro'
      ? '/api/automations/iboproapp/setup'
      : '/api/automations/iboplayer/setup';
    setIsLoading(true);
    const pending = toast.loading(`Atualizando lista no ${siteUrl}... olha seu Chrome 👀 (até 5min)`);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const data = await response.json().catch(() => ({}));
      toast.dismiss(pending);
      if (data.success) {
        toast.success(data.message || `Lista ${label} atualizada com sucesso!`);
      } else {
        toast.error(data.message || data.error || `Falha na automação ${label}.`);
      }
    } catch (error: any) {
      toast.dismiss(pending);
      toast.error(`Erro: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };
  const handleRunIboPro = (username: string) =>
    handleRunIboAutomation(username, 'pro', 'IBO Pro', 'iboproapp.com');
  const handleRunIboPlayer = (username: string) =>
    handleRunIboAutomation(username, 'player', 'IBO Player', 'iboplayer.com');

  const handleRunAutomation = async (auto: any, mac: string, key: string, playlistUrl: string, targetUrl?: string) => {
    if (!mac || !key) {
      toast.error('Este aplicativo precisa de MAC e Device Key para esta automação.');
      return;
    }
    
    setIsLoading(true);
    try {
      const response = await fetch('/api/automations/ibo/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mac, key, playlistUrl, targetUrl })
      });
      const data = await response.json();
      if (data.success) {
        toast.success('Automação iniciada! Verifique o navegador aberto no seu computador.');
      } else {
        toast.error(`Erro na automação: ${data.message}`);
      }
    } catch (error: any) {
      toast.error(`Erro: ${error.message}`);
    } finally { setIsLoading(false); }
  };

  const handleRunIBOPro = async (mac: string, key: string, playlistUrl: string) => {
    if (!mac || !key) {
      toast.error('Este aplicativo precisa de MAC e Device Key para esta automação.');
      return;
    }
    
    setIsLoading(true);
    try {
      const response = await fetch('/api/automations/ibopro/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mac, key, playlistUrl })
      });
      const data = await response.json();
      if (data.success) {
        toast.success('Automação IBO Pro iniciada!');
      } else {
        toast.error(`Erro na automação: ${data.message}`);
      }
    } catch (error: any) {
      toast.error(`Erro: ${error.message}`);
    } finally { setIsLoading(false); }
  };

  const handleRunIBORepair = async (mac: string, key: string, playlistUrl: string) => {
    if (!mac || !key || !playlistUrl) {
      toast.error('Dados incompletos para reparo (MAC, Key ou Playlist).');
      return;
    }
    setIsLoading(true);
    const pending = toast.loading('Reparando lista no iboplayer.com... olha seu Chrome 👀');
    try {
      const response = await fetch('/api/automations/ibo/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mac, key, playlistUrl })
      });
      const data = await response.json();
      toast.dismiss(pending);
      if (data.success) {
        toast.success(data.message || 'Reparo concluído com sucesso!');
      } else {
        toast.error(data.message || 'Falha no reparo automatizado.');
      }
    } catch (error: any) {
      toast.dismiss(pending);
      toast.error(`Erro: ${error.message}`);
    } finally { setIsLoading(false); }
  };

  const handleManualRenewal = async (username: string) => {
    if (!confirm(`Deseja renovar manualmente o cliente ${username}?`)) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/panel/renew/${username}`, { method: 'POST' });
      const data = await response.json();
      toast.error(data.message || data.error);
    } catch (error: any) {
      toast.error(`Erro: ${error.message}`);
    } finally { setIsLoading(false); }
  };

  return (
    <div className="p-2 sm:p-4 bg-slate-50 min-h-full">
      <div className="max-w-5xl mx-auto space-y-4 pb-20">
        
        {/* Header with Navigation */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-lg shrink-0">
                <Brain size={20} className="text-emerald-400" />
              </div>
              <div>
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-tighter">StartPainel Admin</h2>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${dbStatus.status === 'connected' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{dbStatus.status}</span>
                  </div>
                  {queueStatus.isBusy && (
                    <div className="flex items-center gap-1.5 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                      <RefreshCw size={10} className="text-amber-500 animate-spin" />
                      <span className="text-[8px] text-amber-600 font-black uppercase tracking-widest">
                        Processando: {queueStatus.processing?.type} {queueStatus.pending.length > 0 ? `(+${queueStatus.pending.length})` : ''}
                      </span>
                    </div>
                  )}
                  {/* Indicador de worker (PC) online/offline — so mostra quando ha jobs OU PC offline. */}
                  {(queueStatus.pending.length > 0 || queueStatus.isBusy || queueStatus.workerOnline === false) && (
                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${
                      queueStatus.workerOnline
                        ? 'bg-emerald-50 border-emerald-100'
                        : 'bg-rose-50 border-rose-100'
                    }`} title={queueStatus.workerOnline ? 'PC com worker online' : 'PC offline — automacoes nao vao executar ate o worker voltar'}>
                      <span className={`w-1.5 h-1.5 rounded-full ${queueStatus.workerOnline ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`} />
                      <span className={`text-[8px] font-black uppercase tracking-widest ${queueStatus.workerOnline ? 'text-emerald-700' : 'text-rose-700'}`}>
                        PC {queueStatus.workerOnline ? 'online' : 'offline'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
              <button 
                onClick={() => setActiveSubTab('users')}
                className={`flex-1 sm:flex-none px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeSubTab === 'users' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Clientes
              </button>
              <button 
                onClick={() => setActiveSubTab('financial')}
                className={`flex-1 sm:flex-none px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeSubTab === 'financial' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Financeiro
              </button>
              <button 
                onClick={() => setActiveSubTab('automations')}
                className={`flex-1 sm:flex-none px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeSubTab === 'automations' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Automações
              </button>
              <button 
                onClick={() => setActiveSubTab('ai')}
                className={`flex-1 sm:flex-none px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeSubTab === 'ai' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Dashboard IA
              </button>
              <button 
                onClick={() => setActiveSubTab('startflix')}
                className={`flex-1 sm:flex-none px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeSubTab === 'startflix' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Startflix
              </button>
            </div>
                     </div>
          </div>
        </div>

        {/* Dynamic Sub-Tab Content */}
        {(() => {
          switch (activeSubTab) {
            case 'users':
              return (
                <div className="space-y-4">
                  {/* Quick Actions / Add Customer */}
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-50 pb-3">
                      <Plus size={16} className="text-emerald-500" />
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Novo Cliente</h3>
                    </div>
                    <form onSubmit={handleAddCustomer} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Usuário do Painel</label>
                        <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="ex: marcos_pro" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500 outline-none" required />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Cliente</label>
                        <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="ex: Marcos Silva" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500 outline-none" required />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">WhatsApp</label>
                        <input type="text" value={newWhatsapp} onChange={e => setNewWhatsapp(e.target.value)} placeholder="1199999999" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500 outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Vencimento</label>
                        <input type="date" value={newExpirationDate} onChange={e => setNewExpirationDate(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500 outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Linhas</label>
                        <input type="number" value={newLinesCount} onChange={e => setNewLinesCount(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500 outline-none" />
                      </div>
                      <div className="sm:col-span-2 lg:col-span-4 space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">URL da Lista M3U Principal</label>
                        <input type="url" value={newPlaylistUrl} onChange={e => setNewPlaylistUrl(e.target.value)} placeholder="http://painel.com/get.php?username=..." className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-emerald-500 outline-none" />
                      </div>
                      <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-2 mt-2">
                        <input 
                          type="checkbox" 
                          id="autoCreateCms" 
                          checked={autoCreateCms} 
                          onChange={e => setAutoCreateCms(e.target.checked)}
                          className="w-4 h-4 text-emerald-500 rounded border-slate-300 focus:ring-emerald-500"
                        />
                        <label htmlFor="autoCreateCms" className="text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer">
                          Criar cliente também no StartPainel CMS e pegar Lista M3U (Robô)
                        </label>
                      </div>
                      <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-2 mt-1">
                        <input 
                          type="checkbox" 
                          id="autoActivateStartflix" 
                          checked={autoActivateStartflix} 
                          onChange={e => setAutoActivateStartflix(e.target.checked)}
                          className="w-4 h-4 text-blue-500 rounded border-slate-300 focus:ring-blue-500"
                        />
                        <label htmlFor="autoActivateStartflix" className="text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer">
                          Ativar Startflix (Supabase) automaticamente para este cliente
                        </label>
                      </div>
                      <button type="submit" disabled={isLoading} className="bg-slate-900 text-white h-11 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-100 sm:col-span-2 lg:col-span-4">
                        {isLoading ? <RefreshCw className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                        Cadastrar Cliente
                      </button>
                    </form>
                  </motion.div>

                  {/* AI & Branding Config */}
                  <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl space-y-6">
                    <div className="flex items-center gap-2 border-b border-slate-800 pb-4">
                      <Brain size={18} className="text-emerald-400" />
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Personalização & IA</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">
                          Chave API Gemini {geminiKeyConfigured && <span className="text-emerald-400 normal-case tracking-normal">• configurada ({geminiKeyMasked})</span>}
                        </label>
                        <div className="flex items-center gap-3 bg-slate-800/50 p-3 rounded-2xl border border-slate-700">
                          <Key size={18} className="text-emerald-400" />
                          <input
                            type="password"
                            value={geminiKey}
                            onChange={e => setGeminiKey(e.target.value)}
                            placeholder={geminiKeyConfigured ? 'Digite para substituir a chave atual' : 'Cole a chave AIza...'}
                            className="bg-transparent border-none text-white text-xs font-mono w-full focus:ring-0 outline-none"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Nome do Atendente</label>
                        <div className="flex items-center gap-3 bg-slate-800/50 p-3 rounded-2xl border border-slate-700">
                          <User size={18} className="text-blue-400" />
                          <input type="text" value={attendantName} onChange={e => setAttendantName(e.target.value)} placeholder="Ex: Suporte VIP" className="bg-transparent border-none text-white text-xs font-bold w-full focus:ring-0 outline-none" />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">URL Imagem Perfil</label>
                        <div className="flex items-center gap-3 bg-slate-800/50 p-3 rounded-2xl border border-slate-700">
                          <QrCode size={18} className="text-purple-400" />
                          <input type="text" value={attendantImage} onChange={e => setAttendantImage(e.target.value)} placeholder="https://..." className="bg-transparent border-none text-white text-[10px] font-mono w-full focus:ring-0 outline-none" />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Custo Padrão por Linha</label>
                        <div className="flex items-center gap-3 bg-slate-800/50 p-3 rounded-2xl border border-slate-700">
                          <DollarSign size={18} className="text-rose-400" />
                          <input type="number" value={defaultCostPerLine} onChange={e => setDefaultCostPerLine(e.target.value)} className="bg-transparent border-none text-white text-xs font-bold w-full focus:ring-0 outline-none" />
                        </div>
                      </div>

                      <div className="space-y-2 md:col-span-2 lg:col-span-3">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Instruções do Atendente (Prompt da IA)</label>
                          <div className="flex gap-2">
                             <span className="text-[8px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">{"{{userInfo.name}}"}</span>
                             <span className="text-[8px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">{"{{clientPricesContext}}"}</span>
                          </div>
                        </div>
                        <textarea 
                          value={aiSystemPrompt} 
                          onChange={e => setAiSystemPrompt(e.target.value)}
                          placeholder="Digite aqui as regras de atendimento, valores de planos, etc..."
                          className="w-full h-48 bg-slate-800/50 p-4 rounded-2xl border border-slate-700 text-white text-[11px] leading-relaxed focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                        />
                        <p className="text-[8px] text-slate-500 font-medium mt-2 italic px-1">
                          * Use as tags acima para inserir o nome do cliente e a tabela de preços automaticamente.
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button onClick={handleSaveSettings} disabled={isSavingKey} className="bg-emerald-500 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-900/20">
                        {isSavingKey ? 'Salvando...' : 'Salvar Configurações'}
                      </button>
                    </div>
                  </div>

                  {/* Broadcast Section */}
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-50 pb-3">
                      <Smartphone size={18} className="text-blue-500" />
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Comunicado Geral (Massa)</h3>
                    </div>
                    <div className="space-y-3">
                      <textarea 
                        value={broadcastMessage}
                        onChange={e => setBroadcastMessage(e.target.value)}
                        placeholder="Digite aqui o aviso para todos os clientes... Use {{name}} para o nome."
                        className="w-full h-24 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                      />
                      <div className="flex justify-between items-center">
                        <p className="text-[9px] text-slate-400 font-bold italic">
                          * As mensagens serão enviadas com intervalo de 3s para sua segurança.
                        </p>
                        <button 
                          onClick={handleBroadcast}
                          disabled={isBroadcasting || !broadcastMessage.trim()}
                          className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all disabled:opacity-50"
                        >
                          {isBroadcasting ? 'Iniciando...' : 'Iniciar Disparo'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Search and Filters */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input 
                      type="text" 
                      placeholder="Buscar cliente..." 
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 shadow-sm text-xs font-bold outline-none focus:border-emerald-500"
                    />
                    <select 
                      value={statusFilter} 
                      onChange={e => setStatusFilter(e.target.value as any)}
                      className="px-4 py-3 rounded-2xl border border-slate-200 shadow-sm text-xs font-bold outline-none focus:border-emerald-500 bg-white"
                    >
                      <option value="all">Todos os Status</option>
                      <option value="active">Ativos</option>
                      <option value="expired">Vencidos</option>
                    </select>
                  </div>

                  {/* Customers Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {customers.filter(c => {
                      const matchesSearch = c.username.toLowerCase().includes(searchTerm.toLowerCase()) || (c.whatsapp && c.whatsapp.includes(searchTerm));
                      const isExpired = c.expiration_date ? new Date(c.expiration_date) < new Date() : false;
                      const matchesStatus = statusFilter === 'all' ? true : (statusFilter === 'active' ? !isExpired : isExpired);
                      return matchesSearch && matchesStatus;
                    }).map(customer => (
                      <motion.div key={customer.id} layout className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden group hover:border-emerald-200 transition-all">
                        <div className="p-4 space-y-4">
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-emerald-50 group-hover:text-emerald-500 transition-colors">
                                <User size={20} />
                              </div>
                              <div>
                                <h4 className="font-black text-slate-800 text-sm tracking-tight">{customer.name || customer.username}</h4>
                                <p className="text-[10px] text-slate-400 font-bold">@{customer.username} • {customer.whatsapp || 'Sem WhatsApp'}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-[9px] font-black text-slate-400 uppercase">Vencimento</p>
                              <p className={`text-xs font-black ${new Date(customer.expiration_date!) < new Date() ? 'text-rose-500' : 'text-emerald-600'}`}>
                                {customer.expiration_date ? format(new Date(customer.expiration_date), 'dd/MM/yyyy') : '--/--/----'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pt-2 border-t border-slate-50">
                            <button 
                              onClick={() => { setSelectedCustomerId(Number(customer.id)); setIsAppModalOpen(true); }}
                              className="flex-1 bg-indigo-50 text-indigo-600 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"
                            >
                              <Tv size={14} /> Apps ({customer.apps?.length || 0})
                            </button>
                            <button 
                              onClick={() => handleManualRenewal(customer.username)}
                              className="p-2.5 text-amber-500 bg-amber-50 rounded-xl hover:bg-amber-100 transition-all"
                              title="Renovação Manual"
                            >
                              <RefreshCw size={16} />
                            </button>
                            <button 
                              onClick={() => handleSyncStartflix(customer.username, customer.expiration_date!)}
                              className="p-2.5 text-blue-500 bg-blue-50 rounded-xl hover:bg-blue-100 transition-all"
                              title="Sincronizar com Startflix (Supabase)"
                            >
                              <Zap size={16} />
                            </button>
                            <button 
                              onClick={() => handleDeleteCustomer(Number(customer.id))}
                              className="p-2.5 text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>

                          {/* Apps Preview */}
                          {customer.apps && customer.apps.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {customer.apps.map(app => (
                                <div key={app.id} className="px-2 py-1 bg-slate-50 border border-slate-100 rounded-md text-[8px] font-bold text-slate-500 flex items-center gap-1">
                                  {app.is_tv ? <Tv size={10} /> : <Smartphone size={10} />}
                                  {app.app_name}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              );
            case 'financial':
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-emerald-500 p-6 rounded-2xl shadow-lg shadow-emerald-100 text-white space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Recebido (Mês)</p>
                      <p className="text-2xl font-black">R$ {parseFloat(financials?.total_received || 0).toFixed(2)}</p>
                      <DollarSign className="absolute top-4 right-4 opacity-10" size={48} />
                    </div>
                    <div className="bg-slate-900 p-6 rounded-2xl shadow-lg shadow-slate-100 text-white space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Custos Totais</p>
                      <p className="text-2xl font-black">R$ {parseFloat(financials?.total_costs || 0).toFixed(2)}</p>
                      <TrendingUp className="absolute top-4 right-4 opacity-10 rotate-180 text-rose-400" size={48} />
                    </div>
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-1 relative overflow-hidden">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lucro Estimado</p>
                      <p className="text-2xl font-black text-emerald-600">R$ {parseFloat(financials?.total_profit || 0).toFixed(2)}</p>
                      <div className="absolute -bottom-2 -right-2 w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center">
                        <TrendingUp className="text-emerald-500" size={24} />
                      </div>
                    </div>
                  </div>

                  {financials?.chart_data && financials.chart_data.length > 0 && (
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">Desempenho Diário</h4>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={financials.chart_data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                            <Tooltip 
                              cursor={{ fill: '#f8fafc' }}
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingTop: '10px' }} />
                            <Bar dataKey="Receita" fill="#10b981" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="Custo" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="Lucro" fill="#0f172a" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 bg-slate-50 border-b border-slate-200">
                      <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Relatório de Pagamentos</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50/50">
                            <th className="px-6 py-4 font-black text-slate-400 uppercase tracking-tighter">Cliente</th>
                            <th className="px-6 py-4 font-black text-slate-400 uppercase tracking-tighter">Valor Pago</th>
                            <th className="px-6 py-4 font-black text-slate-400 uppercase tracking-tighter text-center">Linhas</th>
                            <th className="px-6 py-4 font-black text-slate-400 uppercase tracking-tighter">Custo/Linha</th>
                            <th className="px-6 py-4 font-black text-slate-400 uppercase tracking-tighter">Lucro</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {customers.map(c => (
                            <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4 font-bold text-slate-700">{c.username}</td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-300 font-bold">R$</span>
                                  <input 
                                    type="number" step="0.01" defaultValue={c.amount_paid || 0}
                                    onBlur={e => handleSaveFinancial(c, 'amount_paid', parseFloat(e.target.value))}
                                    className="w-24 bg-emerald-50 text-emerald-600 font-black px-2 py-1 rounded-lg border-none focus:ring-2 focus:ring-emerald-500 outline-none" 
                                  />
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <input 
                                  type="number" defaultValue={c.lines_count || 1}
                                  onBlur={e => handleSaveFinancial(c, 'lines_count', parseInt(e.target.value))}
                                  className="w-12 bg-slate-50 text-slate-600 font-black px-2 py-1 rounded-lg border-none focus:ring-2 focus:ring-slate-500 outline-none text-center mx-auto block" 
                                />
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-300 font-bold">R$</span>
                                  <input 
                                    type="number" step="0.01" defaultValue={c.cost_per_credit || 0}
                                    onBlur={e => handleSaveFinancial(c, 'cost_per_credit', parseFloat(e.target.value))}
                                    className="w-20 bg-rose-50 text-rose-600 font-black px-2 py-1 rounded-lg border-none focus:ring-2 focus:ring-rose-500 outline-none" 
                                  />
                                </div>
                              </td>
                              <td className="px-6 py-4 font-black text-slate-900">
                                R$ {(Number(c.amount_paid || 0) - (Number(c.cost_per_credit || 0) * Number(c.lines_count || 1))).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            case 'automations':
              return (
                <div className="space-y-6">
                  {/* New Automation Form */}
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                      <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg"><Cpu size={14} /></div>
                      Configurar Nova Automação
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Nome (ex: IBO Player Script)</label>
                        <input value={autoName} onChange={e => setAutoName(e.target.value)} placeholder="IBO Player" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">URL de Login do Site</label>
                        <input value={autoSiteUrl} onChange={e => setAutoSiteUrl(e.target.value)} placeholder="https://iboplayer.com/device/login" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Usuário do Site (Painel)</label>
                        <input value={autoUser} onChange={e => setAutoUser(e.target.value)} placeholder="Seu usuário" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Senha do Site (Painel)</label>
                        <input value={autoPass} onChange={e => setAutoPass(e.target.value)} type="password" placeholder="••••••••" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none" />
                      </div>
                      <div className="lg:col-span-2 space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Tipo de Automação</label>
                        <select value={autoType} onChange={e => setAutoType(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none">
                          <option value="ibo_player">IBO Player (MAC/Key + Captcha)</option>
                          <option value="ultra_player">Ultra Player (Ativação CMS)</option>
                          <option value="fun_play">Fun Play (Ativação CMS)</option>
                          <option value="startpainel_cms">StartPainel (Criar Cliente)</option>
                          <option value="generic">Genérico (Login Simples)</option>
                        </select>
                      </div>
                      <div className="lg:col-span-2 flex items-end">
                        <button 
                          onClick={handleAddAutomation}
                          disabled={isLoading}
                          className="w-full bg-slate-900 text-white py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all flex items-center justify-center gap-2"
                        >
                          {isLoading ? <RefreshCw className="animate-spin" size={14} /> : <Plus size={14} />}
                          Salvar Configuração
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Automations List */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {automations.map(auto => (
                      <div key={auto.id} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm hover:border-indigo-200 transition-all group">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                              <Cpu size={18} />
                            </div>
                            <div>
                              <h4 className="text-sm font-black text-slate-800">{auto.name}</h4>
                              <p className="text-[9px] text-slate-400 font-bold uppercase truncate max-w-[150px]">{auto.site_url}</p>
                            </div>
                          </div>
                          <button onClick={() => handleDeleteAutomation(auto.id)} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
                            <Trash2 size={16} />
                          </button>
                        </div>
                        
                        <div className="bg-slate-50 rounded-2xl p-4 space-y-3 mt-4">
                          <p className="text-[9px] font-black text-slate-400 uppercase">Status</p>
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-600 rounded text-[8px] font-black uppercase">Pronto</span>
                        </div>
                        <button className="w-full bg-white border border-slate-200 text-slate-700 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center justify-center gap-2 mt-3">
                          <ExternalLink size={14} /> Testar Acesso
                        </button>
                      </div>
                    ))}
                    {automations.length === 0 && (
                      <div className="col-span-full py-12 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nenhuma automação cadastrada</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            case 'startflix':
              return (
                <div className="space-y-6">
                  {/* Summary */}
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white shadow-lg">
                        <Zap size={24} />
                      </div>
                      <div>
                        <h3 className="text-white font-black uppercase tracking-widest text-sm">Usuários Startflix</h3>
                        <p className="text-slate-400 text-[10px] font-bold">Total no Supabase: {startflixUsers.length}</p>
                      </div>
                    </div>
                    <button 
                      onClick={loadStartflixUsers}
                      className="p-3 bg-slate-800 text-slate-400 rounded-2xl hover:text-white transition-all border border-slate-700"
                    >
                      <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                  </motion.div>

                  {/* Users Table */}
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Usuário</th>
                            <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Credenciais App</th>
                            <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                            <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Vencimento</th>
                            <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Criado em</th>
                          </tr>
                        </thead>
                        <tbody>
                          {startflixUsers.map(user => (
                            <tr key={user.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                              <td className="p-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                    <User size={16} />
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-black text-slate-800">{user.username}</p>
                                    <p className="text-[9px] text-slate-400 font-bold">{user.email}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="p-4">
                                <div className="bg-slate-100 p-2 rounded-xl border border-slate-200 space-y-1">
                                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">User: <span className="text-slate-800 font-mono">{user.app_username}</span></p>
                                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Pass: <span className="text-slate-800 font-mono">{user.app_password_app}</span></p>
                                </div>
                              </td>
                              <td className="p-4 text-center">
                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${user.is_active ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                  {user.is_active ? 'Ativo' : 'Inativo'}
                                </span>
                              </td>
                              <td className="p-4">
                                <p className={`text-[10px] font-black ${user.expiration_date && new Date(user.expiration_date) < new Date() ? 'text-rose-500' : 'text-emerald-600'}`}>
                                  {user.expiration_date ? format(new Date(user.expiration_date), 'dd/MM/yyyy') : '--/--/----'}
                                </p>
                              </td>
                              <td className="p-4">
                                <p className="text-[10px] text-slate-400 font-bold">{format(new Date(user.created_at), 'dd/MM HH:mm')}</p>
                              </td>
                            </tr>
                          ))}
                          {startflixUsers.length === 0 && (
                            <tr>
                              <td colSpan={5} className="p-12 text-center text-slate-400 font-bold text-[10px] uppercase tracking-widest">Nenhum usuário sincronizado</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>

                  {/* Payments Table */}
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                      <DollarSign size={16} className="text-emerald-500" />
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pagamentos no App</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Cliente</th>
                            <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Plano/Descrição</th>
                            <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Valor</th>
                            <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                            <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Data</th>
                            <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Ação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {startflixPayments.map(payment => (
                            <tr key={payment.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                              <td className="p-4">
                                <p className="text-[11px] font-black text-slate-800">{payment.profiles?.username || payment.profiles?.full_name || 'Desconhecido'}</p>
                                <p className="text-[9px] text-slate-400 font-bold">{payment.profiles?.email}</p>
                              </td>
                              <td className="p-4">
                                <p className="text-[10px] font-bold text-slate-600">{payment.description || 'Assinatura'}</p>
                                <p className="text-[8px] text-slate-400 font-mono">{payment.payment_id}</p>
                              </td>
                              <td className="p-4 text-right">
                                <p className="text-[11px] font-black text-emerald-600">R$ {Number(payment.amount).toFixed(2)}</p>
                              </td>
                              <td className="p-4 text-center">
                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${payment.status === 'approved' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                  {payment.status === 'approved' ? 'Aprovado' : payment.status}
                                </span>
                              </td>
                              <td className="p-4">
                                <p className="text-[10px] text-slate-400 font-bold">{format(new Date(payment.created_at), 'dd/MM/yyyy HH:mm')}</p>
                              </td>
                              <td className="p-4 text-center">
                                {payment.status === 'approved' && (
                                  <button 
                                    onClick={() => handleManualRenewal(payment.profiles?.username || payment.profiles?.full_name)}
                                    className="p-2 text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-all"
                                    title="Processar Renovação"
                                  >
                                    <RefreshCw size={14} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                          {startflixPayments.length === 0 && (
                            <tr>
                              <td colSpan={6} className="p-12 text-center text-slate-400 font-bold text-[10px] uppercase tracking-widest">Nenhum pagamento registrado</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                </div>
              );
            case 'ai':
              return (
                <div className="space-y-6">
                  {/* AI Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-indigo-600 p-6 rounded-3xl shadow-lg shadow-indigo-100 text-white space-y-1 relative overflow-hidden">
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Total de Requisições</p>
                      <p className="text-3xl font-black">{aiUsageData.summary?.total_requests || 0}</p>
                      <Cpu className="absolute top-4 right-4 opacity-10" size={48} />
                    </div>
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-1 relative overflow-hidden">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tokens (Total)</p>
                      <p className="text-2xl font-black text-slate-800">
                        {((Number(aiUsageData.summary?.total_prompt_tokens) || 0) + (Number(aiUsageData.summary?.total_candidates_tokens) || 0)).toLocaleString()}
                      </p>
                      <div className="flex gap-2 mt-1">
                        <span className="text-[8px] font-bold text-slate-400 uppercase">Input: {aiUsageData.summary?.total_prompt_tokens || 0}</span>
                        <span className="text-[8px] font-bold text-slate-400 uppercase">Output: {aiUsageData.summary?.total_candidates_tokens || 0}</span>
                      </div>
                    </div>
                    <div className="bg-emerald-500 p-6 rounded-3xl shadow-lg shadow-emerald-100 text-white space-y-1 relative overflow-hidden">
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Gasto Estimado (USD)</p>
                      <p className="text-3xl font-black">${Number(aiUsageData.summary?.total_estimated_cost || 0).toFixed(4)}</p>
                      <DollarSign className="absolute top-4 right-4 opacity-10" size={48} />
                    </div>
                  </div>

                  {/* Grafico de custo diario (ultimos 30d) */}
                  {aiUsageData.daily && aiUsageData.daily.length > 0 && (
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <DollarSign size={14} className="text-emerald-500" /> Custo Diário (últimos 30 dias)
                      </h4>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={aiUsageData.daily}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(d: string) => d?.slice(5)} />
                          <YAxis tick={{ fontSize: 9 }} tickFormatter={(v: number) => `$${v.toFixed(3)}`} />
                          <Tooltip
                            contentStyle={{ fontSize: 11, borderRadius: 8 }}
                            formatter={(v: any) => `$${Number(v).toFixed(5)}`}
                            labelStyle={{ fontWeight: 'bold' }}
                          />
                          <Bar dataKey="cost" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                      {aiUsageData.byModel && aiUsageData.byModel.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {aiUsageData.byModel.map((m: any) => (
                            <div key={m.model} className="bg-slate-50 rounded-xl p-3">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest truncate" title={m.model}>{m.model}</p>
                              <p className="text-sm font-black text-slate-800 mt-1">${Number(m.cost || 0).toFixed(4)}</p>
                              <p className="text-[10px] font-bold text-slate-500">{m.requests} req</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Recent AI Logs */}
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                        <RefreshCw size={14} className="text-indigo-500" /> Histórico Recente
                      </h4>
                      <button onClick={loadAiUsage} className="text-[10px] font-black text-indigo-600 uppercase hover:underline">Atualizar</button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="p-4 text-[9px] font-black text-slate-400 uppercase">Data/Hora</th>
                            <th className="p-4 text-[9px] font-black text-slate-400 uppercase">Modelo</th>
                            <th className="p-4 text-[9px] font-black text-slate-400 uppercase">Tipo</th>
                            <th className="p-4 text-[9px] font-black text-slate-400 uppercase text-right">Tokens</th>
                            <th className="p-4 text-[9px] font-black text-slate-400 uppercase text-right">Custo (USD)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aiUsageData.recent?.map(log => (
                            <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                              <td className="p-4">
                                <p className="text-[10px] font-bold text-slate-700">{new Date(log.created_at).toLocaleString()}</p>
                              </td>
                              <td className="p-4">
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[8px] font-black uppercase">{log.model}</span>
                              </td>
                              <td className="p-4">
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{log.type.replace('_', ' ')}</p>
                              </td>
                              <td className="p-4 text-right">
                                <p className="text-[10px] font-black text-slate-700">{log.prompt_tokens + log.candidates_tokens}</p>
                              </td>
                              <td className="p-4 text-right">
                                <p className="text-[10px] font-black text-emerald-600">${Number(log.estimated_cost).toFixed(5)}</p>
                              </td>
                            </tr>
                          ))}
                          {aiUsageData.recent?.length === 0 && (
                            <tr>
                              <td colSpan={5} className="p-12 text-center text-slate-400 font-bold text-[10px] uppercase tracking-widest">Nenhum registro encontrado</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            default:
              return (
                <div className="p-12 text-center bg-white rounded-3xl border border-slate-200">
                  <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Selecione uma aba acima para gerenciar o sistema</p>
                </div>
              );
          }
        })()}

      {/* App Management Modal */}
      <AnimatePresence>
        {isAppModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/80 backdrop-blur-md" onClick={() => setIsAppModalOpen(false)} />
            <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} className="relative bg-white w-full max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[90dvh] flex flex-col">
              
              <div className="p-5 bg-slate-900 text-white flex justify-between items-center">
                <div>
                  <h3 className="font-black uppercase tracking-widest text-xs text-emerald-400">Gerenciar Dispositivos</h3>
                  <p className="text-[10px] text-slate-400 font-bold mt-1">Configure os acessos do cliente</p>
                </div>
                <button onClick={() => setIsAppModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={24} /></button>
              </div>

              <div className="p-6 overflow-y-auto space-y-6">
                {/* Apps List */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Aplicativos Ativos</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {customers.find(c => Number(c.id) === selectedCustomerId)?.apps?.map(app => (
                      <div key={app.id} 
                        onClick={() => setViewingApp(viewingApp?.id === app.id ? null : app)}
                        className={`p-3 rounded-2xl border transition-all flex items-center gap-4 group cursor-pointer ${
                          viewingApp?.id === app.id ? 'bg-emerald-50 border-emerald-200 ring-2 ring-emerald-500/20' : 'bg-slate-50 border-slate-100 hover:border-slate-200'
                        }`}
                      >
                        <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 shrink-0 shadow-sm overflow-hidden">
                          {app.icon_url ? <img src={app.icon_url} className="w-full h-full object-cover" /> : (app.is_tv ? <Tv size={20} /> : <Smartphone size={20} />)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black text-slate-800 truncate">{app.app_name}</p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase">{app.app_model}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button className={`p-2 rounded-lg transition-all ${viewingApp?.id === app.id ? 'text-emerald-500 bg-emerald-100' : 'text-slate-300 hover:text-emerald-500 hover:bg-emerald-50'}`}>
                            <Eye size={16} />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteApp(app.id!); }} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {(!customers.find(c => Number(c.id) === selectedCustomerId)?.apps?.length) && (
                      <div className="col-span-full py-4 text-center text-[10px] font-black text-slate-300 uppercase italic">Nenhum app cadastrado</div>
                    )}
                  </div>
                </div>

                {/* Detail View */}
                <AnimatePresence>
                  {viewingApp && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }} 
                      animate={{ height: 'auto', opacity: 1 }} 
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="bg-emerald-900/5 border border-emerald-100 rounded-2xl p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                            <CheckCircle size={14} /> {isEditingApp ? 'Editando Acesso' : `Detalhes do Acesso: ${viewingApp.app_name}`}
                          </h4>
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => setIsEditingApp(!isEditingApp)}
                              className="text-[10px] font-black text-emerald-600 uppercase hover:text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full transition-all"
                            >
                              {isEditingApp ? 'Cancelar' : 'Editar'}
                            </button>
                            <button onClick={() => { setViewingApp(null); setIsEditingApp(false); }} className="text-[10px] font-black text-slate-400 uppercase hover:text-slate-600">Fechar</button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="col-span-2 space-y-1">
                            <p className="text-[8px] font-black text-slate-400 uppercase">Identificação</p>
                            {isEditingApp ? (
                              <input value={viewingApp.app_name} onChange={e => setViewingApp({...viewingApp, app_name: e.target.value})} className="w-full px-3 py-2 bg-white border border-emerald-100 rounded-xl text-xs font-bold outline-none" />
                            ) : (
                              <p className="text-xs font-bold text-slate-700">{viewingApp.app_name}</p>
                            )}
                          </div>

                          <div className="col-span-2 space-y-1">
                            <p className="text-[8px] font-black text-slate-400 uppercase">Ícone do App</p>
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 shrink-0 overflow-hidden">
                                {viewingApp.icon_url ? <img src={viewingApp.icon_url} className="w-full h-full object-cover" /> : (viewingApp.is_tv ? <Tv size={20} /> : <Smartphone size={20} />)}
                              </div>
                              {isEditingApp && (
                                <input 
                                  type="file" 
                                  accept="image/*" 
                                  onChange={e => e.target.files?.[0] && handleUploadIcon(e.target.files[0], true)}
                                  className="text-[10px] text-slate-500"
                                />
                              )}
                            </div>
                          </div>

                          {(viewingApp.mac_address || isEditingApp) && (
                            <div className="bg-white p-3 rounded-xl border border-emerald-100 space-y-1">
                              <p className="text-[8px] font-black text-slate-400 uppercase">Endereço MAC</p>
                              {isEditingApp ? (
                                <input value={viewingApp.mac_address || ''} onChange={e => setViewingApp({...viewingApp, mac_address: e.target.value})} className="w-full px-2 py-1 bg-slate-50 border border-slate-100 rounded text-xs font-mono outline-none" />
                              ) : (
                                <p className="text-xs font-mono font-bold text-slate-700">{viewingApp.mac_address}</p>
                              )}
                            </div>
                          )}
                          {(viewingApp.device_key || isEditingApp) && (
                            <div className="bg-white p-3 rounded-xl border border-emerald-100 space-y-1">
                              <p className="text-[8px] font-black text-slate-400 uppercase">Device Key</p>
                              {isEditingApp ? (
                                <input value={viewingApp.device_key || ''} onChange={e => setViewingApp({...viewingApp, device_key: e.target.value})} className="w-full px-2 py-1 bg-slate-50 border border-slate-100 rounded text-xs font-mono outline-none" />
                              ) : (
                                <p className="text-xs font-mono font-bold text-slate-700">{viewingApp.device_key}</p>
                              )}
                            </div>
                          )}
                          {(viewingApp.username || isEditingApp) && (
                            <div className="bg-white p-3 rounded-xl border border-emerald-100 space-y-1">
                              <p className="text-[8px] font-black text-slate-400 uppercase">Usuário</p>
                              {isEditingApp ? (
                                <input value={viewingApp.username || ''} onChange={e => setViewingApp({...viewingApp, username: e.target.value})} className="w-full px-2 py-1 bg-slate-50 border border-slate-100 rounded text-xs font-bold outline-none" />
                              ) : (
                                <p className="text-xs font-bold text-slate-700">{viewingApp.username}</p>
                              )}
                            </div>
                          )}
                          {(viewingApp.password || isEditingApp) && (
                            <div className="bg-white p-3 rounded-xl border border-emerald-100 space-y-1">
                              <p className="text-[8px] font-black text-slate-400 uppercase">Senha</p>
                              {isEditingApp ? (
                                <input value={viewingApp.password || ''} onChange={e => setViewingApp({...viewingApp, password: e.target.value})} className="w-full px-2 py-1 bg-slate-50 border border-slate-100 rounded text-xs font-bold outline-none" />
                              ) : (
                                <p className="text-xs font-bold text-slate-700">{viewingApp.password}</p>
                              )}
                            </div>
                          )}
                          {(viewingApp.provider_url || isEditingApp) && (
                            <div className="col-span-2 bg-white p-3 rounded-xl border border-emerald-100 space-y-1">
                              <p className="text-[8px] font-black text-slate-400 uppercase">URL do Provedor / DNS</p>
                              {isEditingApp ? (
                                <input value={viewingApp.provider_url || ''} onChange={e => setViewingApp({...viewingApp, provider_url: e.target.value})} className="w-full px-2 py-1 bg-slate-50 border border-slate-100 rounded text-[10px] font-mono outline-none" />
                              ) : (
                                <p className="text-xs font-mono font-bold text-slate-700 break-all">{viewingApp.provider_url}</p>
                              )}
                            </div>
                          )}
                          {(viewingApp.host || isEditingApp) && (
                            <div className="col-span-2 bg-white p-3 rounded-xl border border-emerald-100 space-y-1">
                              <p className="text-[8px] font-black text-slate-400 uppercase">
                                {viewingApp.app_model === 'QUICKPLAYER' ? 'Host (Quick Player)' : 'Host / DNS (Xtream Codes)'}
                              </p>
                              {isEditingApp ? (
                                <input value={viewingApp.host || ''} onChange={e => setViewingApp({...viewingApp, host: e.target.value})} className="w-full px-2 py-1 bg-slate-50 border border-slate-100 rounded text-[10px] font-mono outline-none" />
                              ) : (
                                <p className="text-xs font-mono font-bold text-slate-700 break-all">{viewingApp.host}</p>
                              )}
                            </div>
                          )}
                          {(viewingApp.app_site_url || isEditingApp) && (
                            <div className="col-span-2 bg-white p-3 rounded-xl border border-emerald-100 flex items-center justify-between">
                              <div className="min-w-0 flex-1">
                                <p className="text-[8px] font-black text-slate-400 uppercase">Site Oficial</p>
                                {isEditingApp ? (
                                  <input value={viewingApp.app_site_url || ''} onChange={e => setViewingApp({...viewingApp, app_site_url: e.target.value})} className="w-full px-2 py-1 bg-slate-50 border border-slate-100 rounded text-[10px] outline-none mt-1" />
                                ) : (
                                  <p className="text-xs font-bold text-emerald-600 truncate">{viewingApp.app_site_url}</p>
                                )}
                              </div>
                              {!isEditingApp && (
                                <a href={viewingApp.app_site_url} target="_blank" rel="noreferrer" className="bg-emerald-500 text-white p-2 rounded-lg hover:bg-emerald-600 transition-all shrink-0 ml-4">
                                  <Globe size={14} />
                                </a>
                              )}
                            </div>
                          )}

                          {!isEditingApp && (viewingApp.app_model.includes('IBO PRO') || viewingApp.app_name.includes('IBO PRO')) ? (
                            <div className="col-span-2">
                              <button 
                                onClick={() => handleRunIBOPro(viewingApp.mac_address || '', viewingApp.device_key || '', viewingApp.provider_url || '')}
                                disabled={isLoading}
                                className="w-full bg-gradient-to-r from-orange-500 to-rose-600 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-orange-100 flex items-center justify-center gap-2"
                              >
                                {isLoading ? <RefreshCw className="animate-spin" size={14} /> : <Cpu size={14} />}
                                Suporte IBO Pro (Automático)
                              </button>
                              <p className="text-[8px] text-slate-400 font-bold uppercase mt-2 text-center italic">Fluxo simplificado para IBO Pro (iboproapp.com)</p>
                            </div>
                          ) : !isEditingApp && (viewingApp.app_model.includes('IBO') || viewingApp.app_name.includes('IBO')) && (
                            <div className="col-span-2">
                              <button 
                                onClick={() => handleRunAutomation({}, viewingApp.mac_address || '', viewingApp.device_key || '', viewingApp.provider_url || '', viewingApp.app_site_url)}
                                disabled={isLoading}
                                className="w-full bg-gradient-to-r from-indigo-600 to-violet-700 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                              >
                                {isLoading ? <RefreshCw className="animate-spin" size={14} /> : <Cpu size={14} />}
                                Suporte IBO Player (Automático)
                              </button>
                              <button 
                                onClick={() => handleRunIBORepair(viewingApp.mac_address || '', viewingApp.device_key || '', customers.find(c => Number(c.id) === selectedCustomerId)?.playlist_url || '')}
                                disabled={isLoading}
                                className="w-full mt-2 bg-gradient-to-r from-emerald-600 to-teal-700 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2"
                              >
                                {isLoading ? <RefreshCw className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                                Reparar IBO Player (Playlist)
                              </button>
                              <p className="text-[8px] text-slate-400 font-bold uppercase mt-2 text-center italic">Resolve erros de conexão, atualiza M3U e valida com IA (Gemini 2.5)</p>
                            </div>
                          )}

                          {!isEditingApp && viewingApp.app_model === 'ULTRA PLAYER' && (
                            <div className="col-span-2">
                              <button
                                onClick={() => handleRunUltraPlayer(customers.find(c => Number(c.id) === selectedCustomerId)?.username || '', viewingApp.mac_address || '')}
                                disabled={isLoading}
                                className="w-full bg-rose-600 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 transition-all shadow-lg shadow-rose-100 flex items-center justify-center gap-2"
                              >
                                {isLoading ? <RefreshCw className="animate-spin" size={14} /> : <Cpu size={14} />}
                                Ativar Ultra Player (Robô)
                              </button>
                              <p className="text-[8px] text-slate-400 font-bold uppercase mt-2 text-center">Ativa o MAC no StartPainel CMS automaticamente</p>
                            </div>
                          )}

                          {!isEditingApp && viewingApp.app_model === 'FUN PLAY' && (
                            <div className="col-span-2">
                              <button
                                onClick={() => handleRunFunPlay(customers.find(c => Number(c.id) === selectedCustomerId)?.username || '', viewingApp.mac_address || '')}
                                disabled={isLoading}
                                className="w-full bg-amber-600 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-700 transition-all shadow-lg shadow-amber-100 flex items-center justify-center gap-2"
                              >
                                {isLoading ? <RefreshCw className="animate-spin" size={14} /> : <Cpu size={14} />}
                                Ativar Fun Play (Robô)
                              </button>
                              <p className="text-[8px] text-slate-400 font-bold uppercase mt-2 text-center">Ativa o MAC no StartPainel CMS automaticamente</p>
                            </div>
                          )}

                          {!isEditingApp && viewingApp.app_model === 'IBO PRO' && (
                            <div className="col-span-2">
                              <button
                                onClick={() => handleRunIboPro(customers.find(c => Number(c.id) === selectedCustomerId)?.username || '')}
                                disabled={isLoading}
                                className="w-full bg-fuchsia-600 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-fuchsia-700 transition-all shadow-lg shadow-fuchsia-100 flex items-center justify-center gap-2"
                              >
                                {isLoading ? <RefreshCw className="animate-spin" size={14} /> : <Cpu size={14} />}
                                Atualizar Lista IBO Pro (Robô)
                              </button>
                              <p className="text-[8px] text-slate-400 font-bold uppercase mt-2 text-center">Faz login em iboproapp.com com MAC/Key do cliente, edita a lista, marca PIN e salva</p>
                            </div>
                          )}

                          {!isEditingApp && viewingApp.app_model === 'IBO PLAYER' && (
                            <div className="col-span-2">
                              <button
                                onClick={() => handleRunIboPlayer(customers.find(c => Number(c.id) === selectedCustomerId)?.username || '')}
                                disabled={isLoading}
                                className="w-full bg-violet-600 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-violet-700 transition-all shadow-lg shadow-violet-100 flex items-center justify-center gap-2"
                              >
                                {isLoading ? <RefreshCw className="animate-spin" size={14} /> : <Cpu size={14} />}
                                Atualizar Lista IBO Player (Robô)
                              </button>
                              <p className="text-[8px] text-slate-400 font-bold uppercase mt-2 text-center">Faz login em iboplayer.com com MAC/Key do cliente, atualiza a playlist M3U e resolve captcha com IA</p>
                            </div>
                          )}

                          {isEditingApp && (
                            <button 
                              onClick={handleUpdateApp}
                              disabled={isLoading}
                              className="col-span-2 bg-emerald-600 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg flex items-center justify-center gap-2"
                            >
                              {isLoading ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />}
                              Salvar Alterações
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="h-px bg-slate-100 w-full" />

                {/* Add App Form */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cadastrar Novo Acesso</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Identificação (ex: TV Quarto, Celular Pai)</label>
                      <input value={appName} onChange={e => setAppName(e.target.value)} placeholder="TV Sala" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none" />
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Modelo / Player</label>
                      <select value={appModel} onChange={e => setAppModel(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none">
                        <option>IBO PLAYER</option>
                        <option>IBO PRO</option>
                        <option>ULTRA PLAYER</option>
                        <option>QUICKPLAYER</option>
                        <option>LAZER PLAYER</option>
                        <option>SMARTERS PLAYER LITE</option>
                        <option>XC PLAYER</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Tipo de Acesso</label>
                      <select value={accessType} onChange={e => setAccessType(e.target.value as any)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none">
                        <option value="mac_key">MAC & Device Key</option>
                        <option value="xtream">Xtream Codes (DNS + Usuário + Senha)</option>
                        <option value="user_pass">Usuário & Senha (genérico)</option>
                      </select>
                    </div>

                    {accessType === 'mac_key' ? (
                      <>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Endereço MAC</label>
                          <input value={macAddress} onChange={e => setMacAddress(e.target.value)} placeholder="00:11:22:33:44:55" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Device Key</label>
                          <input value={deviceKey} onChange={e => setDeviceKey(e.target.value)} placeholder="123456" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none" />
                        </div>
                      </>
                    ) : accessType === 'xtream' ? (
                      <>
                        <div className="col-span-2 space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase ml-1">
                            {appModel === 'QUICKPLAYER' ? 'Host (Nome do Host)' : 'DNS / Servidor (ex: http://host.com:8080)'}
                          </label>
                          <input
                            value={appHost}
                            onChange={e => setAppHost(e.target.value)}
                            placeholder={appModel === 'QUICKPLAYER' ? 'ex: meuhost.tv' : 'http://provedor.com:8080'}
                            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Usuário</label>
                          <input value={appUsername} onChange={e => setAppUsername(e.target.value)} placeholder="usuario123" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Senha</label>
                          <input value={appPassword} onChange={e => setAppPassword(e.target.value)} placeholder="••••••" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none" />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Usuário</label>
                          <input value={appUsername} onChange={e => setAppUsername(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Senha</label>
                          <input value={appPassword} onChange={e => setAppPassword(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none" />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase ml-1">DNS / Host</label>
                          <input value={providerUrl} onChange={e => setProviderUrl(e.target.value)} placeholder="http://host.com:8080" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none font-mono" />
                        </div>
                      </>
                    )}

                    <div className="col-span-2 space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Site Oficial do App (ex: https://iboplayer.com/)</label>
                      <input value={appSiteUrl} onChange={e => setAppSiteUrl(e.target.value)} placeholder="https://..." className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none font-mono" />
                    </div>

                    <div className="col-span-2 space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Ícone / Imagem do App</label>
                      <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
                        <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 shrink-0 overflow-hidden shadow-sm">
                          {iconUrl ? <img src={iconUrl} className="w-full h-full object-cover" /> : <Tv size={20} />}
                        </div>
                        <div className="flex-1">
                          <input 
                            type="file" 
                            accept="image/*" 
                            onChange={e => e.target.files?.[0] && handleUploadIcon(e.target.files[0])}
                            className="text-[10px] text-slate-500 font-bold block w-full file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-[10px] file:font-black file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 cursor-pointer" 
                          />
                          <p className="text-[8px] text-slate-400 font-bold uppercase mt-1">PNG, JPG ou GIF (Max 5MB)</p>
                        </div>
                        {iconUrl && (
                          <button onClick={() => setIconUrl('')} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="col-span-2 grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Link Android</label>
                        <input value={androidLink} onChange={e => setAndroidLink(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Link iPhone</label>
                        <input value={iosLink} onChange={e => setIosLink(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none" />
                      </div>
                    </div>

                    <div className="col-span-2 space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase ml-1">URL da Imagem / Ícone do App</label>
                      <input value={iconUrl} onChange={e => setIconUrl(e.target.value)} placeholder="https://..." className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none" />
                    </div>

                    <div className="col-span-2 flex items-center gap-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase">Dispositivo:</p>
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <input type="radio" checked={isTv} onChange={() => setIsTv(true)} className="w-4 h-4 text-emerald-500" />
                        <span className={`text-[10px] font-black uppercase tracking-widest ${isTv ? 'text-slate-900' : 'text-slate-400'}`}>Smart TV</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <input type="radio" checked={!isTv} onChange={() => setIsTv(false)} className="w-4 h-4 text-emerald-500" />
                        <span className={`text-[10px] font-black uppercase tracking-widest ${!isTv ? 'text-slate-900' : 'text-slate-400'}`}>Celular</span>
                      </label>
                    </div>
                  </div>

                  <button 
                    onClick={handleAddApp}
                    disabled={isLoading}
                    className="w-full bg-slate-900 text-white py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-slate-100 flex items-center justify-center gap-2"
                  >
                    {isLoading ? <RefreshCw className="animate-spin" size={16} /> : <Plus size={16} />}
                    Cadastrar Acesso
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
