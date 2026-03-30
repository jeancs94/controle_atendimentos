import { useState, useEffect } from 'react';
import { getPatients, createAppointment, getAppointments, updateAppointment, deleteAppointment } from '../api';

// Generate time slots: 08:00 to 19:00, 40 min duration, skipping 12:00-13:00 lunch
const generateTimeSlots = () => {
  const slots = [];
  let current = new Date();
  current.setHours(8, 0, 0, 0);

  const end = new Date();
  end.setHours(19, 0, 0, 0);

  while (current <= end) {
    const hours = current.getHours();
    const minutes = current.getMinutes();
    
    // Skip lunch: 12:00 to 13:00
    // A session starting at 11:20 ends at 12:00, so it's fine.
    // The next session should start at 13:00.
    if (hours === 12) {
      current.setHours(13, 0, 0, 0);
      continue;
    }

    const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    slots.push(timeStr);
    
    current.setMinutes(current.getMinutes() + 40);
  }
  return slots;
};

const TIME_SLOTS = generateTimeSlots();

export default function RegistroAtendimento() {
  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    patient_id: '',
    date: new Date().toISOString().split('T')[0],
    time: '08:00',
    observations: ''
  });
  const [status, setStatus] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [patientsData, apptsData] = await Promise.all([
        getPatients(),
        getAppointments()
      ]);
      setPatients(patientsData);
      setAppointments(apptsData);
      
      if (patientsData.length > 0 && !editingId) {
        setFormData(prev => ({ ...prev, patient_id: patientsData[0].id.toString() }));
      }
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', message: 'Erro ao carregar dados do servidor' });
    }
  };

  const isWeekend = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    const day = date.getDay();
    return day === 0 || day === 6; // 0 is Sunday, 6 is Saturday
  };

  const resetForm = () => {
    setFormData({
      patient_id: patients.length > 0 ? patients[0].id.toString() : '',
      date: new Date().toISOString().split('T')[0],
      time: '08:00',
      observations: ''
    });
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus(null);

    if (isWeekend(formData.date)) {
      setStatus({ type: 'error', message: 'Não é possível marcar atendimentos aos fins de semana.' });
      return;
    }

    try {
      let fData = { ...formData, time: formData.time.length === 5 ? formData.time + ":00" : formData.time }; 
      
      if (editingId) {
        await updateAppointment(editingId, fData);
        setStatus({ type: 'success', message: 'Atendimento atualizado com sucesso!' });
      } else {
        await createAppointment(fData);
        setStatus({ type: 'success', message: 'Atendimento registrado com sucesso!' });
      }
      resetForm();
      loadData();
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'Erro ao processar atendimento.' });
    }
  };

  const handleEdit = (appt) => {
    setEditingId(appt.id);
    setFormData({
      patient_id: appt.patient_id.toString(),
      date: appt.date,
      time: appt.time.substring(0, 5), // Format HH:MM:SS to HH:MM for input
      observations: appt.observations || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (window.confirm('Tem certeza que deseja excluir este atendimento?')) {
      try {
        await deleteAppointment(id);
        setStatus({ type: 'success', message: 'Atendimento excluído com sucesso!' });
        if (editingId === id) resetForm();
        loadData();
      } catch (err) {
        setStatus({ type: 'error', message: 'Erro ao excluir atendimento.' });
      }
    }
  };

  return (
    <div className="space-y-8">
      {/* Appointment Registration Form */}
      <div>
        <h2 className="text-xl font-semibold mb-4 text-pink-dark border-b pb-2">
          {editingId ? 'Editar Atendimento' : 'Registro de Atendimento'}
        </h2>
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
              <input 
                required 
                type="date" 
                value={formData.date} 
                onChange={e => {
                  const val = e.target.value;
                  setFormData({...formData, date: val});
                  if (isWeekend(val)) {
                    setStatus({ type: 'error', message: 'Atenção: A data selecionada cai em um fim de semana.' });
                  } else {
                    if (status?.message?.includes('fim de semana')) setStatus(null);
                  }
                }} 
                className={`w-full border-gray-300 rounded-md shadow-sm p-2 border focus:border-pink-light outline-none ${isWeekend(formData.date) ? 'bg-red-50 border-red-300' : 'bg-gray-50'}`} 
              />
            </div>
            <div>
              <label className="block text-gray-700 font-medium mb-1">Horário</label>
              <select 
                required 
                value={formData.time} 
                onChange={e => setFormData({...formData, time: e.target.value})} 
                className="w-full border-gray-300 rounded-md shadow-sm p-2 bg-white border focus:border-pink-light outline-none"
              >
                {TIME_SLOTS.map(slot => (
                  <option key={slot} value={slot}>{slot}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-gray-700 font-medium mb-1">Observações (Opcional)</label>
            <textarea rows="3" value={formData.observations} onChange={e => setFormData({...formData, observations: e.target.value})} className="w-full border-gray-300 rounded-md shadow-sm p-2 bg-gray-50 border focus:border-pink-light outline-none" placeholder="Ex: Paciente relatou melhora..."></textarea>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={patients.length === 0 || isWeekend(formData.date)} className="flex-1 bg-pink-light text-gray-800 font-semibold py-2 px-4 rounded-md shadow hover:bg-pink-dark hover:text-white transition-colors disabled:opacity-50">
              {editingId ? 'Salvar Alterações' : 'Registrar Sessão'}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="flex-1 bg-gray-200 text-gray-800 font-semibold py-2 px-4 rounded-md shadow hover:bg-gray-300 transition-colors">
                Cancelar Edição
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Appointments List */}
      <div>
        <h2 className="text-xl font-semibold mb-4 text-pink-dark border-b pb-2">Lista de Atendimentos</h2>
        {appointments.length === 0 ? (
          <p className="text-gray-500">Nenhum atendimento registrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-lavender bg-gray-50 text-gray-700">
                  <th className="py-2 px-4 w-24">Data</th>
                  <th className="py-2 px-4 w-20">Horário</th>
                  <th className="py-2 px-4">Paciente</th>
                  <th className="py-2 px-4">Observações</th>
                  <th className="py-2 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {/* Sort appointments by date descending normally, but for simplicity just show them */}
                {appointments.slice().sort((a,b) => {
                   const dateA = new Date(a.date + 'T' + a.time);
                   const dateB = new Date(b.date + 'T' + b.time);
                   return dateB - dateA;
                }).map(appt => (
                  <tr key={appt.id} className="border-b border-lavender hover:bg-gray-50/50">
                    <td className="py-2 px-4 whitespace-nowrap text-gray-800">
                      {new Date(appt.date + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-2 px-4 text-gray-600">{appt.time.substring(0, 5)}</td>
                    <td className="py-2 px-4 font-medium text-gray-800">{appt.patient?.name || 'Desconhecido'}</td>
                    <td className="py-2 px-4 text-gray-600 break-words max-w-xs truncate">{appt.observations || '-'}</td>
                    <td className="py-2 px-4 text-right space-x-2 whitespace-nowrap">
                      <button onClick={() => handleEdit(appt)} className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors">
                        Editar
                      </button>
                      <button onClick={() => handleDelete(appt.id)} className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors">
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

