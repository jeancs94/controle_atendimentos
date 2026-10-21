import { useState, useEffect } from 'react';
import {
  createAppointment,
  createPatient,
  createScheduleChangeRequest,
  deleteAppointment,
  deletePatient,
  getAppointments,
  getClinics,
  getPatients,
  getUsers,
  updateAppointment,
  updatePatient,
} from '../api';
import { useAuth } from '../AuthContext';

const TIME_SLOTS = ['08:00', '08:40', '09:20', '10:00', '10:40', '11:20', '13:00', '13:40', '14:20', '15:00', '15:40', '16:20', '17:00', '17:40', '18:20'];

const getWeekDates = (anchorDate) => {
  const baseDate = new Date(`${anchorDate || new Date().toISOString().split('T')[0]}T12:00:00`);
  const dayOffset = (baseDate.getDay() + 6) % 7;
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() - dayOffset);

  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const iso = date.toISOString().split('T')[0];
    return {
      key: iso,
      label: date.toLocaleDateString('pt-BR', { weekday: 'short' }),
      shortLabel: date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
    };
  });
};

const matchesWeeklyAppointment = (appt, slot, dateKey) => {
  if (!appt || !appt.time || !appt.date) return false;
  const apptSlot = String(appt.time).slice(0, 5);
  if (apptSlot !== slot) return false;

  if (appt.recurring) {
    const apptDate = new Date(`${appt.date}T12:00:00`);
    const targetDate = new Date(`${dateKey}T12:00:00`);
    return apptDate.getDay() === targetDate.getDay();
  }

  return appt.date === dateKey;
};

const formatTime = (value) => value ? String(value).substring(0, 5) : '-';
const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '-';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};
const getVisibleAppointmentsForDate = (list, selectedDate) => {
  if (!selectedDate) return [];
  const targetDay = new Date(`${selectedDate}T00:00:00`).getDay();

  return [...list].filter((appt) => {
    if (!appt.date) return false;
    const apptDate = new Date(`${appt.date}T00:00:00`);
    if (appt.recurring) {
      return apptDate.getDay() === targetDay;
    }
    return appt.date === selectedDate;
  }).sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));
};

