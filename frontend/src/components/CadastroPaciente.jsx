import { useState, useEffect } from 'react';
import { createPatient, getPatients, updatePatient, deletePatient } from '../api';

export default function CadastroPaciente() {
  const [formData, setFormData] = useState({
    name: '',
    created_at: new Date().toISOString().split('T')[0],
    rate: '',
    type: 'Avulso'
  });
  const [status, setStatus] = useState(null);
  const [patients, setPatients] = useState([]);
  const [editingId, setEditingId] = useState(null);

  // Fetch patients on load
  const loadPatients = async () => {
    try {
      const data = await getPatients();
      setPatients(data);
    } catch (err) {
      console.error('Erro ao carregar pacientes', err);
    }
  };

  useEffect(() => {
    loadPatients();
  }, []);

  const resetForm = () => {
    setFormData({ name: '', created_at: new Date().toISOString().split('T')[0], rate: '', type: 'Avulso' });
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus(null);
    try {
      if (editingId) {
        await updatePatient(editingId, {
          ...formData,
          rate: parseFloat(formData.rate) || 0
        });
        setStatus({ type: 'success', message: 'Paciente atualizado com sucesso!' });
      } else {
        await createPatient({
          ...formData,
          rate: parseFloat(formData.rate) || 0
        });
        setStatus({ type: 'success', message: 'Paciente cadastrado com sucesso!' });
      }
      resetForm();
      loadPatients();
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'Erro ao processar a solicitação.' });
    }
  };

  const handleEdit = (p) => {
    setEditingId(p.id);
    setFormData({
      name: p.name,
      created_at: p.created_at,
      rate: p.rate,
      type: p.type
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (window.confirm('Tem certeza que deseja excluir este paciente e todos os seus atendimentos?')) {
      try {
        await deletePatient(id);
        setStatus({ type: 'success', message: 'Paciente excluído com sucesso!' });
        if (editingId === id) resetForm();
        loadPatients();
      } catch (err) {
        setStatus({ type: 'error', message: 'Erro ao excluir paciente.' });
      }
    }
  };

  return (
    <div className="space-y-8">
      {/* Registration/Edit Form */}
      <div>
        <h2 className="text-xl font-semibold mb-4 text-pink-dark border-b pb-2">
          {editingId ? 'Editar Paciente' : 'Cadastro de Pacientes'}
        </h2>
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
          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-pink-light text-gray-800 font-semibold py-2 px-4 rounded-md shadow hover:bg-pink-dark hover:text-white transition-colors">
              {editingId ? 'Salvar Alterações' : 'Cadastrar Paciente'}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="flex-1 bg-gray-200 text-gray-800 font-semibold py-2 px-4 rounded-md shadow hover:bg-gray-300 transition-colors">
                Cancelar Edição
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Patient List */}
      <div>
        <h2 className="text-xl font-semibold mb-4 text-pink-dark border-b pb-2">Lista de Pacientes</h2>
        {patients.length === 0 ? (
          <p className="text-gray-500">Nenhum paciente cadastrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-lavender bg-gray-50 text-gray-700">
                  <th className="py-2 px-4">Nome</th>
                  <th className="py-2 px-4">Tipo</th>
                  <th className="py-2 px-4">Valor (R$)</th>
                  <th className="py-2 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {patients.map(p => (
                  <tr key={p.id} className="border-b border-lavender hover:bg-gray-50/50">
                    <td className="py-2 px-4 font-medium text-gray-800">{p.name}</td>
                    <td className="py-2 px-4 text-gray-600">{p.type}</td>
                    <td className="py-2 px-4 text-gray-600">{Number(p.rate).toFixed(2)}</td>
                    <td className="py-2 px-4 text-right space-x-2">
                      <button onClick={() => handleEdit(p)} className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors">
                        Editar
                      </button>
                      <button onClick={() => handleDelete(p.id)} className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors">
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
