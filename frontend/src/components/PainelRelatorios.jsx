import { useState, useEffect } from 'react';
import { getMonthlyReport, exportExcelFiltered, exportPDF, payEmployee } from '../api';
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
  const { isAdmin } = useAuth();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [exporting, setExporting] = useState('');
  const [payingLoading, setPayingLoading] = useState(null);

  const loadReport = async () => {
    if (!isAdmin) return;
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

  const handlePayEmployee = async (userId, name, amount) => {
    if (!confirm(`Confirmar o pagamento de R$ ${amount.toFixed(2)} para ${name} referente ao mês ${month}/${year}?`)) {
      return;
    }
    setPayingLoading(userId);
    try {
      await payEmployee({ user_id: userId, ref_year: year, ref_month: month });
      alert("Pagamento registrado com sucesso!");
      await loadReport();
    } catch (e) {
      alert("Erro ao registrar pagamento: " + e.message);
    } finally {
      setPayingLoading(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>Acesso restrito ao administrador.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header & Filters */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b pb-4 gap-4">
        <h2 className="text-xl font-semibold text-pink-dark">Relatórios & Financeiro</h2>
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
        </div>
      </div>

      {loading && <p className="text-gray-500">Carregando...</p>}

      {!loading && report && (
        <>
          {/* Totais */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-lavender p-4 rounded-lg shadow-sm border border-purple-100 flex flex-col items-center justify-center">
              <span className="text-gray-600 font-medium">Atendimentos Registrados no Mês</span>
              <span className="text-3xl font-bold text-gray-800">{report.total_appointments}</span>
            </div>
            <div className="bg-pink-light p-4 rounded-lg shadow-sm border border-pink-200 flex flex-col items-center justify-center">
              <span className="text-gray-800 font-medium">Faturamento Estimado (Mês)</span>
              <span className="text-3xl font-bold text-gray-800">R$ {report.total_value.toFixed(2)}</span>
            </div>
          </div>

          {/* Ganhos por Funcionário */}
          {report.employees && report.employees.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-3">💰 Folha de Pagamento - Equipe</h3>
              <div className="overflow-x-auto rounded-xl border border-purple-100 shadow-sm">
                <table className="min-w-full divide-y divide-gray-100 bg-white text-sm">
                  <thead className="bg-gradient-to-r from-lavender/60 to-pink-light/40">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Funcionário</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600">Atendimentos</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">A Pagar</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600">Status</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.employees.map((emp, i) => (
                      <tr key={emp.user_id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-lavender/10 transition-colors`}>
                        <td className="px-4 py-3 font-medium text-gray-800">{emp.full_name}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{emp.total_appointments}</td>
                        <td className="px-4 py-3 font-semibold text-pink-dark">
                          R$ {emp.total_value.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {emp.is_paid ? (
                            <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full font-semibold">
                              Pago
                            </span>
                          ) : emp.total_value > 0 ? (
                            <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full font-semibold">
                              Pendente
                            </span>
                          ) : (
                            <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full font-semibold">
                              Sem Rendimentos
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2 justify-center">
                            {!emp.is_paid && emp.total_value > 0 && (
                               <button
                                 onClick={() => handlePayEmployee(emp.user_id, emp.full_name, emp.total_value)}
                                 disabled={payingLoading === emp.user_id}
                                 className="px-3 py-1 text-xs bg-pink-600 text-white border border-pink-700 rounded-lg hover:bg-pink-700 disabled:opacity-50 font-medium"
                               >
                                 {payingLoading === emp.user_id ? 'Processando...' : '💰 Pagar'}
                               </button>
                            )}
                             <button
                               onClick={() => handleExportExcel(emp.user_id)}
                               disabled={!!exporting}
                               title="Exportar Planilha Individual"
                               className="px-2 py-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50"
                             >
                               XLS
                             </button>
                             <button
                               onClick={() => handleExportPDF(emp.user_id)}
                               disabled={!!exporting}
                               title="Exportar PDF Individual"
                               className="px-2 py-1 text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50"
                             >
                               {exporting === `pdf-${emp.user_id}` ? '⏳' : 'PDF'}
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
          <h3 className="text-lg font-medium text-gray-700 mb-3 block">Detalhamento Simplificado (Pacientes)</h3>
          <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 bg-white">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Paciente</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sessões</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Faturado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {report.patients.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-4 text-center text-sm text-gray-500">
                      Nenhum paciente registrou atendimento neste mês.
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

      {!loading && !report && (
        <p className="text-center text-gray-400 py-12">Nenhum dado encontrado para este mês.</p>
      )}
    </div>
  );
}
