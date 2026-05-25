import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Customer, CustomerApp } from '../types';
import { authFetch } from '../lib/auth';
import { toast } from 'sonner';
import {
  Plus, Trash2, User, RefreshCw, Smartphone, CheckCircle,
  Brain, Save, Key, QrCode, DollarSign, TrendingUp,
  Tv, Monitor, Globe, ChevronRight, Calendar, Info, X, Eye,
  Cpu, ExternalLink, Zap, ArrowRightLeft, Phone, UserPlus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';

export default function AdminPanel() {
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'financial' | 'automations' | 'ai' | 'startflix' | 'wareztv' | 'android' | 'settings' | 'm3u'>('users');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [financials, setFinancials] = useState<any>(null);
  const [startflixUsers, setStartflixUsers] = useState<any[]>([]);
  const [startflixPayments, setStartflixPayments] = useState<any[]>([]);
  const [isSyncingStartflix, setIsSyncingStartflix] = useState(false);

  // Wareztv state
  const [warezClients, setWarezClients] = useState<any[]>([]);
  const [warezTests, setWarezTests] = useState<any[]>([]);
  const [warezReseller, setWarezReseller] = useState<any>(null);
  const [warezTab, setWarezTab] = useState<'clients' | 'tests'>('clients');
  const [warezLoading, setWarezLoading] = useState(false);
  const [warezSearch, setWarezSearch] = useState('');
  const [warezNewName, setWarezNewName] = useState('');
  const [warezNewWhatsapp, setWarezNewWhatsapp] = useState('');
  const [warezCreating, setWarezCreating] = useState(false);

  // App Android DNS state
  const [appDnsList, setAppDnsList] = useState<string[]>(['', '', '', '', '']);
  const [appDnsLoading, setAppDnsLoading] = useState(false);
  const [appDnsSaving, setAppDnsSaving] = useState(false);

  // === Pool M3U ===
  const [m3uLists, setM3uLists] = useState<any[]>([]);
  const [m3uCodes, setM3uCodes] = useState<any[]>([]);
  const [m3uLeases, setM3uLeases] = useState<any[]>([]);
  const [m3uStats, setM3uStats] = useState<any>(null);
  const [m3uLoading, setM3uLoading] = useState(false);
  // form: nova lista
  const [m3uNewName, setM3uNewName] = useState('');
  const [m3uNewUrl, setM3uNewUrl] = useState('');
  const [m3uNewNotes, setM3uNewNotes] = useState('');
  // form: novo código
  const [m3uNewCodeLabel, setM3uNewCodeLabel] = useState('');
  const [m3uNewCodeCustom, setM3uNewCodeCustom] = useState('');
  const [m3uSaving, setM3uSaving] = useState(false);
  const [m3uTab, setM3uTab] = useState<'lists' | 'codes' | 'leases'>('lists');
  const [m3uLastUpdated, setM3uLastUpdated] = useState<Date | null>(null);
  const [m3uFetchError, setM3uFetchError] = useState<string | null>(null);

  // === Gerenciamento do Catálogo de Apps ===
  const [editingCatalogId, setEditingCatalogId] = useState<number | 'new' | null>(null);
  const [catalogForm, setCatalogForm] = useState({
    name: '', device_type: 'todos', description: '',
    android_link: '', ios_link: '', web_link: '',
    youtube_url: '', display_order: 0, is_active: true,
    app_image_url: '', install_video_url: '',
    image_1_url: '', image_2_url: '', image_3_url: '', image_4_url: '', image_5_url: '',
  });
  const [catalogUploading, setCatalogUploading] = useState<string | null>(null);
  const [catalogSaving, setCatalogSaving] = useState(false);

  // Catálogo de apps para seleção ao cadastrar cliente
  const [catalogApps, setCatalogApps] = useState<{id: number; name: string; app_image_url: string | null; device_type: string; is_active: boolean; android_link: string | null; ios_link: string | null; web_link: string | null; install_video_url: string | null; youtube_url: string | null; description: string | null; display_order: number; image_1_url: string | null; image_2_url: string | null; image_3_url: string | null; image_4_url: string | null; image_5_url: string | null}[]>([]);
  const [selectedCatalogAppId, setSelectedCatalogAppId] = useState<number | null>(null);
  // Catálogo selecionado no modal "Gerenciar Dispositivos"
  const [modalCatalogAppId, setModalCatalogAppId] = useState<number | null>(null);


  // Search and Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [providerFilter, setProviderFilter] = useState<'all' | 'startpainel' | 'zaplay' | 'wareztv' | 'outro'>('all');
  
  // New Customer Form
  const [newUsername, setNewUsername] = useState('');
  const [newName, setNewName] = useState('');
  const [newRenewalPrice, setNewRenewalPrice] = useState('49.90');
  const [newLinesCount, setNewLinesCount] = useState('1');
  const [newWhatsapp, setNewWhatsapp] = useState('');
  const [newExpirationDate, setNewExpirationDate] = useState('');
  const [newPlaylistUrl, setNewPlaylistUrl] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDns, setNewDns] = useState('');
  const [newProvider, setNewProvider] = useState('startpainel');
  
  // App Management
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [isAppModalOpen, setIsAppModalOpen] = useState(false);
  
  // States para Gerar Teste
  const [testUsername, setTestUsername] = useState('');
  const [testMac, setTestMac] = useState('');
  const [testPlayer, setTestPlayer] = useState('ULTRA PLAYER');
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

  // Números vinculados por cliente
  const [phonesCustomer, setPhonesCustomer] = useState<Customer | null>(null);
  const [phonesList, setPhonesList] = useState<{id: number; phone: string; label: string | null}[]>([]);
  const [newPhone, setNewPhone] = useState('');
  const [newPhoneLabel, setNewPhoneLabel] = useState('');
  const [phonesLoading, setPhonesLoading] = useState(false);

  // Migração de provedor (Start → WarezTV)
  const [migrateCustomer, setMigrateCustomer] = useState<Customer | null>(null);
  const [migrateDays, setMigrateDays] = useState('30');
  const [migrateLoading, setMigrateLoading] = useState(false);
  const [migrateResult, setMigrateResult] = useState<{warez_username: string; warez_password: string; exp_date: string; plan: string} | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Tabela de preços de venda — planos
  const [planPrice1, setPlanPrice1] = useState('25');
  const [planPrice2, setPlanPrice2] = useState('40');
  const [planPrice3, setPlanPrice3] = useState('60');
  // Tabela de preços de venda — taxa de ativação apps pagos
  const [feeIbo, setFeeIbo] = useState('10');
  const [feeIboPro, setFeeIboPro] = useState('10');
  const [feeVuPlayer, setFeeVuPlayer] = useState('10');
  const [feeBobPlayer, setFeeBobPlayer] = useState('10');
  const [isSavingPrices, setIsSavingPrices] = useState(false);
  // URL do servidor XC IPTV / IPTV Smarters
  const [xciptvUrl, setXciptvUrl] = useState('http://smartlite.site:8880');
  const [isSavingXcUrl, setIsSavingXcUrl] = useState(false);

  const [geminiKey, setGeminiKey] = useState('');
  const [geminiKeyMasked, setGeminiKeyMasked] = useState<string | null>(null);
  const [geminiKeyConfigured, setGeminiKeyConfigured] = useState(false);
  const [attendantName, setAttendantName] = useState('Suporte StartPainel');
  const [attendantImage, setAttendantImage] = useState('https://cdn-icons-png.flaticon.com/512/4712/4712027.png');
  const [aiSystemPrompt, setAiSystemPrompt] = useState('');
  const [whatsappSupport, setWhatsappSupport] = useState('');
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
    if (activeSubTab === 'wareztv') {
      loadWarezClients();
      loadWarezReseller();
    }
    if (activeSubTab === 'android') {
      loadAppDns();
    }
    if (activeSubTab === 'settings') {
      loadSettings();
    }
    // Pool M3U não precisa aqui — o intervalo persistente já mantém os dados frescos
  }, [activeSubTab]);

  // Auto-refresh persistente do Pool M3U — roda SEMPRE, independente da aba ativa.
  // Inicia junto com o componente e só para quando o painel é desmontado.
  useEffect(() => {
    // Primeira carga com spinner (silent=false) para erros ficarem visíveis imediatamente
    loadM3uAll(false);
    const interval = setInterval(() => loadM3uAll(true), 5000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const loadWarezClients = async () => {
    setWarezLoading(true);
    try {
      const r = await authFetch('/api/wareztv/clients?perPage=200');
      const d = await r.json();
      setWarezClients(Array.isArray(d.items) ? d.items : []);
      const rt = await authFetch('/api/wareztv/clients?trial=1&perPage=100');
      const dt = await rt.json();
      setWarezTests(Array.isArray(dt.items) ? dt.items : []);
    } catch (e) { toast.error('Erro ao carregar clientes Wareztv'); }
    finally { setWarezLoading(false); }
  };

  const loadWarezReseller = async () => {
    try {
      const r = await authFetch('/api/wareztv/reseller');
      const d = await r.json();
      setWarezReseller(d);
    } catch {}
  };

  const handleWarezGenerateTest = async () => {
    setWarezCreating(true);
    try {
      const r = await authFetch('/api/wareztv/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: warezNewName, whatsapp: warezNewWhatsapp }),
      });
      const d = await r.json();
      if (d.success) {
        toast.success(`Teste criado! Usuário: ${d.username} | Senha: ${d.password}`);
        loadWarezClients();
        setWarezNewName(''); setWarezNewWhatsapp('');
      } else { toast.error(d.error || 'Erro ao gerar teste'); }
    } catch (e: any) { toast.error(e.message); }
    finally { setWarezCreating(false); }
  };

  const handleWarezCreateClient = async () => {
    if (!warezNewName) { toast.error('Informe o nome do cliente'); return; }
    setWarezCreating(true);
    try {
      const r = await authFetch('/api/wareztv/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: warezNewName, whatsapp: warezNewWhatsapp, days: 30 }),
      });
      const d = await r.json();
      if (d.success) {
        toast.success(`Cliente criado! Usuário: ${d.username} | Senha: ${d.password}`);
        loadWarezClients();
        setWarezNewName(''); setWarezNewWhatsapp('');
      } else { toast.error(d.error || 'Erro ao criar cliente'); }
    } catch (e: any) { toast.error(e.message); }
    finally { setWarezCreating(false); }
  };

  const handleWarezDelete = async (lineId: number, username: string) => {
    if (!confirm(`Deletar cliente Wareztv ${username}?`)) return;
    try {
      const r = await authFetch(`/api/wareztv/clients/${lineId}`, { method: 'DELETE' });
      const d = await r.json();
      if (d.success) { toast.success(`${username} deletado`); loadWarezClients(); }
      else toast.error(d.error || 'Erro ao deletar');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleWarezResetPassword = async (lineId: number, username: string) => {
    if (!confirm(`Resetar senha de ${username}?`)) return;
    try {
      const r = await authFetch(`/api/wareztv/clients/${lineId}/reset-password`, { method: 'POST' });
      const d = await r.json();
      if (d.success) { toast.success(`Nova senha de ${username}: ${d.password}`); loadWarezClients(); }
      else toast.error(d.error || 'Erro ao resetar senha');
    } catch (e: any) { toast.error(e.message); }
  };

  // === M3U Pool ===
  // silent=true → não ativa spinner (usado pelo intervalo em background)
  const loadM3uAll = async (silent = false) => {
    if (!silent) setM3uLoading(true);
    try {
      const [rLists, rCodes, rLeases, rStats] = await Promise.all([
        authFetch('/api/m3u/lists'),
        authFetch('/api/m3u/codes'),
        authFetch('/api/m3u/leases'),
        authFetch('/api/m3u/stats'),
      ]);

      // Verifica status HTTP antes de tentar parsear JSON
      if (!rLists.ok || !rCodes.ok || !rLeases.ok || !rStats.ok) {
        const failedStatus = [rLists, rCodes, rLeases, rStats].find(r => !r.ok)?.status;
        throw new Error(`HTTP ${failedStatus}`);
      }

      const [lists, codes, leases, stats] = await Promise.all([
        rLists.json(), rCodes.json(), rLeases.json(), rStats.json(),
      ]);
      setM3uLists(Array.isArray(lists) ? lists : []);
      setM3uCodes(Array.isArray(codes) ? codes : []);
      setM3uLeases(Array.isArray(leases) ? leases : []);
      setM3uStats(stats);
      setM3uLastUpdated(new Date());
      setM3uFetchError(null); // limpa erro anterior ao ter sucesso
    } catch (e: any) {
      // Registra o erro para exibição — não quebra o painel
      const msg = e?.message || 'Falha ao carregar';
      setM3uFetchError(msg);
      console.warn('[M3U Pool] Erro ao carregar dados:', msg);
    }
    finally { if (!silent) setM3uLoading(false); }
  };

  const handleM3uAddList = async () => {
    if (!m3uNewName.trim() || !m3uNewUrl.trim()) { toast.error('Nome e URL são obrigatórios'); return; }
    setM3uSaving(true);
    try {
      const r = await authFetch('/api/m3u/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: m3uNewName, m3u_url: m3uNewUrl, notes: m3uNewNotes }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success('Lista adicionada ao pool!');
      setM3uNewName(''); setM3uNewUrl(''); setM3uNewNotes('');
      loadM3uAll();
    } catch (e: any) { toast.error(e.message); }
    finally { setM3uSaving(false); }
  };

  const handleM3uDeleteList = async (id: number) => {
    if (!confirm('Remover esta lista do pool? Leases ativas serão liberadas.')) return;
    try {
      await authFetch(`/api/m3u/lists/${id}`, { method: 'DELETE' });
      toast.success('Lista removida');
      loadM3uAll();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleM3uToggleList = async (id: number, is_active: boolean) => {
    try {
      await authFetch(`/api/m3u/lists/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !is_active }),
      });
      loadM3uAll();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleM3uAddCode = async () => {
    setM3uSaving(true);
    try {
      const r = await authFetch('/api/m3u/codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: m3uNewCodeLabel, code: m3uNewCodeCustom }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success(`Código criado: ${d.code}`);
      setM3uNewCodeLabel(''); setM3uNewCodeCustom('');
      loadM3uAll();
    } catch (e: any) { toast.error(e.message); }
    finally { setM3uSaving(false); }
  };

  const handleM3uDeleteCode = async (id: number) => {
    if (!confirm('Remover este código? O usuário perderá acesso imediatamente.')) return;
    try {
      await authFetch(`/api/m3u/codes/${id}`, { method: 'DELETE' });
      toast.success('Código removido');
      loadM3uAll();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleM3uRevokeLeases = async (id: number) => {
    try {
      await authFetch(`/api/m3u/leases/${id}/revoke`, { method: 'POST' });
      toast.success('Lease revogada — lista voltou ao pool');
      loadM3uAll();
    } catch (e: any) { toast.error(e.message); }
  };

  const loadAppDns = async () => {
    setAppDnsLoading(true);
    try {
      const r = await authFetch('/api/app/dns');
      const d = await r.json();
      const list: string[] = Array.isArray(d.dns) ? d.dns : [];
      const padded = [...list, '', '', '', '', ''].slice(0, 5);
      setAppDnsList(padded);
    } catch { toast.error('Erro ao carregar DNS do app'); }
    finally { setAppDnsLoading(false); }
  };

  const loadCatalogApps = async () => {
    try {
      const r = await fetch('/api/app-catalog');
      const d = await r.json();
      setCatalogApps(Array.isArray(d) ? d : []);
    } catch {}
  };

  const emptyCatalogForm = {
    name: '', device_type: 'todos', description: '', android_link: '', ios_link: '', web_link: '',
    youtube_url: '', display_order: 0, is_active: true, app_image_url: '', install_video_url: '',
    image_1_url: '', image_2_url: '', image_3_url: '', image_4_url: '', image_5_url: '',
  };

  const openNewCatalogForm = () => {
    setCatalogForm(emptyCatalogForm);
    setEditingCatalogId('new');
  };

  const openEditCatalogForm = (app: typeof catalogApps[0]) => {
    setCatalogForm({
      name: app.name || '', device_type: app.device_type || 'todos',
      description: app.description || '', android_link: app.android_link || '',
      ios_link: app.ios_link || '', web_link: app.web_link || '',
      youtube_url: app.youtube_url || '', display_order: app.display_order ?? 0,
      is_active: app.is_active ?? true, app_image_url: app.app_image_url || '',
      install_video_url: app.install_video_url || '',
      image_1_url: app.image_1_url || '', image_2_url: app.image_2_url || '',
      image_3_url: app.image_3_url || '', image_4_url: app.image_4_url || '',
      image_5_url: app.image_5_url || '',
    });
    setEditingCatalogId(app.id);
  };

  // field: 'app_image_url' | 'install_video_url' | 'image_1_url'..'image_5_url'
  const handleCatalogUpload = async (file: File, field: string) => {
    const isVideo = field === 'install_video_url';
    if (isVideo && !file.type.startsWith('video/')) { toast.error('Selecione um arquivo de vídeo (MP4, etc.)'); return; }
    if (!isVideo && !file.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem'); return; }
    const maxMb = isVideo ? 50 : 5;
    if (file.size > maxMb * 1024 * 1024) { toast.error(`Arquivo muito grande. Máximo ${maxMb}MB.`); return; }
    setCatalogUploading(field);
    try {
      const dataUrl: string = await new Promise((res, rej) => {
        const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file);
      });
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
      const resp = await authFetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: base64, mimeType: file.type, prefix: isVideo ? 'tutorials' : 'app-icons' }),
      });
      const json = await resp.json();
      if (!resp.ok || !json.url) throw new Error(json.error || 'Upload falhou');
      setCatalogForm(f => ({ ...f, [field]: json.url }));
      toast.success(isVideo ? 'Vídeo enviado!' : 'Imagem enviada!');
    } catch (e: any) { toast.error(e.message); }
    finally { setCatalogUploading(null); }
  };

  const handleSaveCatalogApp = async () => {
    if (!catalogForm.name.trim()) { toast.error('Nome do app é obrigatório'); return; }
    setCatalogSaving(true);
    try {
      const isNew = editingCatalogId === 'new';
      const url = isNew ? '/api/app-catalog' : `/api/app-catalog/${editingCatalogId}`;
      const method = isNew ? 'POST' : 'PUT';
      const r = await authFetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(catalogForm),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success(isNew ? 'App adicionado ao catálogo!' : 'App atualizado!');
      setEditingCatalogId(null);
      loadCatalogApps();
    } catch (e: any) { toast.error(e.message); }
    finally { setCatalogSaving(false); }
  };

  const handleDeleteCatalogApp = async (id: number, name: string) => {
    if (!confirm(`Remover "${name}" do catálogo?`)) return;
    try {
      await authFetch(`/api/app-catalog/${id}`, { method: 'DELETE' });
      toast.success('App removido do catálogo');
      loadCatalogApps();
    } catch (e: any) { toast.error(e.message); }
  };

  const saveAppDns = async () => {
    setAppDnsSaving(true);
    try {
      const dns = appDnsList.filter(d => d.trim() !== '');
      const r = await authFetch('/api/app/dns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dns }),
      });
      const d = await r.json();
      if (d.success) toast.success('DNS salvo com sucesso!');
      else toast.error(d.error || 'Erro ao salvar DNS');
    } catch (e: any) { toast.error(e.message); }
    finally { setAppDnsSaving(false); }
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
      loadStartflixPayments(),
      loadCatalogApps()
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

      const resWa = await authFetch('/api/settings/whatsapp_support');
      const dataWa = await resWa.json();
      if (dataWa.value) setWhatsappSupport(dataWa.value);

      // Preços de venda dos planos + taxas de apps pagos
      const [resP1, resP2, resP3, resFIbo, resFIboPro, resFVu, resFBob] = await Promise.all([
        authFetch('/api/settings/plan_price_1'),
        authFetch('/api/settings/plan_price_2'),
        authFetch('/api/settings/plan_price_3'),
        authFetch('/api/settings/app_fee_ibo'),
        authFetch('/api/settings/app_fee_ibo_pro'),
        authFetch('/api/settings/app_fee_vu_player'),
        authFetch('/api/settings/app_fee_bob_player'),
      ]);
      const [dp1, dp2, dp3, dfIbo, dfIboPro, dfVu, dfBob] = await Promise.all([
        resP1.json(), resP2.json(), resP3.json(),
        resFIbo.json(), resFIboPro.json(), resFVu.json(), resFBob.json(),
      ]);
      if (dp1.value) setPlanPrice1(dp1.value);
      if (dp2.value) setPlanPrice2(dp2.value);
      if (dp3.value) setPlanPrice3(dp3.value);
      if (dfIbo.value) setFeeIbo(dfIbo.value);
      if (dfIboPro.value) setFeeIboPro(dfIboPro.value);
      if (dfVu.value) setFeeVuPlayer(dfVu.value);
      if (dfBob.value) setFeeBobPlayer(dfBob.value);

      // URL XC IPTV / IPTV Smarters
      const resXc = await authFetch('/api/settings/xciptv_server_url');
      const dataXc = await resXc.json();
      if (dataXc.value) setXciptvUrl(dataXc.value);
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
          password: newPassword,
          dns: newDns,
          renewalPrice: parseFloat(newRenewalPrice),
          linesCount: parseInt(newLinesCount),
          costPerCredit: parseFloat(defaultCostPerLine),
          expirationDate: newExpirationDate || null,
          provider: newProvider
        })
      });
      
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.details || errData.error || 'Erro ao cadastrar');
      }

      const created = await response.json();
      const savedUsername = created.username;
      const savedExpDate = created.expiration_date;
      const savedCatalogAppId = selectedCatalogAppId;

      setNewUsername('');
      setNewName('');
      setNewWhatsapp('');
      setNewPassword('');
      setNewDns('');
      setNewExpirationDate('');
      setNewLinesCount('1');
      setNewPlaylistUrl('');
      setNewProvider('startpainel');
      setSelectedCatalogAppId(null);
      setStatusFilter('all');
      setSearchTerm('');
      loadCustomers();

      // Registrar app do catálogo selecionado para o novo cliente
      if (savedCatalogAppId) {
        const catalogApp = catalogApps.find(a => a.id === savedCatalogAppId);
        if (catalogApp) {
          try {
            await fetch(`/api/customers/${created.id}/apps`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                appName: catalogApp.name,
                appModel: catalogApp.name,
                accessType: 'mac_key',
              })
            });
          } catch (e) {
            console.error('[AdminPanel] Erro ao registrar app do catálogo:', e);
          }
        }
      }

      if (autoCreateCms) {
        toast.success('Cliente local cadastrado! Iniciando automação no StartPainel para buscar a M3U...');
        try {
          const cmsResponse = await fetch('/api/automations/startpainel/create-client', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: savedUsername })
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
        handleSyncStartflix(savedUsername, savedExpDate);
        // Automação: Registrar o App Startflix na lista do cliente
        try {
          await fetch(`/api/customers/${created.id}/apps`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              appName: 'Startflix Web/App',
              appModel: 'Startflix',
              accessType: 'user_pass',
              appUsername: savedUsername,
              appPassword: created.password || '123456',
              appSiteUrl: 'https://startflix.app'
            })
          });
        } catch (appErr) {
          console.error('[AdminPanel] Erro ao registrar app Startflix:', appErr);
        }
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
        setModalCatalogAppId(null);
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

  const openPhonesModal = async (customer: Customer) => {
    setPhonesCustomer(customer);
    setNewPhone(''); setNewPhoneLabel('');
    setPhonesLoading(true);
    try {
      const res = await authFetch(`/api/admin/customers/${customer.id}/phones`);
      setPhonesList(await res.json());
    } catch { setPhonesList([]); }
    finally { setPhonesLoading(false); }
  };

  const handleAddPhone = async () => {
    if (!phonesCustomer || !newPhone.trim()) return;
    try {
      const res = await authFetch(`/api/admin/customers/${phonesCustomer.id}/phones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: newPhone.trim(), label: newPhoneLabel.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      setPhonesList(prev => [...prev, data]);
      setNewPhone(''); setNewPhoneLabel('');
      toast.success('Número vinculado!');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDeletePhone = async (phoneId: number) => {
    if (!phonesCustomer) return;
    await authFetch(`/api/admin/customers/${phonesCustomer.id}/phones/${phoneId}`, { method: 'DELETE' });
    setPhonesList(prev => prev.filter(p => p.id !== phoneId));
    toast.success('Número removido');
  };

  const handleMigrateToWarez = async () => {
    if (!migrateCustomer) return;
    setMigrateLoading(true);
    setMigrateResult(null);
    try {
      const res = await authFetch(`/api/admin/customers/${migrateCustomer.id}/migrate-to-wareztv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: Number(migrateDays), name: migrateCustomer.name, whatsapp: migrateCustomer.whatsapp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao migrar');
      setMigrateResult(data);
      toast.success(`✅ Cliente migrado para WarezTV!`);
      loadAll();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setMigrateLoading(false);
    }
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
      await saveSetting('whatsapp_support', whatsappSupport);
      toast.success('Configurações salvas!');
      loadSettings();
    } catch (error) {} finally { setIsSavingKey(false); }
  };

  const handleSavePrices = async () => {
    const p1 = parseFloat(planPrice1);
    const p2 = parseFloat(planPrice2);
    const p3 = parseFloat(planPrice3);
    const fi  = parseFloat(feeIbo);
    const fip = parseFloat(feeIboPro);
    const fv  = parseFloat(feeVuPlayer);
    const fb  = parseFloat(feeBobPlayer);
    if ([p1,p2,p3,fi,fip,fv,fb].some(v => isNaN(v) || v < 0)) {
      toast.error('Informe valores válidos em todos os campos.');
      return;
    }
    if (p1 >= p2 || p2 >= p3) {
      toast.error('Os preços dos planos devem ser crescentes: 1 tela < 2 telas < 3 telas.');
      return;
    }
    setIsSavingPrices(true);
    try {
      const save = (key: string, value: number) => authFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: String(value) }),
      });
      await Promise.all([
        save('plan_price_1', p1),
        save('plan_price_2', p2),
        save('plan_price_3', p3),
        save('app_fee_ibo', fi),
        save('app_fee_ibo_pro', fip),
        save('app_fee_vu_player', fv),
        save('app_fee_bob_player', fb),
      ]);
      toast.success('Tabela de preços atualizada! A IA já usa os novos valores.');
    } catch { toast.error('Erro ao salvar preços.'); }
    finally { setIsSavingPrices(false); }
  };

  const handleSaveXcUrl = async () => {
    const url = xciptvUrl.trim();
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      toast.error('URL inválida. Use o formato: http://dominio:porta');
      return;
    }
    setIsSavingXcUrl(true);
    try {
      await authFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'xciptv_server_url', value: url }),
      });
      toast.success('URL do servidor XC IPTV / Smarters atualizada! A IA já usa o novo endereço.');
    } catch { toast.error('Erro ao salvar URL.'); }
    finally { setIsSavingXcUrl(false); }
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
    playerType: 'ultra' | 'funplay' | 'xcloud' | 'lazerplay' | 'seeplay',
    playerLabel: string,
  ) => {
    if (!mac) {
      toast.error('Este aplicativo precisa de MAC Address para ativação.');
      return;
    }
    setIsLoading(true);
    const endpoint = playerType === 'funplay'
      ? '/api/automations/startpainel/activate-funplay'
      : playerType === 'xcloud'
      ? '/api/automations/startpainel/activate-xcloud'
      : playerType === 'lazerplay'
      ? '/api/automations/startpainel/activate-lazerplay'
      : playerType === 'seeplay'
      ? '/api/automations/startpainel/activate-seeplay'
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
  const handleRunXCloud = (username: string, code: string) =>
    handleActivatePlayer(username, code, 'xcloud', 'X-Cloud');

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

  const handleGenerateTest = async () => {
    if (!testMac.trim()) {
      toast.error('MAC Address é obrigatório para gerar teste.');
      return;
    }
    setIsLoading(true);
    const pending = toast.loading('Gerando teste 6h no CMS... acompanhe no seu Chrome 👀');
    try {
      const response = await fetch('/api/automations/startpainel/create-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: testUsername,
          mac: testMac,
          playerName: testPlayer
        })
      });
      const data = await response.json();
      toast.dismiss(pending);
      if (data.success) {
        toast.success(`Teste gerado com sucesso!\nUsuário: ${data.username}\nSenha: ${data.password || 'N/A'}`);
        setTestUsername('');
        setTestMac('');
        loadCustomers(); // Atualiza lista para ver o novo cliente 'teste'
      } else {
        toast.error(data.message || 'Falha ao gerar teste.');
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
      const response = await authFetch(`/api/panel/renew/${username}`, { method: 'POST' });
      const data = await response.json();
      if (data?.success) {
        toast.success(data.message || `Cliente ${username} renovado!`);
      } else {
        toast.error(data?.message || data?.error || 'Falha ao renovar');
      }
    } catch (error: any) {
      toast.error(`Erro: ${error.message}`);
    } finally { setIsLoading(false); }
  };

  return (
    <div className="p-2 sm:p-4 bg-slate-50 min-h-full">
      <div className="max-w-5xl mx-auto space-y-3 sm:space-y-4 pb-24 sm:pb-20">
        
        {/* Header with Navigation */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-3 sm:p-4 flex flex-col gap-3">
            {/* Logo + status */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-lg shrink-0">
                <Brain size={18} className="text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-tighter">StartPainel Admin</h2>
                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${dbStatus.status === 'connected' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{dbStatus.status}</span>
                  </div>
                  {queueStatus.isBusy && (
                    <div className="flex items-center gap-1.5 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                      <RefreshCw size={10} className="text-amber-500 animate-spin" />
                      <span className="text-[8px] text-amber-600 font-black uppercase tracking-widest truncate max-w-[160px]">
                        {queueStatus.processing?.type} {queueStatus.pending.length > 0 ? `(+${queueStatus.pending.length})` : ''}
                      </span>
                    </div>
                  )}
                  {(queueStatus.pending.length > 0 || queueStatus.isBusy || queueStatus.workerOnline === false) && (
                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${
                      queueStatus.workerOnline ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${queueStatus.workerOnline ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`} />
                      <span className={`text-[8px] font-black uppercase tracking-widest ${queueStatus.workerOnline ? 'text-emerald-700' : 'text-rose-700'}`}>
                        PC {queueStatus.workerOnline ? 'online' : 'offline'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Navegação por abas — scrollável no mobile */}
            <div className="overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
              <div className="flex bg-slate-100 p-1 rounded-xl min-w-max sm:min-w-0">
                {(
                  [
                    { id: 'users',       label: 'Clientes',      icon: <User size={12} /> },
                    { id: 'financial',   label: 'Financeiro',    icon: <DollarSign size={12} /> },
                    { id: 'automations', label: 'Automações',    icon: <Cpu size={12} /> },
                    { id: 'ai',          label: 'Dashboard IA',  icon: <Brain size={12} /> },
                    { id: 'startflix',   label: 'Startflix',     icon: <Monitor size={12} /> },
                    { id: 'wareztv',     label: 'Wareztv',       icon: <Tv size={12} /> },
                    { id: 'android',     label: 'App Android',   icon: <Smartphone size={12} /> },
                    { id: 'settings',    label: 'Config',        icon: <Save size={12} /> },
                    { id: 'm3u',         label: 'Pool M3U',      icon: <Globe size={12} /> },
                  ] as { id: typeof activeSubTab; label: string; icon: React.ReactNode }[]
                ).map(({ id, label, icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveSubTab(id)}
                    className={`flex items-center gap-1.5 px-4 sm:px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                      activeSubTab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <span className="sm:hidden">{icon}</span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
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
                  {/* Gerar Teste Rápido Section */}
                  <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-3xl border border-slate-700 shadow-xl space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-700 pb-3">
                      <Zap size={18} className="text-amber-400" />
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-slate-200">Gerar Teste Rápido (CMS)</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Usuário (Opcional)</label>
                        <input value={testUsername} onChange={e => setTestUsername(e.target.value)} placeholder="Deixe vazio p/ auto" className="w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:border-amber-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase ml-1">
                          {testPlayer === 'X-CLOUD' ? 'Código de Ativação' : 'Endereço MAC'}
                        </label>
                        <input 
                          value={testMac} 
                          onChange={e => setTestMac(e.target.value)} 
                          placeholder={testPlayer === 'X-CLOUD' ? 'Ex: 1J616K' : '00:11:22...'} 
                          className="w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700 rounded-xl text-xs font-mono text-white outline-none focus:border-amber-500" 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Player</label>
                        <select value={testPlayer} onChange={e => setTestPlayer(e.target.value)} className="w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:border-amber-500">
                          <option>ULTRA PLAYER</option>
                          <option>FUN PLAY</option>
                          <option>X-CLOUD</option>
                          <option>IBO PLAYER</option>
                        </select>
                      </div>
                      <div className="flex items-end">
                        <button 
                          onClick={handleGenerateTest}
                          disabled={isLoading || !testMac}
                          className="w-full bg-amber-500 text-white py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all shadow-lg shadow-amber-900/20 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {isLoading ? <RefreshCw className="animate-spin" size={14} /> : <Zap size={14} />}
                          Gerar Teste 6h
                        </button>
                      </div>
                    </div>
                    <p className="text-[8px] text-slate-500 font-medium italic px-1">
                      * O sistema criará o teste no CMS, ativará o player e salvará as credenciais no banco local.
                    </p>
                  </div>

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
                      <div className="sm:col-span-1 lg:col-span-2 space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Senha da Lista</label>
                        <input type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Senha da lista IPTV" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500 outline-none" />
                      </div>
                      <div className="sm:col-span-1 lg:col-span-2 space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">DNS / Provedor</label>
                        {newProvider === 'zaplay' ? (
                          <div className="w-full px-3 py-2.5 bg-green-50 border border-green-200 rounded-xl text-xs font-bold text-green-700 flex items-center gap-2">
                            <span>🌐</span>
                            <span>Usa DNS global (⚙️ Configurações → Servidores DNS)</span>
                          </div>
                        ) : (
                          <input type="text" value={newDns} onChange={e => setNewDns(e.target.value)} placeholder="Ex: http://dns.com:8080 (vazio = usa DNS global)" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500 outline-none" />
                        )}
                      </div>

                      {/* Provedor do cliente */}
                      <div className="sm:col-span-2 lg:col-span-4 space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Provedor</label>
                        <div className="flex gap-2">
                          {[
                            { value: 'startpainel', label: 'Start',   active: 'border-indigo-500 bg-indigo-50 text-indigo-700' },
                            { value: 'zaplay',      label: 'Zaplay',  active: 'border-green-500 bg-green-50 text-green-700'    },
                            { value: 'wareztv',     label: 'WarezTV', active: 'border-orange-400 bg-orange-50 text-orange-700' },
                            { value: 'outro',       label: 'Outro',   active: 'border-slate-400 bg-slate-100 text-slate-700'   },
                          ].map(p => (
                            <button
                              key={p.value}
                              type="button"
                              onClick={() => setNewProvider(p.value)}
                              className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border-2 transition-all ${
                                newProvider === p.value ? p.active : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
                              }`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Seletor de app do catálogo */}
                      {catalogApps.filter(a => a.is_active).length > 0 && (
                        <div className="sm:col-span-2 lg:col-span-4 space-y-2">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                            App que o cliente vai usar
                            {selectedCatalogAppId && (
                              <button
                                type="button"
                                onClick={() => setSelectedCatalogAppId(null)}
                                className="ml-2 text-rose-400 hover:text-rose-600 normal-case tracking-normal font-bold"
                              >
                                Limpar seleção ×
                              </button>
                            )}
                          </label>
                          <div className="flex gap-2 overflow-x-auto pb-1 snap-x">
                            {catalogApps.filter(a => a.is_active).map(app => {
                              const selected = selectedCatalogAppId === app.id;
                              return (
                                <button
                                  key={app.id}
                                  type="button"
                                  onClick={() => setSelectedCatalogAppId(selected ? null : app.id)}
                                  className={`flex-shrink-0 snap-start flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all w-[76px] ${
                                    selected
                                      ? 'border-emerald-500 bg-emerald-50 shadow-sm shadow-emerald-100'
                                      : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                                  }`}
                                >
                                  <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                                    {app.app_image_url ? (
                                      <img src={app.app_image_url} alt={app.name} className="w-full h-full object-cover" />
                                    ) : (
                                      <Smartphone size={18} className="text-slate-300" />
                                    )}
                                  </div>
                                  <span className="text-[9px] font-black text-center text-slate-700 leading-tight line-clamp-2 w-full">{app.name}</span>
                                  {selected && (
                                    <span className="text-[8px] font-black text-emerald-600 uppercase tracking-wider">✓ Selecionado</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                          {selectedCatalogAppId && (
                            <p className="text-[10px] text-emerald-600 font-bold ml-1">
                              App "{catalogApps.find(a => a.id === selectedCatalogAppId)?.name}" será registrado automaticamente para este cliente.
                            </p>
                          )}
                        </div>
                      )}

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
                      <option value="teste">Clientes em Teste</option>
                      <option value="expired">Vencidos</option>
                    </select>
                    <select
                      value={providerFilter}
                      onChange={e => setProviderFilter(e.target.value as any)}
                      className="px-4 py-3 rounded-2xl border border-slate-200 shadow-sm text-xs font-bold outline-none focus:border-emerald-500 bg-white"
                    >
                      <option value="all">Todos os Provedores</option>
                      <option value="startpainel">Start</option>
                      <option value="zaplay">Zaplay</option>
                      <option value="wareztv">WarezTV</option>
                      <option value="outro">Outro</option>
                    </select>
                  </div>

                  {/* Customers Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {customers.filter(c => {
                      const matchesSearch = c.username.toLowerCase().includes(searchTerm.toLowerCase()) || (c.whatsapp && c.whatsapp.includes(searchTerm));
                      const isExpired = c.expiration_date ? new Date(c.expiration_date) < new Date() : false;
                      const matchesStatus = statusFilter === 'all' ? true :
                                           (statusFilter === 'active' ? (!isExpired && c.status !== 'teste') :
                                           (statusFilter === 'expired' ? isExpired :
                                           (statusFilter === 'teste' ? c.status === 'teste' : true)));
                      const matchesProvider = providerFilter === 'all' ? true : (c.provider || 'startpainel') === providerFilter;
                      return matchesSearch && matchesStatus && matchesProvider;
                    }).map(customer => (
                      <motion.div key={customer.id} layout className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden group hover:border-emerald-200 transition-all">
                        <div className="p-4 space-y-4">
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-emerald-50 group-hover:text-emerald-500 transition-colors">
                                <User size={20} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-black text-slate-800 text-sm tracking-tight">{customer.name || customer.username}</h4>
                                  {customer.status === 'teste' && (
                                    <span className="text-[8px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-black uppercase tracking-widest border border-amber-200">Teste</span>
                                  )}
                                  {/* Badge de provedor */}
                                  {(() => {
                                    const badges: Record<string, string> = { startpainel: 'bg-indigo-100 text-indigo-600', zaplay: 'bg-green-100 text-green-700', wareztv: 'bg-orange-100 text-orange-600', outro: 'bg-slate-100 text-slate-500' };
                                    const labels: Record<string, string> = { startpainel: 'Start', zaplay: 'Zaplay', wareztv: 'WarezTV', outro: 'Outro' };
                                    const p = customer.provider || 'startpainel';
                                    return <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-widest ${badges[p] || 'bg-slate-100 text-slate-500'}`}>{labels[p] || p}</span>;
                                  })()}
                                </div>
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
                            {/* Números vinculados */}
                            <button
                              onClick={() => openPhonesModal(customer)}
                              className="p-2.5 text-teal-500 bg-teal-50 rounded-xl hover:bg-teal-100 transition-all"
                              title="Gerenciar números vinculados"
                            >
                              <Phone size={16} />
                            </button>
                            {/* Migrar para WarezTV — só para clientes não-WarezTV */}
                            {customer.provider !== 'wareztv' && (
                              <button
                                onClick={() => { setMigrateCustomer(customer); setMigrateResult(null); setMigrateDays('30'); }}
                                className="p-2.5 text-orange-500 bg-orange-50 rounded-xl hover:bg-orange-100 transition-all"
                                title="Migrar para WarezTV"
                              >
                                <ArrowRightLeft size={16} />
                              </button>
                            )}
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
            case 'settings':
              return (
                <div className="space-y-6">
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
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">📱 WhatsApp Suporte (App)</label>
                        <div className="flex items-center gap-3 bg-slate-800/50 p-3 rounded-2xl border border-slate-700">
                          <span className="text-green-400 text-base leading-none">🟢</span>
                          <input
                            type="text"
                            value={whatsappSupport}
                            onChange={e => setWhatsappSupport(e.target.value)}
                            placeholder="5511999999999  (com código do país, sem espaço)"
                            className="bg-transparent border-none text-white text-xs font-mono w-full focus:ring-0 outline-none"
                          />
                        </div>
                        <p className="text-[9px] text-slate-500 ml-1">Exibido como botão flutuante na tela de login do app Android.</p>
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
                      <button onClick={handleSaveSettings} disabled={isSavingKey} className="w-full sm:w-auto bg-emerald-500 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2">
                        <Save size={14} />
                        {isSavingKey ? 'Salvando...' : 'Salvar Configurações'}
                      </button>
                    </div>
                  </div>

                  {/* ───── Tabela de Preços de Venda ───── */}
                  <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-5">
                    <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
                      <DollarSign size={18} className="text-emerald-500" />
                      <div>
                        <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Tabela de Preços de Venda</h3>
                        <p className="text-[9px] text-slate-400 mt-0.5">Valores que a IA informa aos clientes. Alterações entram em vigor imediatamente.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* 1 Tela */}
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">1 Tela</span>
                          <span className="text-[9px] bg-blue-100 text-blue-600 font-bold px-2 py-0.5 rounded-full">Básico</span>
                        </div>
                        <p className="text-[9px] text-slate-400">1 dispositivo simultâneo</p>
                        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
                          <span className="text-[11px] font-black text-slate-500">R$</span>
                          <input
                            type="number"
                            min="1"
                            step="0.01"
                            value={planPrice1}
                            onChange={e => setPlanPrice1(e.target.value)}
                            className="bg-transparent border-none text-slate-800 text-lg font-black w-full focus:ring-0 outline-none"
                          />
                          <span className="text-[9px] text-slate-400 whitespace-nowrap">/mês</span>
                        </div>
                      </div>

                      {/* 2 Telas */}
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">2 Telas</span>
                          <span className="text-[9px] bg-emerald-100 text-emerald-600 font-bold px-2 py-0.5 rounded-full">Popular</span>
                        </div>
                        <p className="text-[9px] text-slate-400">2 dispositivos simultâneos</p>
                        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
                          <span className="text-[11px] font-black text-slate-500">R$</span>
                          <input
                            type="number"
                            min="1"
                            step="0.01"
                            value={planPrice2}
                            onChange={e => setPlanPrice2(e.target.value)}
                            className="bg-transparent border-none text-slate-800 text-lg font-black w-full focus:ring-0 outline-none"
                          />
                          <span className="text-[9px] text-slate-400 whitespace-nowrap">/mês</span>
                        </div>
                      </div>

                      {/* 3 Telas */}
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">3 Telas</span>
                          <span className="text-[9px] bg-purple-100 text-purple-600 font-bold px-2 py-0.5 rounded-full">Premium</span>
                        </div>
                        <p className="text-[9px] text-slate-400">3 dispositivos simultâneos</p>
                        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
                          <span className="text-[11px] font-black text-slate-500">R$</span>
                          <input
                            type="number"
                            min="1"
                            step="0.01"
                            value={planPrice3}
                            onChange={e => setPlanPrice3(e.target.value)}
                            className="bg-transparent border-none text-slate-800 text-lg font-black w-full focus:ring-0 outline-none"
                          />
                          <span className="text-[9px] text-slate-400 whitespace-nowrap">/mês</span>
                        </div>
                      </div>
                    </div>

                    {/* Taxa de ativação — Apps Pagos */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-slate-100" />
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Taxa de Ativação — Apps Pagos (por aparelho / ano)</span>
                        <div className="h-px flex-1 bg-slate-100" />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {([
                          { label: 'IBO Player',  value: feeIbo,       set: setFeeIbo,       color: 'border-orange-200 bg-orange-50' },
                          { label: 'IBO Pro',     value: feeIboPro,    set: setFeeIboPro,    color: 'border-orange-200 bg-orange-50' },
                          { label: 'VU Player',   value: feeVuPlayer,  set: setFeeVuPlayer,  color: 'border-violet-200 bg-violet-50' },
                          { label: 'BOB Player',  value: feeBobPlayer, set: setFeeBobPlayer, color: 'border-rose-200 bg-rose-50' },
                        ] as { label: string; value: string; set: (v: string) => void; color: string }[]).map(({ label, value, set, color }) => (
                          <div key={label} className={`border ${color} rounded-2xl p-3 space-y-2`}>
                            <span className="text-[10px] font-black text-slate-600 block">{label}</span>
                            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2 py-1.5">
                              <span className="text-[10px] font-black text-slate-400">R$</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={value}
                                onChange={e => set(e.target.value)}
                                className="bg-transparent border-none text-slate-800 text-sm font-black w-full focus:ring-0 outline-none"
                              />
                              <span className="text-[8px] text-slate-400 whitespace-nowrap">/ativ.</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Preview do que a IA vai falar */}
                    <div className="bg-slate-900 rounded-2xl p-4 space-y-2">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Preview — O que a IA informará ao cliente</p>
                      <div className="flex flex-wrap gap-3 mt-2">
                        {[
                          { label: '1 tela', value: planPrice1, color: 'text-blue-400' },
                          { label: '2 telas', value: planPrice2, color: 'text-emerald-400' },
                          { label: '3 telas', value: planPrice3, color: 'text-purple-400' },
                        ].map(({ label, value, color }) => (
                          <div key={label} className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-xl">
                            <span className="text-[10px] text-slate-400">{label}:</span>
                            <span className={`text-[13px] font-black ${color}`}>R$ {value || '—'}</span>
                            <span className="text-[9px] text-slate-500">/mês</span>
                          </div>
                        ))}
                        {([
                          { label: 'IBO', fee: feeIbo },
                          { label: 'IBO Pro', fee: feeIboPro },
                          { label: 'VU Player', fee: feeVuPlayer },
                          { label: 'BOB Player', fee: feeBobPlayer },
                        ] as { label: string; fee: string }[]).map(({ label, fee }) => (
                          <div key={label} className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-xl">
                            <span className="text-[10px] text-slate-400">{label}:</span>
                            <span className="text-[13px] font-black text-orange-400">+R$ {fee || '—'}</span>
                            <span className="text-[9px] text-slate-500">/ativ.</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={handleSavePrices}
                        disabled={isSavingPrices}
                        className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-emerald-900/20"
                      >
                        <Save size={13} />
                        {isSavingPrices ? 'Salvando...' : 'Salvar Preços'}
                      </button>
                    </div>
                  </div>

                  {/* ───── URL Servidor XC IPTV / IPTV Smarters ───── */}
                  <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
                      <span className="text-base">🖥️</span>
                      <div>
                        <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Servidor XC IPTV / IPTV Smarters</h3>
                        <p className="text-[9px] text-slate-400 mt-0.5">URL que a IA informa ao cliente ao configurar XC IPTV ou IPTV Smarters. Formato: http://dominio:porta</p>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">URL do Servidor</label>
                      <input
                        type="text"
                        value={xciptvUrl}
                        onChange={e => setXciptvUrl(e.target.value)}
                        placeholder="http://smartlite.site:8880"
                        className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
                      />
                      <p className="text-[9px] text-slate-400">O cliente usa essa URL + usuário + senha para entrar no XC IPTV ou IPTV Smarters.</p>
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={handleSaveXcUrl}
                        disabled={isSavingXcUrl}
                        className="flex items-center gap-2 px-6 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-blue-900/20"
                      >
                        <Save size={13} />
                        {isSavingXcUrl ? 'Salvando...' : 'Salvar URL'}
                      </button>
                    </div>
                  </div>

                  {/* ───── Catálogo de Apps ───── */}
                  <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Smartphone size={18} className="text-indigo-500" />
                        <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Catálogo de Apps</h3>
                        <span className="text-[9px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full">{catalogApps.length} apps</span>
                      </div>
                      <button
                        onClick={openNewCatalogForm}
                        className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase rounded-xl transition-all"
                      >
                        <Plus size={13} /> Novo App
                      </button>
                    </div>

                    {/* Formulário (novo ou editar) */}
                    <AnimatePresence>
                      {editingCatalogId !== null && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 space-y-4">
                            <p className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">
                              {editingCatalogId === 'new' ? '+ Novo App no Catálogo' : `Editando: ${catalogApps.find(a => a.id === editingCatalogId)?.name}`}
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {/* Nome */}
                              <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Nome *</label>
                                <input value={catalogForm.name} onChange={e => setCatalogForm(f => ({...f, name: e.target.value}))}
                                  placeholder="ex: IBO Player Pro" className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                              </div>

                              {/* Tipo */}
                              <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Dispositivo</label>
                                <select value={catalogForm.device_type} onChange={e => setCatalogForm(f => ({...f, device_type: e.target.value}))}
                                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500">
                                  <option value="todos">Todos</option>
                                  <option value="celular">Celular</option>
                                  <option value="tv">TV / TV Box</option>
                                  <option value="pc">PC / Mac</option>
                                </select>
                              </div>

                              {/* Descrição */}
                              <div className="space-y-1 sm:col-span-2">
                                <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Descrição curta</label>
                                <input value={catalogForm.description} onChange={e => setCatalogForm(f => ({...f, description: e.target.value}))}
                                  placeholder="ex: Melhor app para Smart TV Samsung" className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500" />
                              </div>

                              {/* Links */}
                              <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Link Android</label>
                                <input value={catalogForm.android_link} onChange={e => setCatalogForm(f => ({...f, android_link: e.target.value}))}
                                  placeholder="https://play.google.com/..." className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-500" />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Link iOS</label>
                                <input value={catalogForm.ios_link} onChange={e => setCatalogForm(f => ({...f, ios_link: e.target.value}))}
                                  placeholder="https://apps.apple.com/..." className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-500" />
                              </div>
                              <div className="space-y-1 sm:col-span-2">
                                <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Link Web / APK direto</label>
                                <input value={catalogForm.web_link} onChange={e => setCatalogForm(f => ({...f, web_link: e.target.value}))}
                                  placeholder="https://..." className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-500" />
                              </div>

                              {/* ── Vídeos ── */}
                              <div className="sm:col-span-2 border-t border-indigo-100 pt-3 space-y-3">
                                <p className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">🎬 Tutorial de Instalação</p>

                                {/* YouTube URL */}
                                <div className="space-y-1">
                                  <label className="text-[9px] font-black text-slate-500 uppercase ml-1">URL do YouTube <span className="text-slate-400 normal-case font-normal">(enviado como link ao cliente)</span></label>
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg">▶️</span>
                                    <input value={catalogForm.youtube_url} onChange={e => setCatalogForm(f => ({...f, youtube_url: e.target.value}))}
                                      placeholder="https://youtube.com/watch?v=..." className="flex-1 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-red-400" />
                                    {catalogForm.youtube_url && (
                                      <a href={catalogForm.youtube_url} target="_blank" rel="noreferrer"
                                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Abrir">
                                        <ExternalLink size={14} />
                                      </a>
                                    )}
                                  </div>
                                </div>

                                {/* Vídeo upload */}
                                <div className="space-y-1">
                                  <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Vídeo de exemplo <span className="text-slate-400 normal-case font-normal">(enviado direto pelo WhatsApp, máx 50MB)</span></label>
                                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                                    {catalogForm.install_video_url ? (
                                      <div className="flex items-center gap-2 flex-1 bg-white border border-emerald-200 rounded-xl px-3 py-2">
                                        <span className="text-base">📹</span>
                                        <span className="text-[10px] font-bold text-emerald-700 flex-1 truncate">Vídeo enviado</span>
                                        <a href={catalogForm.install_video_url} target="_blank" rel="noreferrer"
                                          className="text-[9px] text-emerald-600 hover:text-emerald-800 font-black underline">Ver</a>
                                        <button onClick={() => setCatalogForm(f => ({...f, install_video_url: ''}))}
                                          className="text-rose-400 hover:text-rose-600 ml-1"><X size={13} /></button>
                                      </div>
                                    ) : (
                                      <label className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                                        catalogUploading === 'install_video_url' ? 'border-indigo-300 bg-indigo-50 text-indigo-600' : 'border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 text-slate-500'
                                      }`}>
                                        <input type="file" accept="video/*" className="hidden"
                                          onChange={e => e.target.files?.[0] && handleCatalogUpload(e.target.files[0], 'install_video_url')} />
                                        <span className="text-base">📹</span>
                                        <span className="text-[10px] font-black uppercase">
                                          {catalogUploading === 'install_video_url' ? 'Enviando...' : 'Selecionar vídeo'}
                                        </span>
                                      </label>
                                    )}

                                    {/* Imagem do app */}
                                    <div className="flex items-center gap-2">
                                      <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                                        {catalogForm.app_image_url ? (
                                          <img src={catalogForm.app_image_url} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                          <Smartphone size={16} className="text-slate-300" />
                                        )}
                                      </div>
                                      <label className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed cursor-pointer transition-all text-[10px] font-black uppercase ${
                                        catalogUploading === 'app_image_url' ? 'border-indigo-300 bg-indigo-50 text-indigo-600' : 'border-slate-300 hover:border-indigo-400 text-slate-500'
                                      }`}>
                                        <input type="file" accept="image/*" className="hidden"
                                          onChange={e => e.target.files?.[0] && handleCatalogUpload(e.target.files[0], 'app_image_url')} />
                                        {catalogUploading === 'app_image_url' ? 'Enviando...' : 'Ícone do App'}
                                      </label>
                                    </div>
                                  </div>
                                </div>

                                {/* Imagens tutoriais 1 a 5 (enviadas em sequência ao cliente) */}
                                <div className="space-y-2 sm:col-span-2">
                                  <label className="text-[9px] font-black text-slate-500 uppercase ml-1">
                                    Imagens do tutorial (1 a 5) <span className="text-slate-400 normal-case font-normal">— enviadas em ordem como passos pelo WhatsApp, máx 5MB cada</span>
                                  </label>
                                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                    {([1, 2, 3, 4, 5] as const).map(n => {
                                      const field = `image_${n}_url` as keyof typeof catalogForm;
                                      const url = catalogForm[field] as string;
                                      return (
                                        <div key={n} className="relative">
                                          <label className={`group flex flex-col items-center justify-center gap-1 aspect-square rounded-xl border-2 border-dashed cursor-pointer transition-all overflow-hidden ${
                                            catalogUploading === field ? 'border-indigo-300 bg-indigo-50' : url ? 'border-emerald-300 bg-white' : 'border-slate-300 hover:border-indigo-400 hover:bg-indigo-50'
                                          }`}>
                                            <input type="file" accept="image/*" className="hidden"
                                              onChange={e => e.target.files?.[0] && handleCatalogUpload(e.target.files[0], field)} />
                                            {url ? (
                                              <img src={url} alt={`Passo ${n}`} className="w-full h-full object-cover" />
                                            ) : (
                                              <>
                                                <span className="text-[10px] font-black text-slate-400">{catalogUploading === field ? '...' : `+ ${n}`}</span>
                                                <span className="text-[7px] font-bold text-slate-400 uppercase">Passo {n}</span>
                                              </>
                                            )}
                                          </label>
                                          {url && (
                                            <button onClick={() => setCatalogForm(f => ({ ...f, [field]: '' }))}
                                              className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full p-0.5 shadow-md hover:bg-rose-600 transition-all" title="Remover">
                                              <X size={11} />
                                            </button>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>

                              {/* Ordem + Status */}
                              <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Ordem de exibição</label>
                                <input type="number" value={catalogForm.display_order} onChange={e => setCatalogForm(f => ({...f, display_order: Number(e.target.value)}))}
                                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                              </div>
                              <div className="flex items-center gap-3 pt-4">
                                <button
                                  onClick={() => setCatalogForm(f => ({...f, is_active: !f.is_active}))}
                                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all border ${
                                    catalogForm.is_active ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-slate-100 border-slate-300 text-slate-500'
                                  }`}
                                >
                                  {catalogForm.is_active ? '✅ Ativo' : '⏸️ Inativo'}
                                </button>
                              </div>
                            </div>

                            {/* Botões ação */}
                            <div className="flex gap-3 pt-1">
                              <button onClick={handleSaveCatalogApp} disabled={catalogSaving || !!catalogUploading}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50">
                                <Save size={13} /> {catalogSaving ? 'Salvando...' : editingCatalogId === 'new' ? 'Adicionar ao Catálogo' : 'Salvar Alterações'}
                              </button>
                              <button onClick={() => setEditingCatalogId(null)}
                                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase transition-all">
                                Cancelar
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Lista de apps */}
                    <div className="space-y-2">
                      {catalogApps.length === 0 && (
                        <div className="py-10 text-center border-2 border-dashed border-slate-200 rounded-2xl">
                          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Nenhum app no catálogo</p>
                        </div>
                      )}
                      {catalogApps.map(app => (
                        <div key={app.id} className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                          editingCatalogId === app.id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                        }`}>
                          {/* Ícone */}
                          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                            {app.app_image_url ? (
                              <img src={app.app_image_url} alt={app.name} className="w-full h-full object-cover" />
                            ) : (
                              <Smartphone size={16} className="text-slate-300" />
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-slate-800 truncate">{app.name}</p>
                            <div className="flex items-center gap-2 flex-wrap mt-0.5">
                              <span className="text-[9px] font-bold text-slate-400 uppercase">{app.device_type}</span>
                              {!app.is_active && <span className="text-[8px] font-black bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full uppercase">Inativo</span>}
                              {app.youtube_url && <span className="text-[8px] font-black bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">▶ YouTube</span>}
                              {app.install_video_url && <span className="text-[8px] font-black bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">📹 Vídeo</span>}
                            </div>
                          </div>

                          {/* Ações */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => editingCatalogId === app.id ? setEditingCatalogId(null) : openEditCatalogForm(app)}
                              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all text-[10px] font-black uppercase">
                              {editingCatalogId === app.id ? 'Fechar' : 'Editar'}
                            </button>
                            <button onClick={() => handleDeleteCatalogApp(app.id, app.name)}
                              className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            case 'm3u':
              return (
                <div className="space-y-4">
                  {/* Header com indicador de auto-refresh */}
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-black text-slate-700 uppercase tracking-widest">Pool M3U</h2>
                    {m3uFetchError ? (
                      <span className="flex items-center gap-1.5 text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-1 rounded-full">
                        ⚠ Erro ao carregar · {m3uFetchError}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                        </span>
                        Ao vivo · atualiza a cada 5s
                        {m3uLastUpdated && (
                          <span className="text-emerald-400 ml-1">
                            {m3uLastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        )}
                      </span>
                    )}
                  </div>

                  {/* Stats bar */}
                  {m3uStats && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Listas no Pool', value: m3uStats.lists_active, color: 'bg-slate-900 text-white', sub: `${m3uStats.lists_total} total` },
                        { label: 'Em Uso Agora',   value: m3uStats.lists_in_use,  color: 'bg-amber-500 text-white',  sub: 'leases ativas' },
                        { label: 'Disponíveis',    value: m3uStats.lists_available, color: 'bg-emerald-500 text-white', sub: 'prontas p/ usar' },
                        { label: 'Códigos Ativos', value: m3uStats.codes_active,  color: 'bg-indigo-500 text-white',  sub: `${m3uStats.codes_total} total` },
                      ].map(s => (
                        <div key={s.label} className={`${s.color} p-4 rounded-2xl shadow-sm`}>
                          <p className="text-[9px] font-black uppercase tracking-widest opacity-70">{s.label}</p>
                          <p className="text-3xl font-black mt-1">{s.value ?? '—'}</p>
                          <p className="text-[9px] opacity-60 mt-0.5">{s.sub}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Sub-tabs */}
                  <div className="flex bg-slate-100 p-1 rounded-xl overflow-x-auto no-scrollbar">
                    {(['lists', 'codes', 'leases'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setM3uTab(t)}
                        className={`flex-1 py-2 px-4 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                          m3uTab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {t === 'lists' ? '📋 Listas' : t === 'codes' ? '🔑 Códigos' : '📡 Conectados'}
                      </button>
                    ))}
                  </div>

                  {/* ---- Listas ---- */}
                  {m3uTab === 'lists' && (
                    <div className="space-y-4">
                      {/* Formulário adicionar */}
                      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                          <Plus size={14} className="text-emerald-500" /> Adicionar Lista ao Pool
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Nome Identificador</label>
                            <input
                              value={m3uNewName} onChange={e => setM3uNewName(e.target.value)}
                              placeholder="ex: Lista Premium 01"
                              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase ml-1">URL M3U</label>
                            <input
                              value={m3uNewUrl} onChange={e => setM3uNewUrl(e.target.value)}
                              placeholder="http://servidor.com:8080/get.php?username=...&type=m3u"
                              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Observações (opcional)</label>
                            <input
                              value={m3uNewNotes} onChange={e => setM3uNewNotes(e.target.value)}
                              placeholder="ex: 4K, validade 2026..."
                              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                        </div>
                        <button
                          onClick={handleM3uAddList} disabled={m3uSaving}
                          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-slate-900 text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all disabled:opacity-50"
                        >
                          <Plus size={14} /> {m3uSaving ? 'Salvando...' : 'Adicionar ao Pool'}
                        </button>
                      </div>

                      {/* Lista de URLs */}
                      <div className="space-y-2">
                        {m3uLoading && <p className="text-center text-xs text-slate-400 py-8">Carregando...</p>}
                        {!m3uLoading && m3uLists.length === 0 && (
                          <div className="py-12 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nenhuma lista no pool ainda</p>
                          </div>
                        )}
                        {m3uLists.map(list => (
                          <div key={list.id} className={`bg-white rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3 transition-all ${
                            list.is_active ? 'border-slate-200' : 'border-slate-100 opacity-50'
                          }`}>
                            <div className="flex-1 min-w-0 space-y-0.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-black text-slate-800">{list.name}</span>
                                {Number(list.active_leases) > 0 && (
                                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-black rounded-full uppercase">
                                    Em uso
                                  </span>
                                )}
                                {!list.is_active && (
                                  <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[9px] font-black rounded-full uppercase">
                                    Pausada
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400 font-mono truncate">{list.m3u_url}</p>
                              {list.notes && <p className="text-[9px] text-slate-500 italic">{list.notes}</p>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => handleM3uToggleList(list.id, list.is_active)}
                                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${
                                  list.is_active
                                    ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                }`}
                              >
                                {list.is_active ? 'Pausar' : 'Ativar'}
                              </button>
                              <button
                                onClick={() => handleM3uDeleteList(list.id)}
                                className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ---- Códigos ---- */}
                  {m3uTab === 'codes' && (
                    <div className="space-y-4">
                      {/* Formulário novo código */}
                      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                          <Key size={14} className="text-indigo-500" /> Gerar Código de Acesso
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Identificação (opcional)</label>
                            <input
                              value={m3uNewCodeLabel} onChange={e => setM3uNewCodeLabel(e.target.value)}
                              placeholder="ex: Cliente João, Plano Basic..."
                              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Código personalizado (opcional)</label>
                            <input
                              value={m3uNewCodeCustom} onChange={e => setM3uNewCodeCustom(e.target.value.toUpperCase())}
                              placeholder="AUTO se vazio — ex: JOAO2026"
                              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono uppercase outline-none focus:ring-2 focus:ring-indigo-500"
                              maxLength={32}
                            />
                          </div>
                        </div>
                        <p className="text-[9px] text-slate-400 -mt-1">
                          Deixe o código em branco para gerar automaticamente (8 caracteres aleatórios).
                        </p>
                        <button
                          onClick={handleM3uAddCode} disabled={m3uSaving}
                          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50"
                        >
                          <Key size={14} /> {m3uSaving ? 'Gerando...' : 'Gerar Código'}
                        </button>
                      </div>

                      {/* Lista de códigos */}
                      <div className="space-y-2">
                        {m3uLoading && <p className="text-center text-xs text-slate-400 py-8">Carregando...</p>}
                        {!m3uLoading && m3uCodes.length === 0 && (
                          <div className="py-12 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nenhum código criado ainda</p>
                          </div>
                        )}
                        {m3uCodes.map(c => (
                          <div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                            <div className="flex-1 min-w-0 space-y-0.5">
                              <div className="flex items-center gap-3 flex-wrap">
                                <code className="text-sm font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg tracking-widest">
                                  {c.code}
                                </code>
                                {c.label && <span className="text-xs text-slate-600 font-bold">{c.label}</span>}
                                {Number(c.active_leases) > 0 && (
                                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-black rounded-full uppercase">
                                    Conectado
                                  </span>
                                )}
                              </div>
                              <p className="text-[9px] text-slate-400">Criado {new Date(c.created_at).toLocaleDateString('pt-BR')}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => { navigator.clipboard.writeText(c.code); toast.success(`Código ${c.code} copiado!`); }}
                                className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-[9px] font-black uppercase hover:bg-slate-200 transition-all"
                              >
                                Copiar
                              </button>
                              <button
                                onClick={() => handleM3uDeleteCode(c.id)}
                                className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ---- Conectados / Leases ---- */}
                  {m3uTab === 'leases' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          {m3uLeases.length} usuário(s) conectado(s) agora
                        </p>
                        <div className="flex items-center gap-2">
                          {/* Badge de erro quando o fetch falha */}
                          {m3uFetchError && (
                            <span className="flex items-center gap-1 text-[9px] font-bold text-rose-500 uppercase tracking-wide bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                              ⚠ Erro: {m3uFetchError}
                            </span>
                          )}
                          {/* Indicador live — atualiza a cada 5s */}
                          {!m3uFetchError && (
                            <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-500 uppercase tracking-wide">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                              </span>
                              Ao vivo · {m3uLastUpdated ? m3uLastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                            </span>
                          )}
                          <button onClick={() => loadM3uAll(false)} className="flex items-center gap-1 text-[9px] font-black text-slate-400 hover:text-slate-700 uppercase transition-all">
                            <RefreshCw size={11} />
                          </button>
                        </div>
                      </div>
                      {m3uLoading && <p className="text-center text-xs text-slate-400 py-8">Carregando...</p>}
                      {!m3uLoading && m3uLeases.length === 0 && !m3uFetchError && (
                        <div className="py-12 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nenhum usuário conectado</p>
                        </div>
                      )}
                      {m3uLeases.map(lease => (
                        <div key={lease.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <code className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded tracking-widest">{lease.code}</code>
                              <span className="text-xs font-bold text-slate-700">→ {lease.list_name}</span>
                              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                            </div>
                            <div className="flex items-center gap-4 flex-wrap text-[9px] text-slate-400 font-bold uppercase">
                              <span>⏱ {lease.minutes_connected} min conectado</span>
                              <span>💓 heartbeat {lease.minutes_since_heartbeat} min atrás</span>
                              {lease.device_id && <span>📱 {lease.device_id}</span>}
                            </div>
                            <p className="text-[9px] text-slate-300 font-mono truncate">{lease.m3u_url}</p>
                          </div>
                          <button
                            onClick={() => handleM3uRevokeLeases(lease.id)}
                            className="shrink-0 px-3 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg text-[9px] font-black uppercase transition-all"
                          >
                            Revogar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
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
            case 'wareztv':
              return (
                <div className="space-y-4">
                  {/* Header */}
                  <div className="bg-gradient-to-br from-violet-900 to-purple-800 p-6 rounded-3xl border border-violet-700 shadow-xl">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center text-white shadow-lg">
                          <Zap size={24} />
                        </div>
                        <div>
                          <h3 className="text-white font-black uppercase tracking-widest text-sm">Wareztv / Wplay</h3>
                          <p className="text-violet-300 text-[10px] font-bold">
                            {warezReseller ? `Créditos: ${warezReseller.credits} | Conta: ${warezReseller.username}` : 'Carregando...'}
                          </p>
                        </div>
                      </div>
                      <button onClick={loadWarezClients} className="p-3 bg-violet-800 text-violet-300 rounded-2xl hover:text-white transition-all border border-violet-700">
                        <RefreshCw size={18} className={warezLoading ? 'animate-spin' : ''} />
                      </button>
                    </div>
                  </div>

                  {/* Create / Generate Test */}
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Novo Cliente / Teste</h4>
                    <div className="flex flex-wrap gap-3">
                      <input
                        type="text"
                        placeholder="Nome do cliente"
                        value={warezNewName}
                        onChange={e => setWarezNewName(e.target.value)}
                        className="flex-1 min-w-[140px] px-4 py-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-violet-400"
                      />
                      <input
                        type="text"
                        placeholder="WhatsApp (opcional)"
                        value={warezNewWhatsapp}
                        onChange={e => setWarezNewWhatsapp(e.target.value)}
                        className="flex-1 min-w-[140px] px-4 py-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-violet-400"
                      />
                      <button
                        onClick={handleWarezGenerateTest}
                        disabled={warezCreating}
                        className="px-5 py-2 bg-amber-500 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-amber-600 transition-all disabled:opacity-50"
                      >
                        {warezCreating ? '...' : 'Gerar Teste 6h'}
                      </button>
                      <button
                        onClick={handleWarezCreateClient}
                        disabled={warezCreating}
                        className="px-5 py-2 bg-violet-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-violet-700 transition-all disabled:opacity-50"
                      >
                        {warezCreating ? '...' : 'Criar Cliente (30d)'}
                      </button>
                    </div>
                  </div>

                  {/* Sub-tabs */}
                  <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
                    <button onClick={() => setWarezTab('clients')} className={`px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${warezTab === 'clients' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                      Clientes ({warezClients.length})
                    </button>
                    <button onClick={() => setWarezTab('tests')} className={`px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${warezTab === 'tests' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                      Testes ({warezTests.length})
                    </button>
                  </div>

                  {/* Search */}
                  <div className="bg-white rounded-2xl border border-slate-200 px-4 py-2">
                    <input
                      type="text"
                      placeholder="Buscar por usuário ou nome..."
                      value={warezSearch}
                      onChange={e => setWarezSearch(e.target.value)}
                      className="w-full text-xs font-bold outline-none bg-transparent"
                    />
                  </div>

                  {/* Table */}
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Usuário / Nome</th>
                            <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Credenciais</th>
                            <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Vencimento</th>
                            <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                            <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(warezTab === 'clients' ? warezClients : warezTests)
                            .filter(c => !warezSearch || c.username?.includes(warezSearch) || c.notes?.toLowerCase().includes(warezSearch.toLowerCase()))
                            .map(client => {
                              const expDate = client.exp_date ? new Date(client.exp_date) : null;
                              const isExpired = expDate ? expDate < new Date() : false;
                              return (
                                <tr key={client.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                  <td className="p-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-500">
                                        <User size={14} />
                                      </div>
                                      <div>
                                        <p className="text-[11px] font-black text-slate-800 font-mono">{client.username}</p>
                                        {client.notes && <p className="text-[9px] text-slate-400 font-bold">{client.notes}</p>}
                                        {client.whatsapp && <p className="text-[9px] text-slate-400">📱 {client.whatsapp}</p>}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="p-4">
                                    <div className="bg-slate-100 p-2 rounded-xl border border-slate-200 space-y-1 font-mono text-[9px]">
                                      <p className="text-slate-500">User: <span className="text-slate-800 font-bold">{client.username}</span></p>
                                      <p className="text-slate-500">Pass: <span className="text-slate-800 font-bold">{client.password}</span></p>
                                    </div>
                                  </td>
                                  <td className="p-4">
                                    <p className={`text-[10px] font-black ${isExpired ? 'text-red-500' : 'text-slate-700'}`}>
                                      {expDate ? expDate.toLocaleDateString('pt-BR') : '—'}
                                    </p>
                                    {client.plan && <p className="text-[9px] text-slate-400">{client.plan.name}</p>}
                                  </td>
                                  <td className="p-4 text-center">
                                    <span className={`inline-block px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${
                                      client.status === 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                                    }`}>
                                      {client.status === 1 ? 'Ativo' : 'Inativo'}
                                    </span>
                                  </td>
                                  <td className="p-4">
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => handleWarezResetPassword(client.id, client.username)}
                                        className="p-2 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-all"
                                        title="Resetar senha"
                                      >
                                        <Key size={14} />
                                      </button>
                                      <button
                                        onClick={() => handleWarezDelete(client.id, client.username)}
                                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                        title="Deletar"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          {(warezTab === 'clients' ? warezClients : warezTests).length === 0 && !warezLoading && (
                            <tr>
                              <td colSpan={5} className="p-8 text-center text-xs text-slate-400 font-bold">
                                {warezLoading ? 'Carregando...' : 'Nenhum cliente encontrado'}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );

            case 'android':
              return (
                <div className="space-y-6">
                  {/* Header */}
                  <div className="bg-white rounded-3xl border border-slate-200 p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                        <Smartphone size={20} className="text-white" />
                      </div>
                      <div>
                        <h2 className="text-base font-black text-slate-900">App Android — Master Player Pro</h2>
                        <p className="text-xs text-slate-500 font-medium">Configure até 5 servidores DNS. O app tenta cada um em ordem até autenticar.</p>
                      </div>
                    </div>
                  </div>

                  {/* DNS List */}
                  <div className="bg-white rounded-3xl border border-slate-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">Servidores DNS</h3>
                      {appDnsLoading && <span className="text-xs text-slate-400 font-medium">Carregando...</span>}
                    </div>
                    <div className="space-y-3">
                      {appDnsList.map((dns, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-[10px] font-black flex items-center justify-center flex-shrink-0">
                            {idx + 1}
                          </span>
                          <input
                            type="url"
                            value={dns}
                            onChange={e => {
                              const next = [...appDnsList];
                              next[idx] = e.target.value;
                              setAppDnsList(next);
                            }}
                            placeholder={idx === 0 ? 'https://servidor-principal.com/iptv/' : `DNS ${idx + 1} (opcional)`}
                            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          />
                          {dns && (
                            <button
                              onClick={() => {
                                const next = [...appDnsList];
                                next[idx] = '';
                                setAppDnsList(next);
                              }}
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                              title="Limpar"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 flex gap-3">
                      <button
                        onClick={saveAppDns}
                        disabled={appDnsSaving}
                        className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-xs font-black rounded-xl transition-all disabled:opacity-50"
                      >
                        <Save size={14} />
                        {appDnsSaving ? 'Salvando...' : 'Salvar DNS'}
                      </button>
                      <button
                        onClick={loadAppDns}
                        className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-black rounded-xl transition-all"
                      >
                        <RefreshCw size={14} />
                        Recarregar
                      </button>
                    </div>
                  </div>

                  {/* APK Download */}
                  <div className="bg-white rounded-3xl border border-slate-200 p-6">
                    <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4">APK do App</h3>
                    <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center flex-shrink-0">
                        <Smartphone size={22} className="text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-black text-slate-800">Master Player Pro</p>
                        <p className="text-xs text-slate-500 font-medium">APK com relay configurado para <span className="font-bold text-slate-700">atendimento.appbr.pro/iptv/</span></p>
                      </div>
                      <a
                        href="/app/download"
                        download="MasterPlayerPro.apk"
                        className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-xs font-black rounded-xl transition-all"
                      >
                        <ExternalLink size={14} />
                        Baixar APK
                      </a>
                    </div>
                    <p className="mt-3 text-[10px] text-slate-400 font-medium">
                      O APK aponta para o nosso servidor relay. Configure os DNS acima para que o app redirecione para o provedor correto.
                    </p>
                  </div>

                  {/* How it works */}
                  <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 text-white">
                    <h3 className="text-xs font-black uppercase tracking-widest mb-4 text-slate-300">Como funciona</h3>
                    <div className="space-y-3">
                      {[
                        { step: '1', text: 'Usuário abre o app e digita login + senha' },
                        { step: '2', text: 'App envia requisição para atendimento.appbr.pro/iptv/' },
                        { step: '3', text: 'Nosso servidor tenta autenticar no DNS 1, 2, 3... até obter resposta válida' },
                        { step: '4', text: 'A resposta do provedor é repassada ao app transparentemente' },
                        { step: '5', text: 'O DNS bem-sucedido fica em cache por 30 min para esse usuário' },
                      ].map(({ step, text }) => (
                        <div key={step} className="flex items-start gap-3">
                          <span className="w-6 h-6 rounded-full bg-white/10 text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">
                            {step}
                          </span>
                          <span className="text-xs text-slate-300 font-medium">{text}</span>
                        </div>
                      ))}
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

                          {!isEditingApp && viewingApp.app_model === 'X-CLOUD' && (
                            <div className="col-span-2">
                              <button
                                onClick={() => handleRunXCloud(customers.find(c => Number(c.id) === selectedCustomerId)?.username || '', viewingApp.mac_address || '')}
                                disabled={isLoading}
                                className="w-full bg-slate-800 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg flex items-center justify-center gap-2"
                              >
                                {isLoading ? <RefreshCw className="animate-spin" size={14} /> : <Cpu size={14} />}
                                Ativar X-Cloud (Robô)
                              </button>
                              <p className="text-[8px] text-slate-400 font-bold uppercase mt-2 text-center">Ativa o Código no StartPainel CMS automaticamente</p>
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
                    
                    <div className="col-span-2 space-y-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase ml-1">
                        Modelo / Player
                        {modalCatalogAppId && (
                          <button
                            type="button"
                            onClick={() => { setModalCatalogAppId(null); setAppModel('IBO PLAYER'); setIconUrl(''); setAndroidLink(''); setIosLink(''); setAppSiteUrl(''); }}
                            className="ml-2 text-rose-400 hover:text-rose-600 normal-case tracking-normal font-bold"
                          >
                            Limpar ×
                          </button>
                        )}
                      </label>
                      {catalogApps.filter(a => a.is_active).length > 0 ? (
                        <div className="flex gap-2 overflow-x-auto pb-1 snap-x">
                          {catalogApps.filter(a => a.is_active).map(app => {
                            const sel = modalCatalogAppId === app.id;
                            return (
                              <button
                                key={app.id}
                                type="button"
                                onClick={() => {
                                  setModalCatalogAppId(sel ? null : app.id);
                                  if (!sel) {
                                    setAppModel(app.name);
                                    setIconUrl(app.app_image_url || '');
                                    setAndroidLink(app.android_link || '');
                                    setIosLink(app.ios_link || '');
                                    setAppSiteUrl(app.web_link || '');
                                    setIsTv(app.device_type === 'tv' || app.device_type === 'todos');
                                  } else {
                                    setAppModel('IBO PLAYER');
                                    setIconUrl('');
                                    setAndroidLink('');
                                    setIosLink('');
                                    setAppSiteUrl('');
                                  }
                                }}
                                className={`flex-shrink-0 snap-start flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all w-[72px] ${
                                  sel
                                    ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                                    : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                                }`}
                              >
                                <div className="w-11 h-11 rounded-xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                                  {app.app_image_url ? (
                                    <img src={app.app_image_url} alt={app.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <Tv size={16} className="text-slate-300" />
                                  )}
                                </div>
                                <span className="text-[8px] font-black text-center text-slate-700 leading-tight line-clamp-2 w-full">{app.name}</span>
                                {sel && <span className="text-[7px] font-black text-emerald-600 uppercase">✓</span>}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <select value={appModel} onChange={e => setAppModel(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none">
                          <option>IBO PLAYER</option>
                          <option>IBO PRO</option>
                          <option>ULTRA PLAYER</option>
                          <option>FUN PLAY</option>
                          <option>X-CLOUD</option>
                          <option>QUICKPLAYER</option>
                          <option>LAZER PLAYER</option>
                          <option>SMARTERS PLAYER LITE</option>
                          <option>XC PLAYER</option>
                        </select>
                      )}
                    </div>

                    <div className="col-span-2 space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Tipo de Acesso</label>
                      <select value={accessType} onChange={e => setAccessType(e.target.value as any)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none">
                        <option value="mac_key">MAC & Device Key</option>
                        <option value="xtream">Xtream Codes (Host + Usuário + Senha)</option>
                        <option value="xtream_full">Xtream Codes Completo (Nome + Host + Login + Senha)</option>
                        <option value="user_pass">Usuário & Senha (genérico)</option>
                      </select>
                    </div>

                    {accessType === 'mac_key' ? (
                      <>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase ml-1">
                            {appModel === 'X-CLOUD' ? 'Código de Ativação' : 'Endereço MAC'}
                          </label>
                          <input 
                            value={macAddress} 
                            onChange={e => setMacAddress(e.target.value)} 
                            placeholder={appModel === 'X-CLOUD' ? 'Ex: 1J616K' : '00:11:22:33:44:55'} 
                            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none" 
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Device Key</label>
                          <input value={deviceKey} onChange={e => setDeviceKey(e.target.value)} placeholder="123456" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none" />
                        </div>
                      </>
                    ) : accessType === 'xtream' || accessType === 'xtream_full' ? (
                      <>
                        {accessType === 'xtream_full' && (
                          <div className="col-span-2 space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Nome do Acesso / Lista</label>
                            <input value={appName} onChange={e => setAppName(e.target.value)} placeholder="Minha Lista 4K" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none" />
                          </div>
                        )}
                        <div className="col-span-2 space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase ml-1">
                            {appModel === 'QUICKPLAYER' ? 'Host (Nome do Host)' : 'DNS / Provedor (ex: http://provedor.com:8080)'}
                          </label>
                          <input
                            value={appHost}
                            onChange={e => setAppHost(e.target.value)}
                            placeholder={appModel === 'QUICKPLAYER' ? 'ex: meuhost.tv' : 'http://provedor.com:8080'}
                            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase ml-1">{accessType === 'xtream_full' ? 'Login' : 'Usuário'}</label>
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

                    {/* Preview do app selecionado do catálogo */}
                    {modalCatalogAppId && iconUrl && (
                      <div className="col-span-2 flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                        <img src={iconUrl} className="w-10 h-10 rounded-lg object-cover border border-emerald-200 shrink-0" />
                        <div>
                          <p className="text-xs font-black text-emerald-800">{appModel}</p>
                          <p className="text-[9px] text-emerald-600 font-bold">Imagem e links carregados do catálogo</p>
                        </div>
                      </div>
                    )}

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

      {/* ===================== MODAL: NÚMEROS VINCULADOS ===================== */}
      <AnimatePresence>
        {phonesCustomer && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setPhonesCustomer(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-teal-500 to-emerald-500 p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                    <Phone size={18} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-black text-sm">Números Vinculados</h3>
                    <p className="text-teal-100 text-[10px] font-bold">{phonesCustomer.name || phonesCustomer.username}</p>
                  </div>
                </div>
                <button onClick={() => setPhonesCustomer(null)} className="text-white/70 hover:text-white transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Número principal */}
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Número principal</p>
                  <div className="flex items-center gap-2">
                    <Phone size={12} className="text-slate-400" />
                    <span className="text-sm font-black text-slate-700">{phonesCustomer.whatsapp || '—'}</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded-full font-black">{phonesCustomer.name?.split(' ')[0] || 'Principal'}</span>
                  </div>
                </div>

                {/* Lista de números secundários */}
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Números secundários</p>
                  {phonesLoading ? (
                    <div className="text-center py-4 text-slate-400 text-xs">Carregando...</div>
                  ) : phonesList.length === 0 ? (
                    <div className="text-center py-4 text-slate-300 text-xs">Nenhum número vinculado</div>
                  ) : (
                    <div className="space-y-2">
                      {phonesList.map(p => (
                        <div key={p.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <Phone size={13} className="text-teal-500" />
                            <div>
                              <p className="text-xs font-black text-slate-800">{p.phone}</p>
                              {p.label && <p className="text-[10px] text-slate-400 font-bold">{p.label}</p>}
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeletePhone(p.id)}
                            className="p-1.5 text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Adicionar número */}
                <div className="border-t border-slate-100 pt-4 space-y-2">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Vincular novo número</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ex: 85999991234"
                      value={newPhone}
                      onChange={e => setNewPhone(e.target.value)}
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none focus:border-teal-400"
                    />
                    <input
                      type="text"
                      placeholder="Nome (ex: Solange)"
                      value={newPhoneLabel}
                      onChange={e => setNewPhoneLabel(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddPhone()}
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-teal-400"
                    />
                  </div>
                  <button
                    onClick={handleAddPhone}
                    disabled={!newPhone.trim()}
                    className="w-full bg-teal-500 text-white py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-2 hover:bg-teal-600 transition-all disabled:opacity-40"
                  >
                    <UserPlus size={14} /> Vincular número
                  </button>
                </div>

                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                  <p className="text-[10px] text-blue-600 font-bold">💡 Quando este número entrar em contato, a IA vai identificar automaticamente o cliente e tratar pelo nome vinculado.</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===================== MODAL: MIGRAR PARA WAREZTV ===================== */}
      <AnimatePresence>
        {migrateCustomer && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget && !migrateLoading) { setMigrateCustomer(null); setMigrateResult(null); } }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                    <ArrowRightLeft size={18} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-black text-sm">Migrar para WarezTV</h3>
                    <p className="text-orange-100 text-[10px] font-bold">{migrateCustomer.name || migrateCustomer.username}</p>
                  </div>
                </div>
                {!migrateLoading && !migrateResult && (
                  <button onClick={() => setMigrateCustomer(null)} className="text-white/70 hover:text-white transition-colors">
                    <X size={18} />
                  </button>
                )}
              </div>

              <div className="p-5 space-y-4">
                {!migrateResult ? (
                  <>
                    {/* Info do cliente */}
                    <div className="bg-slate-50 rounded-xl p-3 space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cliente atual</p>
                      <p className="text-sm font-black text-slate-800">{migrateCustomer.name || '—'} <span className="text-slate-400 font-normal">@{migrateCustomer.username}</span></p>
                      <p className="text-xs text-slate-500">{migrateCustomer.whatsapp || 'Sem WhatsApp'}</p>
                      <span className="inline-block text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest bg-indigo-100 text-indigo-600">
                        {migrateCustomer.provider === 'startpainel' ? 'Start' : migrateCustomer.provider || 'Start'}
                      </span>
                    </div>

                    {/* Prazo */}
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Prazo do plano WarezTV</label>
                      <div className="flex gap-2 mt-1.5">
                        {['30', '60', '90'].map(d => (
                          <button
                            key={d}
                            onClick={() => setMigrateDays(d)}
                            className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${migrateDays === d ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                          >
                            {d} dias
                          </button>
                        ))}
                        <input
                          type="number"
                          value={migrateDays}
                          onChange={e => setMigrateDays(e.target.value)}
                          className="w-20 px-2 py-2 bg-slate-100 rounded-xl text-xs font-black text-center outline-none border border-slate-200"
                          min="1"
                        />
                      </div>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <p className="text-xs text-amber-700 font-bold">⚠️ Isso vai criar uma nova linha na WarezTV e atualizar as credenciais do cliente. O badge mudará para <span className="text-orange-600">WarezTV</span>.</p>
                    </div>

                    <button
                      onClick={handleMigrateToWarez}
                      disabled={migrateLoading}
                      className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50"
                    >
                      {migrateLoading ? (
                        <><RefreshCw size={16} className="animate-spin" /> Criando linha WarezTV...</>
                      ) : (
                        <><ArrowRightLeft size={16} /> Confirmar Migração</>
                      )}
                    </button>
                  </>
                ) : (
                  /* Resultado */
                  <div className="space-y-3">
                    <div className="text-center py-2">
                      <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-2">
                        <CheckCircle size={24} className="text-emerald-500" />
                      </div>
                      <p className="font-black text-slate-800">Migração concluída!</p>
                      <p className="text-xs text-slate-500">{migrateCustomer.name || migrateCustomer.username} agora é WarezTV</p>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Novas credenciais WarezTV</p>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-500">Usuário</span>
                        <span className="text-xs font-black text-slate-800 font-mono">{migrateResult.warez_username}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-500">Senha</span>
                        <span className="text-xs font-black text-slate-800 font-mono">{migrateResult.warez_password}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-500">Vencimento</span>
                        <span className="text-xs font-black text-emerald-600">
                          {migrateResult.exp_date ? new Date(migrateResult.exp_date).toLocaleDateString('pt-BR') : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-500">Plano</span>
                        <span className="text-xs font-bold text-orange-600">{migrateResult.plan}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => { setMigrateCustomer(null); setMigrateResult(null); }}
                      className="w-full bg-slate-100 text-slate-700 py-2.5 rounded-xl font-black text-sm hover:bg-slate-200 transition-all"
                    >
                      Fechar
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
