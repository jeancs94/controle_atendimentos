import { useState } from 'react';
import { createPatient } from '../api';

export default function CadastroPaciente() {
  const [formData, setFormData] = useState({
    name: '',
    created_at: new Date().toISOString().split('T')[0],
    rate: '',
    type: 'Avulso'
  });
  const [status, setStatus] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus(null);
    try {
      await createPatient({
        ...formData,
        rate: parseFloat(formData.rate) || 0
      });
      setStatus({ type: 'success', message: 'Paciente cadastrado com sucesso!' });
      setFormData({ name: '', created_at: new Date().toISOString().split('T')[0], rate: '', type: 'Avulso' });
    } catch (err) {
      setStatus({ type: 'error', message: 'Erro ao cadastrar paciente.' });
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 text-pink-dark border-b pb-2">Cadastro de Pacientes</h2>
      {status && (
        <div className={`p-4 mb-4 rounded ${status.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {status.message}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-gray-700 font-medium mb-1">Nome Completo</label>
          <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border-gray-300 rounded-md shadow-sm p-2 bg-gray-50 border focus:border-pink-light focus:ring-1 focus:ring-pink-light outline-none" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-700 font-medium mb-1">Data de Cadastro</label>
            <input required type="date" value={formData.created_at} onChange={e => setFormData({...formData, created_at: e.target.value})} className="w-full border-gray-300 rounded-md shadow-sm p-2 bg-gray-50 border focus:border-pink-light outline-none" />
          </div>
          <div>
            <label className="block text-gray-700 font-medium mb-1">Tipo de Atendimento</label>
            <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full border-gray-300 rounded-md shadow-sm p-2 bg-white border focus:border-pink-light outline-none">
              <option value="Avulso">Avulso</option>
              <option value="Pacote Mensal">Pacote Mensal</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-gray-700 font-medium mb-1">Valor por Atendimento/Pacote (R$)</label>
          <input required type="number" step="0.01" min="0" value={formData.rate} onChange={e => setFormData({...formData, rate: e.target.value})} className="w-full border-gray-300 rounded-md shadow-sm p-2 bg-gray-50 border focus:border-pink-light outline-none" />
        </div>
        <button type="submit" className="w-full bg-pink-light text-gray-800 font-semibold py-2 px-4 rounded-md shadow hover:bg-pink-dark hover:text-white transition-colors">
          Cadastrar Paciente
        </button>
      </form>
    </div>
  );
}
