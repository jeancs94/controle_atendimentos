import { useState, useEffect } from 'react';
import { getPatients, createAppointment } from '../api';

export default function RegistroAtendimento() {
  const [patients, setPatients] = useState([]);
  const [formData, setFormData] = useState({
    patient_id: '',
    date: new Date().toISOString().split('T')[0],
    time: '08:00',
    observations: ''
  });
  const [status, setStatus] = useState(null);

  useEffect(() => {
    loadPatients();
  }, []);

  const loadPatients = async () => {
    try {
      const data = await getPatients();
      setPatients(data);
      if (data.length > 0) {
        setFormData(prev => ({ ...prev, patient_id: data[0].id.toString() }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus(null);
    try {
      let fData = { ...formData, time: formData.time + ":00" }; 
      await createAppointment(fData);
      setStatus({ type: 'success', message: 'Atendimento registrado com sucesso!' });
      setFormData(prev => ({ ...prev, observations: '' })); // reset só a observação
    } catch (err) {
      setStatus({ type: 'error', message: 'Erro ao registrar atendimento.' });
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 text-pink-dark border-b pb-2">Registro de Atendimento</h2>
      {status && (
        <div className={`p-4 mb-4 rounded ${status.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {status.message}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-gray-700 font-medium mb-1">Paciente</label>
          <select required value={formData.patient_id} onChange={e => setFormData({...formData, patient_id: e.target.value})} className="w-full border-gray-300 rounded-md shadow-sm p-2 bg-white border focus:border-pink-light outline-none">
            {patients.length === 0 && <option value="">Nenhum paciente cadastrado</option>}
            {patients.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-700 font-medium mb-1">Data</label>
            <input required type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full border-gray-300 rounded-md shadow-sm p-2 bg-gray-50 border focus:border-pink-light outline-none" />
          </div>
          <div>
            <label className="block text-gray-700 font-medium mb-1">Horário</label>
            <input required type="time" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} className="w-full border-gray-300 rounded-md shadow-sm p-2 bg-white border focus:border-pink-light outline-none" />
          </div>
        </div>
        <div>
          <label className="block text-gray-700 font-medium mb-1">Observações (Opcional)</label>
          <textarea rows="3" value={formData.observations} onChange={e => setFormData({...formData, observations: e.target.value})} className="w-full border-gray-300 rounded-md shadow-sm p-2 bg-gray-50 border focus:border-pink-light outline-none" placeholder="Ex: Paciente relatou melhora..."></textarea>
        </div>
        <button type="submit" disabled={patients.length === 0} className="w-full bg-pink-light text-gray-800 font-semibold py-2 px-4 rounded-md shadow hover:bg-pink-dark hover:text-white transition-colors disabled:opacity-50">
          Registrar Sessão
        </button>
      </form>
    </div>
  );
}
