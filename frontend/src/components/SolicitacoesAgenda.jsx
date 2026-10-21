import { useEffect, useState } from 'react';
import { getPatients, getScheduleChangeRequests, getUsers, updateScheduleChangeRequestStatus } from '../api';

const formatDate = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR') : '-';
const formatTime = (value) => value ? String(value).substring(0, 5) : '-';

export default function SolicitacoesAgenda() {
  const [requests, setRequests] = useState([]);
  const [patients, setPatients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const loadRequests = async () => {
    try {
      setLoading(true);
      const [requestsData, patientsData, usersData] = await Promise.all([
        getScheduleChangeRequests(),
        getPatients(),
        getUsers(),
      ]);
      setRequests(requestsData);
      setPatients(patientsData);
      setUsers(usersData);
    } catch (err) {
      setError(err.message || 'Erro ao buscar solicitações.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleStatus = async (id, status) => {
    try {
      await updateScheduleChangeRequestStatus(id, status);
      setStatusMessage(status === 'approved' ? 'Solicitação aprovada.' : 'Solicitação rejeitada.');
      await loadRequests();
    } catch (err) {
      setError(err.message || 'Erro ao atualizar solicitação.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b pb-2">
        <h2 className="text-xl font-semibold text-pink-dark">Solicitações de alteração de horário</h2>
      </div>

      {statusMessage && (
        <div className="rounded bg-green-100 text-green-700 px-3 py-2 text-sm">{statusMessage}</div>
      )}

      {error && (
        <div className="rounded bg-red-100 text-red-700 px-3 py-2 text-sm">{error}</div>
      )}

      {loading ? (
        <p className="text-gray-500">Carregando solicitações...</p>
      ) : requests.length === 0 ? (
        <p className="text-gray-500">Nenhuma solicitação pendente no momento.</p>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="px-4 py-3 text-left">Paciente</th>
                <th className="px-4 py-3 text-left">Profissional</th>
                <th className="px-4 py-3 text-left">Nova data</th>
                <th className="px-4 py-3 text-left">Novo horário</th>
                <th className="px-4 py-3 text-left">Mensagem</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => {
                const patient = patients.find((p) => Number(p.id) === Number(req.patient_id));
                const professional = users.find((u) => Number(u.id) === Number(req.professional_id));

                return (
                  <tr key={req.id} className="border-t hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-800">{patient?.name || 'Paciente'}</td>
                    <td className="px-4 py-3 text-gray-700">{professional?.full_name || 'Profissional'}</td>
                    <td className="px-4 py-3">{formatDate(req.requested_date)}</td>
                    <td className="px-4 py-3">{formatTime(req.requested_time)}</td>
                  <td className="px-4 py-3 max-w-xs break-words">{req.message}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                      req.status === 'approved' ? 'bg-green-100 text-green-700' :
                      req.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {req.status === 'approved' ? 'Aprovada' : req.status === 'rejected' ? 'Rejeitada' : 'Pendente'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      onClick={() => handleStatus(req.id, 'approved')}
                      className="px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                    >
                      Aprovar
                    </button>
                    <button
                      onClick={() => handleStatus(req.id, 'rejected')}
                      className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                    >
                      Rejeitar
                    </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
