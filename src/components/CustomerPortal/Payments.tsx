import React, { useState } from 'react';
import { CreditCard, QrCode, Copy, CheckCircle2, AlertCircle, Loader2, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';

export default function Payments({ token, data, onReload }: { token: string, data: any, onReload: () => void }) {
  const [loadingPix, setLoadingPix] = useState(false);
  const [pixData, setPixData] = useState<any>(null);

  const { customer, pix_charges } = data;
  const price = customer.renewal_price || 25;

  const handleGeneratePix = async () => {
    setLoadingPix(true);
    try {
      const res = await fetch('/api/portal/pix/generate', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erro ao gerar Pix');
      setPixData(d);
      toast.success('Pix gerado! Escaneie ou copie o código.');
      onReload(); // Atualiza histórico
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingPix(false);
    }
  };

  const copyPix = () => {
    if (!pixData) return;
    navigator.clipboard.writeText(pixData.copy_paste);
    toast.success('Código Pix Copia e Cola copiado!');
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Assinatura e Pagamentos</h2>
        <p className="text-gray-400">Renove seu plano de forma automática usando Pix. A liberação é instantânea!</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Current Plan / Renew Action */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Renovação Mensal</h3>
              <p className="text-sm text-gray-400">Plano Padrão</p>
            </div>
          </div>

          <div className="mb-6">
            <span className="text-4xl font-bold text-white">R$ {parseFloat(price).toFixed(2).replace('.', ',')}</span>
            <span className="text-gray-400">/mês</span>
          </div>

          {!pixData ? (
            <button
              onClick={handleGeneratePix}
              disabled={loadingPix}
              className="mt-auto w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-lg transition-colors flex justify-center items-center gap-2"
            >
              {loadingPix ? <Loader2 className="w-6 h-6 animate-spin" /> : <><QrCode className="w-5 h-5" /> Gerar Pagamento Pix</>}
            </button>
          ) : (
            <div className="mt-auto bg-gray-950 border border-gray-800 rounded-xl p-4 flex flex-col items-center text-center">
              <h4 className="text-emerald-400 font-bold mb-2 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" /> Aguardando Pagamento
              </h4>
              <img src={pixData.qrcode_image} alt="QR Code Pix" className="w-48 h-48 rounded-lg mb-4 bg-white p-2" />
              
              <button
                onClick={copyPix}
                className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg flex items-center justify-center gap-2 transition-colors font-medium mb-2"
              >
                <Copy className="w-4 h-4" /> Copiar Pix Copia e Cola
              </button>
              <p className="text-xs text-gray-500">Após pagar, seu sinal é liberado automaticamente em até 1 minuto.</p>
            </div>
          )}
        </div>

        {/* Payment History */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">Últimos Pagamentos</h3>
          
          {pix_charges.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="w-8 h-8 text-gray-700 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Nenhum pagamento registrado recentemente.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
              {pix_charges.map((c: any) => (
                <div key={c.txid} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-xl border border-gray-700/50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Renovação Pix</p>
                      <p className="text-xs text-gray-400">{new Date(c.created_at).toLocaleDateString('pt-BR')}</p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-white">R$ {parseFloat(c.amount).toFixed(2).replace('.', ',')}</p>
                </div>
              ))}
            </div>
          )}
          
          <button onClick={onReload} className="w-full mt-4 py-2 text-sm text-gray-400 hover:text-white flex items-center justify-center gap-2">
            <RefreshCcw className="w-4 h-4" /> Atualizar Histórico
          </button>
        </div>
      </div>
    </div>
  );
}
