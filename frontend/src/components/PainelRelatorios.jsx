import { useState, useEffect } from 'react';
import { getMonthlyReport, API_URL } from '../api';

export default function PainelRelatorios() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const loadReport = async () => {
    setLoading(true);
    try {
      const data = await getMonthlyReport(year, month);
      setReport(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadReport();
  }, [year, month]);

  const handleExport = () => {
    window.open(`${API_URL}/export/excel`, '_blank');
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b pb-4 gap-4">
        <h2 className="text-xl font-semibold text-pink-dark">Painel de Relatórios</h2>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="border-gray-300 rounded-md shadow-sm p-2 bg-white border focus:border-pink-light outline-none">
            {Array.from({length: 12}, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>{new Date(0, m - 1).toLocaleString('pt-BR', {month: 'long'})}</option>
            ))}
          </select>
          <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} className="border-gray-300 rounded-md shadow-sm p-2 bg-white border focus:border-pink-light w-24 outline-none" />
          <button onClick={handleExport} className="bg-green-500 text-white px-4 py-2 rounded-md hover:bg-green-600 transition-colors shadow">
            Exportar Excel
          </button>
        </div>
      </div>

      {loading && <p className="text-gray-500">Carregando...</p>}
      
      {!loading && report && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-lavender p-4 rounded-lg shadow-sm border border-purple-100 flex flex-col items-center justify-center">
              <span className="text-gray-600 font-medium">Total de Atendimentos</span>
              <span className="text-3xl font-bold text-gray-800">{report.total_appointments}</span>
            </div>
            <div className="bg-pink-light p-4 rounded-lg shadow-sm border border-pink-200 flex flex-col items-center justify-center">
              <span className="text-gray-800 font-medium">Valor Total Recebido (Mês)</span>
              <span className="text-3xl font-bold text-gray-800">R$ {report.total_value.toFixed(2)}</span>
            </div>
          </div>

          <h3 className="text-lg font-medium text-gray-700 mb-3 block">Detalhamento por Paciente</h3>
          <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 bg-white">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Paciente</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sessões</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor Recebido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {report.patients.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-4 text-center text-sm text-gray-500">Nenhum atendimento neste mês.</td>
                  </tr>
                ) : (
                  report.patients.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{p.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.session_count}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${p.type === 'Avulso' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                          {p.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                        R$ {p.total_value.toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