export default function CadastroPaciente() {
  const { user, isAdmin, isSuperAdmin, isEmployee } = useAuth();
  const [clinics, setClinics] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    created_at: new Date().toISOString().split('T')[0],
    clinic_id: '',
    is_aba: false,
  });
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [subView, setSubView] = useState('cadastrados');
  const [appointmentForm, setAppointmentForm] = useState({
    professional_id: '',
    type: 'Avulso',
    date: new Date().toISOString().split('T')[0],
    time: '08:00',
    value: '',
    observations: '',
    recurring: false,
  });
  const [requestForm, setRequestForm] = useState({
    requested_date: new Date().toISOString().split('T')[0],
    requested_time: '08:00',
    message: '',
  });
  const [status, setStatus] = useState(null);
  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [editingAppointmentId, setEditingAppointmentId] = useState(null);

  const loadData = async () => {
    try {
      const [patientsData, appointmentsData, usersData = [], clinicsData = []] = await Promise.all([
        getPatients(),
        getAppointments(),
        isAdmin || isSuperAdmin ? getUsers() : Promise.resolve([]),
        isSuperAdmin ? getClinics() : Promise.resolve([]),
      ]);
      setPatients(patientsData);
      setAppointments(appointmentsData);
      setTeamMembers(usersData.filter((u) => ['employee', 'admin'].includes(u.role)));
      setClinics(clinicsData);
      if (selectedPatientId && !patientsData.some((p) => p.id === Number(selectedPatientId))) {
        setSelectedPatientId(null);
      }
      return patientsData;
    } catch (err) {
      console.error('Erro ao carregar pacientes', err);
      setStatus({ type: 'error', message: 'Erro ao carregar dados do paciente.' });
      return [];
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.role]);

  const selectedPatient = patients.find((p) => p.id === Number(selectedPatientId)) || null;
  const weekDates = getWeekDates(selectedDate);
  const patientAppointments = appointments.filter((appt) => Number(appt.patient_id) === Number(selectedPatientId));
  const myAppointments = patientAppointments.filter((appt) => Number(appt.professional_id) === Number(user?.id));
  const professionalOptions = teamMembers.length > 0
    ? teamMembers
    : (user ? [{ id: user.id, full_name: user.full_name }] : []);

  const resetForm = () => {
    setFormData({ name: '', created_at: new Date().toISOString().split('T')[0], clinic_id: isSuperAdmin ? String(clinics[0]?.id || '') : '', is_aba: false });
    setEditingId(null);
    setSubView('cadastrados');
  };

  const resetAppointmentForm = () => {
    setAppointmentForm({
      professional_id: teamMembers[0]?.id ? String(teamMembers[0].id) : (user?.id ? String(user.id) : ''),
      type: 'Avulso',
      date: new Date().toISOString().split('T')[0],
      time: '08:00',
      value: '',
      observations: '',
      recurring: false,
    });
    setEditingAppointmentId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus(null);
    try {
      if (isSuperAdmin && !formData.clinic_id) {
        throw new Error('Selecione uma clínica para cadastrar o paciente.');
      }

      const payload = { ...formData };
      if (payload.clinic_id === '') {
        delete payload.clinic_id;
      }

      let savedPatient;
      if (editingId) {
        savedPatient = await updatePatient(editingId, payload);
        setStatus({ type: 'success', message: 'Paciente atualizado com sucesso!' });
      } else {
        savedPatient = await createPatient(payload);
        setStatus({ type: 'success', message: 'Paciente cadastrado com sucesso!' });
      }

      await loadData();
      resetForm();
      if (savedPatient?.id) {
        setSelectedPatientId(savedPatient.id);
      }
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'Erro ao processar a solicitação.' });
    }
  };

  const handleEdit = (p) => {
    setSelectedPatientId(null);
    setSubView('novo');
    setEditingId(p.id);
    setFormData({
      name: p.name,
      created_at: p.created_at,
      clinic_id: p.clinic_id ? String(p.clinic_id) : '',
      is_aba: Boolean(p.is_aba),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir este paciente e todos os seus atendimentos?')) return;
    try {
      await deletePatient(id);
      setStatus({ type: 'success', message: 'Paciente excluído com sucesso!' });
      if (editingId === id) resetForm();
      await loadData();
      if (selectedPatientId === id) {
        const remaining = patients.filter((p) => p.id !== id);
        setSelectedPatientId(remaining[0]?.id ?? null);
      }
    } catch (err) {
      setStatus({ type: 'error', message: 'Erro ao excluir paciente.' });
    }
  };

  const handleAppointmentSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPatientId) return;
    setStatus(null);

    try {
      const payload = {
        patient_id: Number(selectedPatientId),
        professional_id: Number(appointmentForm.professional_id),
        type: appointmentForm.type,
        date: appointmentForm.date,
        time: appointmentForm.time,
        value: parseFloat(appointmentForm.value) || 0,
        observations: appointmentForm.observations,
        recurring: Boolean(appointmentForm.recurring),
      };
      if (editingAppointmentId) {
        await updateAppointment(editingAppointmentId, payload);
        setStatus({ type: 'success', message: 'Atendimento atualizado com sucesso!' });
      } else {
        await createAppointment(payload);
        setStatus({ type: 'success', message: 'Atendimento registrado com sucesso!' });
      }
      resetAppointmentForm();
      await loadData();
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'Erro ao salvar atendimento.' });
    }
  };

  const handleEditAppointment = (appt) => {
    setEditingAppointmentId(appt.id);
    setAppointmentForm({
      professional_id: appt.professional_id ? String(appt.professional_id) : '',
      type: appt.type || 'Avulso',
      date: appt.date,
      time: formatTime(appt.time),
      value: appt.value ? String(appt.value) : '',
      observations: appt.observations || '',
      recurring: Boolean(appt.recurring),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteAppointment = async (id) => {
    if (!window.confirm('Deseja excluir este atendimento?')) return;
    try {
      await deleteAppointment(id);
      setStatus({ type: 'success', message: 'Atendimento excluído!' });
      await loadData();
    } catch (err) {
      setStatus({ type: 'error', message: 'Erro ao excluir atendimento.' });
    }
  };

  const handleScheduleRequest = async (e) => {
    e.preventDefault();
    if (!selectedPatientId) return;
    if (requestForm.message.trim().length === 0) {
      setStatus({ type: 'error', message: 'Escreva a solicitação de alteração.' });
      return;
    }
    if (requestForm.message.length > 200) {
      setStatus({ type: 'error', message: 'A solicitação deve ter até 200 caracteres.' });
      return;
    }

    try {
      await createScheduleChangeRequest({
        patient_id: Number(selectedPatientId),
        requested_date: requestForm.requested_date,
        requested_time: requestForm.requested_time,
        message: requestForm.message,
      });
      setStatus({ type: 'success', message: 'Solicitação enviada para o administrador.' });
      setRequestForm({
        requested_date: new Date().toISOString().split('T')[0],
        requested_time: '08:00',
        message: '',
      });
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'Erro ao enviar solicitação.' });
    }
  };

  return (
    <div className="space-y-8">
      {status && (
        <div className={`p-4 rounded ${status.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {status.message}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b pb-3 mb-4">
        <button
          type="button"
          onClick={() => {
            setSelectedPatientId(null);
            setSubView('cadastrados');
          }}
          className={`px-4 py-2 rounded-full text-sm font-medium ${subView === 'cadastrados' ? 'bg-pink-dark text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          Cadastrados
        </button>
        {(isAdmin || isSuperAdmin) && (
          <button
            type="button"
            onClick={() => {
              setSelectedPatientId(null);
              setSubView('novo');
            }}
            className={`px-4 py-2 rounded-full text-sm font-medium ${subView === 'novo' ? 'bg-pink-dark text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            Cadastrar novo
          </button>
        )}
      </div>

      {selectedPatient && (
        <div className="space-y-6">
          <div className="flex justify-between items-center gap-4">
            <div>
              <p className="text-sm uppercase tracking-wide text-gray-500">Página do paciente</p>
              <h3 className="text-2xl font-bold text-gray-800">{selectedPatient.name}</h3>
            </div>
            <button onClick={() => setSelectedPatientId(null)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors">
              Voltar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="bg-gray-50 rounded-lg p-4 border"><strong>Cadastro:</strong> {formatDate(selectedPatient.created_at)}</div>
            <div className="bg-gray-50 rounded-lg p-4 border"><strong>Paciente:</strong> {selectedPatient.name}</div>
          </div>

          <div className="flex items-center gap-3 border rounded-lg p-3 bg-gray-50">
            <label className="font-medium text-gray-700">Semana:</label>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="border border-gray-300 rounded-md p-2 bg-white" />
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full border-collapse text-[11px] text-gray-700">
              <thead>
                <tr className="bg-gray-100 text-gray-800">
                  <th className="border border-gray-200 bg-gray-100 px-2 py-2 text-left font-semibold min-w-[100px]">Horários</th>
                  {weekDates.map((day) => (
                    <th key={day.key} className="border border-gray-200 bg-gray-100 px-2 py-2 text-center font-semibold min-w-[140px]">
                      <div>{day.label}</div>
                      <div className="text-[10px] text-gray-500 font-medium">{formatDate(day.key)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIME_SLOTS.map((slot) => (
                  <tr key={slot} className="hover:bg-gray-50/60">
                    <td className="border border-gray-200 bg-gray-50 px-2 py-2 font-semibold text-gray-700 text-center">{slot}</td>
                    {weekDates.map((day) => {
                      const appointment = patientAppointments.find((appt) => matchesWeeklyAppointment(appt, slot, day.key));
                      return (
                        <td key={`${slot}-${day.key}`} className="border border-gray-200 px-2 py-2 align-top min-w-[140px]">
                          {appointment ? (
                            <div className={`rounded border px-2 py-1.5 text-left leading-tight ${selectedPatient?.is_aba ? 'bg-yellow-100 border-yellow-300 text-yellow-900' : 'bg-pink-50 border-pink-200 text-gray-700'}`}>
                              <div className={`font-semibold ${selectedPatient?.is_aba ? 'text-yellow-800' : 'text-pink-700'}`}>
                                {appointment.professional?.full_name || 'Não definido'}
                              </div>
                              <div className={`text-[10px] ${selectedPatient?.is_aba ? 'text-yellow-700' : 'text-gray-600'}`}>
                                {appointment.type || 'Atendimento'}
                              </div>
                            </div>
                          ) : (
                            <div className="text-center text-gray-300">—</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(isAdmin || isSuperAdmin) && (
            <form onSubmit={handleAppointmentSubmit} className="space-y-4 border rounded-lg p-4 bg-lavender/10">
              <h4 className="text-lg font-semibold text-gray-800">
                {editingAppointmentId ? 'Editar atendimento' : 'Adicionar atendimento ao paciente'}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Profissional</label>
                  <select value={appointmentForm.professional_id} onChange={(e) => setAppointmentForm({ ...appointmentForm, professional_id: e.target.value })} className="w-full border-gray-300 rounded-md shadow-sm p-2 bg-white border focus:border-pink-light outline-none">
                    <option value="">Selecione o profissional</option>
                    {teamMembers.map((member) => (
                      <option key={member.id} value={member.id}>{member.full_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Tipo do atendimento</label>
                  <select value={appointmentForm.type} onChange={(e) => setAppointmentForm({ ...appointmentForm, type: e.target.value })} className="w-full border-gray-300 rounded-md shadow-sm p-2 bg-white border focus:border-pink-light outline-none">
                    <option value="Avulso">Avulso</option>
                    <option value="Pacote Mensal">Pacote Mensal</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Valor do atendimento (R$)</label>
                  <input type="number" step="0.01" min="0" value={appointmentForm.value} onChange={(e) => setAppointmentForm({ ...appointmentForm, value: e.target.value })} className="w-full border-gray-300 rounded-md shadow-sm p-2 bg-gray-50 border focus:border-pink-light outline-none" />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Data</label>
                  <input type="date" value={appointmentForm.date} onChange={(e) => setAppointmentForm({ ...appointmentForm, date: e.target.value })} className="w-full border-gray-300 rounded-md shadow-sm p-2 bg-gray-50 border focus:border-pink-light outline-none" />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Horário</label>
                  <select value={appointmentForm.time} onChange={(e) => setAppointmentForm({ ...appointmentForm, time: e.target.value })} className="w-full border-gray-300 rounded-md shadow-sm p-2 bg-white border focus:border-pink-light outline-none">
                    {TIME_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>{slot}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="recurring-checkbox"
                  type="checkbox"
                  checked={Boolean(appointmentForm.recurring)}
                  onChange={(e) => setAppointmentForm({ ...appointmentForm, recurring: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-pink-dark focus:ring-pink-light"
                />
                <label htmlFor="recurring-checkbox" className="text-sm text-gray-700">Atendimento recorrente (repete no mesmo dia da semana, horário e profissional)</label>
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-1">Observações</label>
                <textarea value={appointmentForm.observations} onChange={(e) => setAppointmentForm({ ...appointmentForm, observations: e.target.value })} rows="3" className="w-full border-gray-300 rounded-md shadow-sm p-2 bg-gray-50 border focus:border-pink-light outline-none" placeholder="Observações do atendimento"></textarea>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="bg-pink-light text-gray-800 font-semibold py-2 px-4 rounded-md shadow hover:bg-pink-dark hover:text-white transition-colors">
                  {editingAppointmentId ? 'Salvar alteração' : 'Salvar atendimento'}
                </button>
                {editingAppointmentId && (
                  <button type="button" onClick={resetAppointmentForm} className="bg-gray-200 text-gray-800 font-semibold py-2 px-4 rounded-md shadow hover:bg-gray-300 transition-colors">
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          )}

          {isEmployee && (
            <form onSubmit={handleScheduleRequest} className="border rounded-lg p-4 bg-amber-50">
              <h4 className="text-lg font-semibold text-gray-800 mb-3">Solicitação de alteração de horário</h4>
              {myAppointments.length === 0 ? (
                <p className="text-sm text-gray-600">Você não está vinculado a este paciente para agenda.</p>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-gray-700 font-medium mb-1">Nova data</label>
                      <input type="date" value={requestForm.requested_date} onChange={(e) => setRequestForm({ ...requestForm, requested_date: e.target.value })} className="w-full border-gray-300 rounded-md shadow-sm p-2 bg-white border focus:border-pink-light outline-none" />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-medium mb-1">Novo horário</label>
                      <select value={requestForm.requested_time} onChange={(e) => setRequestForm({ ...requestForm, requested_time: e.target.value })} className="w-full border-gray-300 rounded-md shadow-sm p-2 bg-white border focus:border-pink-light outline-none">
                        {TIME_SLOTS.map((slot) => (
                          <option key={slot} value={slot}>{slot}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-gray-700 font-medium mb-1">Mensagem</label>
                    <textarea value={requestForm.message} onChange={(e) => setRequestForm({ ...requestForm, message: e.target.value })} rows="4" maxLength={200} className="w-full border-gray-300 rounded-md shadow-sm p-2 bg-white border focus:border-pink-light outline-none" placeholder="Solicite alteração de data/horário para este paciente..." />
                    <div className="text-xs text-gray-500 mt-1">{requestForm.message.length}/200 caracteres</div>
                  </div>
                  <button type="submit" className="bg-amber-500 text-white font-semibold py-2 px-4 rounded-md shadow hover:bg-amber-600 transition-colors">
                    Enviar solicitação
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      )}

      {subView === 'novo' && (isAdmin || isSuperAdmin) && (
        <div>
          <h2 className="text-xl font-semibold mb-4 text-pink-dark border-b pb-2">
            {editingId ? 'Editar Paciente' : 'Cadastro de Pacientes'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSuperAdmin && (
              <div>
                <label className="block text-gray-700 font-medium mb-1">Clínica</label>
                <select value={formData.clinic_id} onChange={(e) => setFormData({ ...formData, clinic_id: e.target.value })} className="w-full border-gray-300 rounded-md shadow-sm p-2 bg-white border focus:border-pink-light outline-none">
                  <option value="">Selecione a clínica</option>
                  {clinics.map((clinic) => (
                    <option key={clinic.id} value={clinic.id}>{clinic.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-gray-700 font-medium mb-1">Nome Completo</label>
              <input required type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full border-gray-300 rounded-md shadow-sm p-2 bg-gray-50 border focus:border-pink-light outline-none" />
            </div>
            <div>
              <label className="block text-gray-700 font-medium mb-1">Data de Cadastro</label>
              <input required type="date" value={formData.created_at} onChange={(e) => setFormData({ ...formData, created_at: e.target.value })} className="w-full border-gray-300 rounded-md shadow-sm p-2 bg-gray-50 border focus:border-pink-light outline-none" />
            </div>
            <div>
              <label className="block text-gray-700 font-medium mb-1">Paciente ABA?</label>
              <select value={formData.is_aba ? 'sim' : 'nao'} onChange={(e) => setFormData({ ...formData, is_aba: e.target.value === 'sim' })} className="w-full border-gray-300 rounded-md shadow-sm p-2 bg-white border focus:border-pink-light outline-none">
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
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
      )}

      {!selectedPatient && subView === 'cadastrados' && (
        <div>
          <h2 className="text-xl font-semibold mb-4 text-pink-dark border-b pb-2">Pacientes cadastrados</h2>
          {patients.length === 0 ? (
            <p className="text-gray-500">Nenhum paciente cadastrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-lavender bg-gray-50 text-gray-700">
                    <th className="py-2 px-4">Nome</th>
                    <th className="py-2 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((p) => (
                    <tr key={p.id} className="border-b border-lavender hover:bg-gray-50/50">
                      <td className="py-2 px-4 font-medium text-gray-800">
                        <div className="flex items-center gap-2">
                          <span>{p.name}</span>
                          {p.is_aba && <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 text-[10px] font-bold">ABA</span>}
                        </div>
                      </td>
                      <td className="py-2 px-4 text-right space-x-2">
                        <button onClick={() => { setSelectedPatientId(p.id); setSubView('cadastrados'); }} className="px-3 py-1 bg-teal-100 text-teal-700 rounded hover:bg-teal-200 transition-colors">
                          Ver agenda
                        </button>
                        {(isAdmin || isSuperAdmin) && (
                          <>
                            <button onClick={() => handleEdit(p)} className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors">
                              Editar
                            </button>
                            <button onClick={() => handleDelete(p.id)} className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors">
                              Excluir
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
