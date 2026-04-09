import { useState, useEffect } from 'react';
import { getUserEarnings } from '../api';
import { useAuth } from '../AuthContext';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export default function MeusRendimentos() {
  const { user } = useAuth();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const loadReport = async () => {
    setLoading(true);
    try {
      const data = await getUserEarnings(user.id, year, month);
      setReport(data);
    } catch (e) {
      console.error(e);
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadReport(); }, [year, month]);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-4 gap-4">
        <h2 className="text-xl font-semibold text-pink-dark">Meus Rendimentos</h2>
        <div className="flex gap-2">
          <select
            value={month}
            onChange={e => setMonth(parseInt(e.target.value))}
            className="border-gray-300 rounded-md shadow-sm p-2 bg-white border focus:border-pink-light outline-none text-sm"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i + 1} value={i + 1}>{name}</option>
            ))}
          </select>
          <input
            type="number"
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            className="border-gray-300 rounded-md shadow-sm p-2 bg-white border focus:border-pink-light w-20 outline-none text-sm"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-8">Carregando seus rendimentos...</p>
      ) : report ? (
        <div className="bg-white rounded-xl border border-lavender shadow-sm p-6 flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-pink-100 flex items-center justify-center text-pink-600 font-bold text-xl">
              💰
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Faturamento Estimado — {MONTH_NAMES[month-1]}/{year}</p>
              <p className="text-3xl font-extrabold text-gray-800">R$ {report.total_value.toFixed(2)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
            <div className="bg-gray-50 p-4 rounded-lg">
              <span className="block text-xs font-semibold text-gray-400 uppercase">Atendimentos</span>
              <span className="block text-xl font-bold text-gray-700 mt-1">{report.total_appointments} sessões</span>
            </div>
            <div className={`p-4 rounded-lg ${report.is_paid ? 'bg-green-50' : 'bg-yellow-50'}`}>
              <span className={`block text-xs font-semibold uppercase ${report.is_paid ? 'text-green-600' : 'text-yellow-600'}`}>Status</span>
              <span className={`block text-xl font-bold mt-1 ${report.is_paid ? 'text-green-700' : 'text-yellow-700'}`}>
                {report.is_paid ? '✓ PAGO' : 'Pendente'}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-center text-gray-400 py-8">Nenhum dado encontrado para o período especificado.</p>
      )}
    </div>
  );
}
