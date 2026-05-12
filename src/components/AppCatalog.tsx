import React, { useState, useEffect } from 'react';
import { authFetch } from '../lib/auth';
import { toast } from 'sonner';
import {
  Plus, Save, Trash2, Edit3, X, ExternalLink, Image as ImageIcon,
  ArrowUp, ArrowDown, Eye, EyeOff, Smartphone, Tv, Globe, Loader2,
} from 'lucide-react';

/**
 * Catalogo de apps que a IA usa pra sugerir downloads e pedir prints aos clientes.
 *
 * Cada app tem:
 * - imagem principal (mostrada como sugestao de download)
 * - imagem de exemplo (mostrada quando pedir print de configuracao)
 * - instrucao do exemplo (texto que vai com a imagem de exemplo)
 * - links de download (Android/iOS/Web)
 * - device_type ('tv' | 'celular' | 'pc' | 'todos')
 * - display_order (ordem de prioridade — IA sugere o primeiro primeiro)
 * - is_active (sair de uso sem deletar)
 *
 * Quando a IA decide sugerir, ela chama a tool send_app_info ou request_screenshot
 * com o app_id. O backend baixa a imagem do R2 e envia via Evolution.
 */

interface AppCatalogItem {
  id: number;
  name: string;
  display_order: number;
  description: string | null;
  app_image_url: string | null;
  example_image_url: string | null;
  example_instruction: string | null;
  android_link: string | null;
  ios_link: string | null;
  web_link: string | null;
  device_type: string;
  is_active: boolean;
}

const EMPTY_FORM: Omit<AppCatalogItem, 'id'> = {
  name: '',
  display_order: 0,
  description: '',
  app_image_url: '',
  example_image_url: '',
  example_instruction: '',
  android_link: '',
  ios_link: '',
  web_link: '',
  device_type: 'todos',
  is_active: true,
};

