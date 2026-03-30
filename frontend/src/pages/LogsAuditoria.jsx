import { useState, useEffect } from 'react';
import { getAuditLogs } from '../api';

const ACTION_LABELS = {
  LOGIN: { label: 'Login', color: 'bg-blue-100 text-blue-700' },
  LOGIN_FIRST: { label: '1º Acesso', color: 'bg-indigo-100 text-indigo-700' },
  SET_PASSWORD: { label: 'Definiu Senha', color: 'bg-teal-100 text-teal-700' },
  RESET_PASSWORD: { label: 'Reset Senha', color: 'bg-orange-100 text-orange-700' },
  CREATE: { label: 'Criou', color: 'bg-green-100 text-green-700' },
  UPDATE: { label: 'Editou', color: 'bg-yellow-100 text-yellow-700' },
  DELETE: { label: 'Excluiu', color: 'bg-red-100 text-red-700' },
  EXPORT_EXCEL: { label: 'Excel Export', color: 'bg-emerald-100 text-emerald-700' },
  EXPORT_PDF: { label: 'PDF Export', color: 'bg-purple-100 text-purple-700' },
};

const RESOURCE_LABELS = {
  user: '👤 Usuário',
  patient: '🏥 Paciente',
  appointment: '📅 Atendimento',
  report: '📊 Relatório',
};

const PAGE_SIZE = 50;

function formatTimestamp(ts) {
  const d = new Date(ts);
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function LogsAuditoria() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [filterAction, setFilterAction] = useState('');
  const [filterResource, setFilterResource] = useState('');

  const load = async (pageNum = 0, append = false) => {
    setLoading(true);
    try {
      const data = await getAuditLogs(pageNum * PAGE_SIZE, PAGE_SIZE);
      setHasMore(data.length === PAGE_SIZE);
      setLogs(prev => append ? [...prev, ...data] : data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(0); }, []);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    load(next, true);
  };

  const filtered = logs.filter(l => {
    if (filterAction && l.action !== filterAction) return false;
    if (filterResource && l.resource !== filterResource) return false;
    return true;
  });

  const uniqueActions = [...new Set(logs.map(l => l.action))].sort();
  const uniqueResources = [...new Set(logs.map(l => l.resource))].sort();

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="text-xl font-bold text-gray-800">🔍 Logs de Auditoria</h2>
        <div className="flex flex-wrap gap-2">
          <select
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-400"
          >
            <option value="">Todas as ações</option>
            {uniqueActions.map(a => (
              <option key={a} value={a}>{ACTION_LABELS[a]?.label || a}</option>
            ))}
          </select>
          <select
            value={filterResource}
            onChange={e => setFilterResource(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-400"
          >
            <option value="">Todos os recursos</option>
            {uniqueResources.map(r => (
              <option key={r} value={r}>{RESOURCE_LABELS[r] || r}</option>
            ))}
          </select>
          <button
            onClick={() => { setPage(0); load(0); }}
            className="px-3 py-1.5 text-sm bg-lavender rounded-lg hover:bg-purple-200 transition-colors border border-purple-200"
          >
            🔄 Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error} <button className="ml-2 underline" onClick={() => setError('')}>fechar</button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="bg-gradient-to-r from-lavender/60 to-pink-light/40 text-gray-700">
              <th className="px-4 py-3 text-left font-semibold">Data/Hora</th>
              <th className="px-4 py-3 text-left font-semibold">Ação</th>
              <th className="px-4 py-3 text-left font-semibold">Recurso</th>
              <th className="px-4 py-3 text-left font-semibold">Detalhes</th>
              <th className="px-4 py-3 text-left font-semibold">ID Usuário</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading ? (
              <tr>
                <td colSpan="5" className="px-4 py-8 text-center text-gray-400">
                  {logs.length === 0 ? 'Nenhum log registrado.' : 'Nenhum log corresponde ao filtro.'}
                </td>
              </tr>
            ) : (
              filtered.map((log, i) => {
                const actionMeta = ACTION_LABELS[log.action] || { label: log.action, color: 'bg-gray-100 text-gray-600' };
                return (
                  <tr key={log.id} className={`border-b ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-lavender/10 transition-colors`}>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap font-mono text-xs">
                      {formatTimestamp(log.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${actionMeta.color}`}>
                        {actionMeta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {RESOURCE_LABELS[log.resource] || log.resource}
                      {log.resource_id && <span className="ml-1 text-xs text-gray-400">#{log.resource_id}</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate" title={log.detail || ''}>
                      {log.detail || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {log.user_id ? `#${log.user_id}` : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {loading && (
        <p className="text-center text-gray-400 text-sm py-4 animate-pulse">Carregando logs…</p>
      )}

      {!loading && hasMore && (
        <div className="flex justify-center pt-2">
          <button
            onClick={loadMore}
            className="px-6 py-2 text-sm bg-white border border-gray-300 rounded-full hover:bg-lavender hover:border-purple-300 transition-colors"
          >
            Carregar mais
          </button>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <p className="text-xs text-gray-400 text-center">
          Exibindo {filtered.length} log{filtered.length !== 1 ? 's' : ''}
          {(filterAction || filterResource) ? ' (filtrado)' : ''}
        </p>
      )}
    </div>
  );
}
