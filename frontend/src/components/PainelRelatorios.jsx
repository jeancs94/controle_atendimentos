import { useState, useEffect } from 'react';
import { getMonthlyReport, exportExcelFiltered, exportPDF } from '../api';
import { useAuth } from '../AuthContext';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PainelRelatorios() {
  const { isMaster } = useAuth();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [exporting, setExporting] = useState('');

  const loadReport = async () => {
    if (!isMaster) return;
    setLoading(true);
    try {
      const data = await getMonthlyReport(year, month);
      setReport(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { loadReport(); }, [year, month]);

  const handleExportExcel = async (userId = null) => {
    setExporting(`excel-${userId || 'all'}`);
    try {
      const blob = await exportExcelFiltered({ userId, year, month });
      const suffix = userId ? `_funcionario${userId}` : '';
      downloadBlob(blob, `relatorio_${year}_${String(month).padStart(2, '0')}${suffix}.xlsx`);
    } catch (e) {
      alert('Erro ao exportar Excel: ' + e.message);
    } finally {
      setExporting('');
    }
  };

  const handleExportPDF = async (userId = null) => {
    setExporting(`pdf-${userId || 'all'}`);
    try {
      const blob = await exportPDF({ userId, year, month });
      const suffix = userId ? `_funcionario${userId}` : '';
      downloadBlob(blob, `relatorio_${year}_${String(month).padStart(2, '0')}${suffix}.pdf`);
    } catch (e) {
      alert('Erro ao exportar PDF: ' + e.message);
    } finally {
      setExporting('');
    }
  };

  return (
    <div>
      {/* Header & Filters */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b pb-4 gap-4">
        <h2 className="text-xl font-semibold text-pink-dark">Painel de Relatórios</h2>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <select
            value={month}
            onChange={e => setMonth(parseInt(e.target.value))}
            className="border-gray-300 rounded-md shadow-sm p-2 bg-white border focus:border-pink-light outline-none"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i + 1} value={i + 1}>{name}</option>
            ))}
          </select>
          <input
            type="number"
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            className="border-gray-300 rounded-md shadow-sm p-2 bg-white border focus:border-pink-light w-24 outline-none"
          />
          {isMaster && (
            <>
              <button
                onClick={() => handleExportExcel()}
                disabled={!!exporting}
                className="bg-emerald-500 text-white px-3 py-2 rounded-md hover:bg-emerald-600 transition-colors shadow text-sm disabled:opacity-60"
              >
                {exporting === 'excel-null' ? '⏳' : '📊'} Excel
              </button>
              <button
                onClick={() => handleExportPDF()}
                disabled={!!exporting}
                className="bg-red-500 text-white px-3 py-2 rounded-md hover:bg-red-600 transition-colors shadow text-sm disabled:opacity-60"
              >
                {exporting === 'pdf-null' ? '⏳' : '📄'} PDF
              </button>
            </>
          )}
        </div>
      </div>

      {loading && <p className="text-gray-500">Carregando...</p>}

      {!loading && report && (
        <>
          {/* Totais */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-lavender p-4 rounded-lg shadow-sm border border-purple-100 flex flex-col items-center justify-center">
              <span className="text-gray-600 font-medium">Total de Atendimentos</span>
              <span className="text-3xl font-bold text-gray-800">{report.total_appointments}</span>
            </div>
            <div className="bg-pink-light p-4 rounded-lg shadow-sm border border-pink-200 flex flex-col items-center justify-center">
              <span className="text-gray-800 font-medium">Valor Total a Receber (Mês)</span>
              <span className="text-3xl font-bold text-gray-800">R$ {report.total_value.toFixed(2)}</span>
            </div>
          </div>

          {/* Ganhos por Funcionário — master only */}
          {isMaster && report.employees && report.employees.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-3">👥 Ganhos por Funcionário</h3>
              <div className="overflow-x-auto rounded-xl border border-purple-100 shadow-sm">
                <table className="min-w-full divide-y divide-gray-100 bg-white text-sm">
                  <thead className="bg-gradient-to-r from-lavender/60 to-pink-light/40">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Funcionário</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Atendimentos</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Total Recebido</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600">Exportar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.employees.map((emp, i) => (
                      <tr key={emp.user_id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-lavender/10 transition-colors`}>
                        <td className="px-4 py-3 font-medium text-gray-800">{emp.full_name}</td>
                        <td className="px-4 py-3 text-gray-600">{emp.total_appointments}</td>
                        <td className="px-4 py-3 font-semibold text-pink-dark">
                          R$ {emp.total_value.toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => handleExportExcel(emp.user_id)}
                              disabled={!!exporting}
                              title="Exportar Excel individual"
                              className="px-2 py-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50"
                            >
                              {exporting === `excel-${emp.user_id}` ? '⏳' : '📊 XLS'}
                            </button>
                            <button
                              onClick={() => handleExportPDF(emp.user_id)}
                              disabled={!!exporting}
                              title="Exportar PDF individual"
                              className="px-2 py-1 text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50"
                            >
                              {exporting === `pdf-${emp.user_id}` ? '⏳' : '📄 PDF'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Detalhamento por Paciente */}
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
                    <td colSpan="4" className="px-6 py-4 text-center text-sm text-gray-500">
                      Nenhum atendimento neste mês.
                    </td>
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

      {!loading && !report && isMaster && (
        <p className="text-center text-gray-400 py-12">Selecione mês e ano para ver o relatório.</p>
      )}

      {!isMaster && (
        <p className="text-center text-gray-400 py-12">Acesso restrito ao administrador.</p>
      )}
    </div>
  );
}