export default function AppCatalog() {
  const [apps, setApps] = useState<AppCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AppCatalogItem | null>(null); // null = lista; obj = editando
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<Omit<AppCatalogItem, 'id'>>(EMPTY_FORM);
  const [uploading, setUploading] = useState<null | 'app' | 'example'>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/app-catalog');
      const data = await r.json();
      setApps(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast.error(`Falha ao carregar apps: ${e?.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startCreate = () => {
    setForm({ ...EMPTY_FORM, display_order: apps.length });
    setEditing(null);
    setIsCreating(true);
  };

  const startEdit = (a: AppCatalogItem) => {
    setForm({
      name: a.name,
      display_order: a.display_order,
      description: a.description || '',
      app_image_url: a.app_image_url || '',
      example_image_url: a.example_image_url || '',
      example_instruction: a.example_instruction || '',
      android_link: a.android_link || '',
      ios_link: a.ios_link || '',
      web_link: a.web_link || '',
      device_type: a.device_type,
      is_active: a.is_active,
    });
    setEditing(a);
    setIsCreating(false);
  };

  const cancelEdit = () => {
    setEditing(null);
    setIsCreating(false);
    setForm(EMPTY_FORM);
  };

  /**
   * Faz upload via /api/upload (R2) — mesmo padrao do CustomerMenu.
   * Recebe File, converte pra base64, POST com Authorization, retorna URL pra setar no form.
   */
  const uploadFile = async (file: File, slot: 'app' | 'example') => {
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione um arquivo de imagem.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(`Imagem muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximo 5MB.`);
      return;
    }
    setUploading(slot);
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
        body: JSON.stringify({ data: base64, mimeType: file.type, prefix: 'app-catalog' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      const key = slot === 'app' ? 'app_image_url' : 'example_image_url';
      setForm(prev => ({ ...prev, [key]: json.url }));
      toast.success('Imagem enviada.');
    } catch (e: any) {
      toast.error(`Erro no upload: ${e?.message || e}`);
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('Nome do app é obrigatório.');
      return;
    }
    setSaving(true);
    try {
      const url = editing ? `/api/app-catalog/${editing.id}` : '/api/app-catalog';
      const method = editing ? 'PUT' : 'POST';
      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      toast.success(editing ? 'App atualizado!' : 'App cadastrado!');
      cancelEdit();
      load();
    } catch (e: any) {
      toast.error(`Erro ao salvar: ${e?.message}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteApp = async (a: AppCatalogItem) => {
    if (!confirm(`Excluir o app "${a.name}" do catálogo?`)) return;
    try {
      const res = await authFetch(`/api/app-catalog/${a.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('App excluído.');
      load();
    } catch (e: any) {
      toast.error(`Erro: ${e?.message}`);
    }
  };

  const reorder = async (a: AppCatalogItem, direction: 'up' | 'down') => {
    const idx = apps.findIndex(x => x.id === a.id);
    const swap = direction === 'up' ? apps[idx - 1] : apps[idx + 1];
    if (!swap) return;
    try {
      await Promise.all([
        authFetch(`/api/app-catalog/${a.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_order: swap.display_order }),
        }),
        authFetch(`/api/app-catalog/${swap.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_order: a.display_order }),
        }),
      ]);
      load();
    } catch (e: any) {
      toast.error(`Erro ao reordenar: ${e?.message}`);
    }
  };

  const toggleActive = async (a: AppCatalogItem) => {
    try {
      const res = await authFetch(`/api/app-catalog/${a.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !a.is_active }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      load();
    } catch (e: any) {
      toast.error(`Erro: ${e?.message}`);
    }
  };

  // Modal de edicao/criacao
  if (editing || isCreating) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-tighter">
            {editing ? `Editar: ${editing.name}` : 'Cadastrar novo app'}
          </h3>
          <button onClick={cancelEdit} className="p-2 hover:bg-slate-100 rounded-lg">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        {/* Nome + ordem + tipo + ativo */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-6 space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nome *</label>
            <input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: IBO Player"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ordem</label>
            <input
              type="number"
              value={form.display_order}
              onChange={e => setForm({ ...form, display_order: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none"
            />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Dispositivo</label>
            <select
              value={form.device_type}
              onChange={e => setForm({ ...form, device_type: e.target.value })}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none"
            >
              <option value="todos">Todos</option>
              <option value="tv">Smart TV</option>
              <option value="celular">Celular</option>
              <option value="pc">PC</option>
            </select>
          </div>
          <div className="sm:col-span-2 space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Status</label>
            <button
              onClick={() => setForm({ ...form, is_active: !form.is_active })}
              className={`w-full px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition ${
                form.is_active ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'
              }`}
            >
              {form.is_active ? 'Ativo' : 'Inativo'}
            </button>
          </div>
        </div>

        {/* Descricao */}
        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Descrição (a IA usa pra decidir quando sugerir)</label>
          <textarea
            value={form.description || ''}
            onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder="Ex: Melhor app pra Smart TV Samsung/LG, suporta TODOS os codecs"
            rows={2}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Imagens lado a lado */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ImageUploadBox
            label="Imagem do app"
            hint="Aparece quando a IA sugere o download"
            url={form.app_image_url}
            uploading={uploading === 'app'}
            onUpload={f => uploadFile(f, 'app')}
            onClear={() => setForm({ ...form, app_image_url: '' })}
          />
          <ImageUploadBox
            label="Imagem de exemplo (área pra cliente printar)"
            hint="Mostra qual tela o cliente deve printar quando você pedir"
            url={form.example_image_url}
            uploading={uploading === 'example'}
            onUpload={f => uploadFile(f, 'example')}
            onClear={() => setForm({ ...form, example_image_url: '' })}
          />
        </div>

        {/* Instrucao do exemplo */}
        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Instrução de exemplo (vai junto da imagem)</label>
          <input
            value={form.example_instruction || ''}
            onChange={e => setForm({ ...form, example_instruction: e.target.value })}
            placeholder="Ex: Me manda print da tela com MAC e Key, igual essa imagem"
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Links de download */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Smartphone size={10} /> Android</label>
            <input
              value={form.android_link || ''}
              onChange={e => setForm({ ...form, android_link: e.target.value })}
              placeholder="https://play.google.com/..."
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Smartphone size={10} /> iOS</label>
            <input
              value={form.ios_link || ''}
              onChange={e => setForm({ ...form, ios_link: e.target.value })}
              placeholder="https://apps.apple.com/..."
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Globe size={10} /> Web/Outro</label>
            <input
              value={form.web_link || ''}
              onChange={e => setForm({ ...form, web_link: e.target.value })}
              placeholder="https://..."
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none"
            />
          </div>
        </div>

        {/* Acoes */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button onClick={cancelEdit} className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition">
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving || !!uploading}
            className="px-5 py-2.5 bg-indigo-600 text-white text-xs font-black uppercase tracking-wider rounded-xl hover:bg-indigo-700 transition disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {editing ? 'Atualizar' : 'Cadastrar'}
          </button>
        </div>
      </div>
    );
  }

  // Lista
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-tighter">Catálogo de Apps</h3>
          <p className="text-[10px] text-slate-500">A IA usa essa lista pra sugerir downloads e pedir prints. Ordem importa — primeiro da lista é o preferido.</p>
        </div>
        <button
          onClick={startCreate}
          className="px-4 py-2.5 bg-slate-900 text-white text-xs font-black uppercase tracking-wider rounded-xl hover:bg-slate-800 transition flex items-center gap-2"
        >
          <Plus size={14} /> Novo app
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
          <Loader2 size={24} className="animate-spin text-indigo-500 mx-auto" />
        </div>
      ) : apps.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-2">
          <ImageIcon size={32} className="text-slate-300 mx-auto" />
          <p className="text-xs font-bold text-slate-500">Nenhum app cadastrado ainda</p>
          <p className="text-[10px] text-slate-400">Clique em "Novo app" pra começar</p>
        </div>
      ) : (
        <div className="space-y-2">
          {apps.map((a, idx) => (
            <div
              key={a.id}
              className={`bg-white rounded-2xl border ${a.is_active ? 'border-slate-200' : 'border-slate-200 opacity-60'} p-4 flex items-center gap-4`}
            >
              {/* Imagem mini */}
              <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                {a.app_image_url ? (
                  <img src={a.app_image_url} alt={a.name} className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon size={20} className="text-slate-300" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black text-slate-400">#{a.display_order}</span>
                  <h4 className="text-sm font-black text-slate-800 truncate">{a.name}</h4>
                  <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full uppercase">{a.device_type}</span>
                  {!a.is_active && <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full uppercase">Inativo</span>}
                </div>
                {a.description && <p className="text-[11px] text-slate-500 truncate mt-0.5">{a.description}</p>}
                <div className="flex items-center gap-2 mt-1">
                  {a.example_image_url && (
                    <span className="text-[9px] text-emerald-600 font-bold flex items-center gap-0.5"><ImageIcon size={9} /> exemplo</span>
                  )}
                  {a.android_link && <span className="text-[9px] text-slate-500">Android</span>}
                  {a.ios_link && <span className="text-[9px] text-slate-500">iOS</span>}
                  {a.web_link && <span className="text-[9px] text-slate-500">Web</span>}
                </div>
              </div>

              {/* Acoes */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => reorder(a, 'up')}
                  disabled={idx === 0}
                  title="Subir prioridade"
                  className="p-2 hover:bg-slate-100 rounded-lg disabled:opacity-30"
                >
                  <ArrowUp size={14} className="text-slate-500" />
                </button>
                <button
                  onClick={() => reorder(a, 'down')}
                  disabled={idx === apps.length - 1}
                  title="Descer prioridade"
                  className="p-2 hover:bg-slate-100 rounded-lg disabled:opacity-30"
                >
                  <ArrowDown size={14} className="text-slate-500" />
                </button>
                <button
                  onClick={() => toggleActive(a)}
                  title={a.is_active ? 'Desativar' : 'Ativar'}
                  className="p-2 hover:bg-slate-100 rounded-lg"
                >
                  {a.is_active ? <Eye size={14} className="text-emerald-600" /> : <EyeOff size={14} className="text-slate-400" />}
                </button>
                <button onClick={() => startEdit(a)} className="p-2 hover:bg-indigo-50 rounded-lg">
                  <Edit3 size={14} className="text-indigo-600" />
                </button>
                <button onClick={() => deleteApp(a)} className="p-2 hover:bg-rose-50 rounded-lg">
                  <Trash2 size={14} className="text-rose-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Caixa de upload + preview de imagem. Reutilizada pra imagem do app e exemplo.
function ImageUploadBox(props: {
  label: string;
  hint: string;
  url: string | null;
  uploading: boolean;
  onUpload: (f: File) => void;
  onClear: () => void;
}) {
  const { label, hint, url, uploading, onUpload, onClear } = props;
  return (
    <div className="space-y-1">
      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
      <p className="text-[10px] text-slate-400 -mt-0.5">{hint}</p>
      <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-4 flex items-center gap-3">
        <div className="w-20 h-20 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
          {uploading ? (
            <Loader2 size={20} className="animate-spin text-indigo-500" />
          ) : url ? (
            <img src={url} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon size={20} className="text-slate-300" />
          )}
        </div>
        <div className="flex-1 space-y-1.5 min-w-0">
          <label className="block">
            <input
              type="file"
              accept="image/*"
              onChange={e => e.target.files?.[0] && onUpload(e.target.files[0])}
              className="hidden"
              disabled={uploading}
            />
            <span className="block w-full px-3 py-2 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-wider rounded-lg hover:bg-indigo-700 transition cursor-pointer text-center">
              {uploading ? 'Enviando...' : url ? 'Trocar imagem' : 'Selecionar imagem'}
            </span>
          </label>
          {url && (
            <button onClick={onClear} className="text-[10px] font-bold text-rose-600 hover:underline">
              Remover
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
