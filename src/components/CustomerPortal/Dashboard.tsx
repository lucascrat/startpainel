import React from 'react';
import { Clock, ShieldCheck, AlertTriangle, MonitorPlay } from 'lucide-react';
import { differenceInDays, format } from 'date-fns';

export default function Dashboard({ data, onReload }: { data: any, onReload: () => void }) {
  if (!data) return null;
  const { customer, devices } = data;

  const isTest = customer.status === 'teste';
  let daysRemaining = 0;
  if (customer.expiration_date) {
    daysRemaining = differenceInDays(new Date(customer.expiration_date), new Date());
  }

  const isExpired = daysRemaining < 0 && !isTest;
  
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white mb-6">Visão Geral</h2>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gray-400 font-medium">Status da Assinatura</h3>
            {isTest ? (
              <span className="px-3 py-1 bg-blue-500/10 text-blue-400 rounded-full text-xs font-medium border border-blue-500/20">TESTE</span>
            ) : isExpired ? (
              <span className="px-3 py-1 bg-red-500/10 text-red-400 rounded-full text-xs font-medium border border-red-500/20">VENCIDA</span>
            ) : (
              <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-xs font-medium border border-emerald-500/20 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> ATIVA
              </span>
            )}
          </div>
          
          <div className="flex items-baseline gap-2">
            {isTest ? (
              <span className="text-3xl font-bold text-white">Acaba hoje</span>
            ) : (
              <>
                <span className="text-4xl font-bold text-white">{Math.max(0, daysRemaining)}</span>
                <span className="text-gray-400">dias restantes</span>
              </>
            )}
          </div>
          {customer.expiration_date && !isTest && (
            <p className="text-sm text-gray-500 mt-2 flex items-center gap-1">
              <Clock className="w-4 h-4" /> Vence em {format(new Date(customer.expiration_date), 'dd/MM/yyyy')}
            </p>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gray-400 font-medium">Seus Dispositivos (Apps)</h3>
            <span className="px-3 py-1 bg-indigo-500/10 text-indigo-400 rounded-full text-xs font-medium border border-indigo-500/20">
              {devices.length} Apps
            </span>
          </div>
          
          {devices.length === 0 ? (
            <div className="text-center py-4">
              <MonitorPlay className="w-8 h-8 text-gray-700 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Nenhum app ativado ainda.</p>
              <p className="text-xs text-indigo-400 mt-1 cursor-pointer hover:underline" onClick={() => document.querySelector<HTMLButtonElement>('[aria-label="Instalar Apps"]')?.click()}>Ir para Loja de Apps</p>
            </div>
          ) : (
            <div className="space-y-3">
              {devices.map((d: any) => (
                <div key={d.id} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-xl border border-gray-700/50">
                  <div>
                    <p className="text-white font-medium text-sm">{d.app_name}</p>
                    <p className="text-gray-400 text-xs font-mono">{d.mac_address}</p>
                  </div>
                  {d.device_key && <p className="text-xs text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded">Key: {d.device_key}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {isExpired && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-4 justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <h4 className="text-white font-medium text-lg">Assinatura Vencida</h4>
              <p className="text-red-200/80 text-sm">Renove agora para voltar a assistir todos os canais, filmes e séries sem interrupções.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
