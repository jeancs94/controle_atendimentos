import { useState, useEffect } from 'react';
import { getUsers, createUser, updateUser, deleteUser, resetUserPassword, getClinics, getAppointments } from '../api';
import { useAuth } from '../AuthContext';

const TIME_SLOTS = ['08:00', '08:40', '09:20', '10:00', '10:40', '11:20', '13:00', '13:40', '14:20', '15:00', '15:40', '16:20', '17:00', '17:40', '18:20'];

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '-';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const getWeekDates = (anchorDate) => {
  const baseDate = new Date(`${anchorDate || new Date().toISOString().split('T')[0]}T12:00:00`);
  const dayOffset = (baseDate.getDay() + 6) % 7;
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() - dayOffset);

  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return {
      key: date.toISOString().split('T')[0],
      label: date.toLocaleDateString('pt-BR', { weekday: 'short' }),
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

export default function GerenciarFuncionarios() {
  const { isSuperAdmin } = useAuth();
  const [funcionarios, setFuncionarios] = useState([]);
  const [clinicas, setClinicas] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [agendaDate, setAgendaDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', cargo: '', role: 'employee', clinic_id: '' });
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resettingId, setResettingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [data, clinicsData, appointmentsData] = await Promise.all([
        getUsers(),
        isSuperAdmin ? getClinics() : Promise.resolve([]),
        getAppointments()
      ]);
      setFuncionarios(data);
      setAppointments(appointmentsData);
      if (isSuperAdmin) setClinicas(clinicsData);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm({ full_name: '', phone: '', email: '', cargo: '', role: 'employee', clinic_id: '' });
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (u) => {
    setForm({
      full_name: u.full_name,
      phone: u.phone,
      email: u.email || '',
      cargo: u.cargo || '',
      role: u.role,
      clinic_id: u.clinic_id || ''
    });
    setEditingId(u.id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { ...form };
      if (!isSuperAdmin) {
        delete payload.role;
        delete payload.clinic_id;
      } else {
        if (!payload.clinic_id && payload.role !== 'superadmin') {
           throw new Error("Por favor, selecione uma clínica.");
        }
      }

      if (editingId) {
        await updateUser(editingId, payload);
      } else {
        await createUser(payload);
      }
      await load();
      resetForm();
      setSuccess(editingId ? 'Usuário atualizado com sucesso!' : 'Usuário cadastrado com sucesso!');
      setTimeout(() => setSuccess(''), 4000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Excluir usuário "${name}"? Esta ação não pode ser desfeita.`)) return;
    setError('');
    try {
      await deleteUser(id);
      setFuncionarios(f => f.filter(x => x.id !== id));
      setSuccess('Usuário excluído.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleToggleActive = async (u) => {
    setError('');
    try {
      await updateUser(u.id, { is_active: !u.is_active });
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleResetPassword = async (u) => {
    if (!confirm(`Resetar a senha de "${u.full_name}"?\n\nEle/ela precisará definir uma nova senha no próximo acesso.`)) return;
    setResettingId(u.id);
    setError('');
    try {
      await resetUserPassword(u.id);
      await load();
      setSuccess(`Senha de ${u.full_name} resetada. Aguarda novo acesso.`);
      setTimeout(() => setSuccess(''), 5000);
    } catch (e) {
      setError(e.message);
    } finally {
      setResettingId(null);
    }
  };

  const professionalList = funcionarios.filter((u) => ['employee', 'admin'].includes(u.role));
  const weekDates = getWeekDates(agendaDate);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-800">
          {isSuperAdmin ? '👥 Todos os Usuários / Administradores' : '👥 Minha Equipe (Funcionários)'}
        </h2>
        <button
          onClick={() => setShowForm(s => !s)}
          className="px-4 py-2 bg-pink-dark text-white rounded-lg text-sm font-medium hover:bg-pink-600 transition-colors"
        >
          {showForm ? '✕ Fechar' : isSuperAdmin ? '+ Novo Admin/Usuário' : '+ Novo Funcionário'}
        </button>
      </div>

      {error && (
        <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
          <button className="ml-2 underline" onClick={() => setError('')}>fechar</button>
        </div>
      )}

      {success && (
        <div className="text-green-700 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          ✅ {success}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-lavender/20 border border-lavender rounded-xl p-5 space-y-3">
          <h3 className="font-semibold text-gray-700">{editingId ? 'Editar Usuário' : 'Novo Usuário'}</h3>
          
          {isSuperAdmin && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 p-3 bg-white rounded border border-gray-200">
              <div>
                <label className="block text-xs font-bold text-purple-700 mb-1">Nível de Acesso *</label>
                <select
                   required value={form.role}
                   onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                   className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                >
                  <option value="employee">Funcionário Padrão</option>
                  <option value="admin">Administrador de Clínica</option>
                  <option value="superadmin">Super Administrador (Global)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-purple-700 mb-1">Clínica *</label>
                <select
                   required={form.role !== 'superadmin'}
                   disabled={form.role === 'superadmin'}
                   value={form.clinic_id}
                   onChange={e => setForm(f => ({ ...f, clinic_id: e.target.value ? Number(e.target.value) : '' }))}
                   className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 disabled:bg-gray-100"
                >
                  <option value="">Selecione uma clínica...</option>
                  {clinicas.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nome completo *</label>
              <input
                required value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Telefone (login) *</label>
              <input
                required value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="11999999999"
                disabled={!!editingId}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 disabled:bg-gray-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cargo</label>
              <input
                value={form.cargo}
                onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))}
                placeholder="Ex: Psicóloga, Atendente, Terapia..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">E-mail (opcional)</label>
              <input
                type="email" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </div>
          </div>
          {!editingId && (
            <p className="text-xs text-gray-500 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 mt-2">
              ℹ️ O usuário definirá a própria senha no primeiro acesso usando o telefone cadastrado.
            </p>
          )}
          <div className="flex gap-2 justify-end mt-4">
            <button type="button" onClick={resetForm} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
            <button type="submit" disabled={saving} className="px-5 py-2 bg-pink-dark text-white rounded-lg text-sm font-medium hover:bg-pink-600 disabled:opacity-60">
              {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Cadastrar'}
            </button>
          </div>
        </form>
      )}

      <div className="border rounded-xl p-4 bg-white mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Agenda semanal por profissional</h3>
          <label className="text-sm text-gray-700">
            Semana
            <input type="date" value={agendaDate} onChange={(e) => setAgendaDate(e.target.value)} className="ml-2 border border-gray-300 rounded-md p-2 bg-white" />
          </label>
        </div>

        {professionalList.length === 0 ? (
          <p className="text-gray-500">Nenhum profissional cadastrado.</p>
        ) : (
          <div className="space-y-6">
            {professionalList.map((member) => (
              <div key={member.id} className="border border-gray-200 rounded-lg bg-white shadow-sm">
                <div className="border-b border-gray-200 bg-gray-50 px-3 py-2">
                  <h4 className="font-semibold text-gray-800">{member.full_name}</h4>
                  <span className="text-[10px] uppercase tracking-wide text-gray-500">{member.role}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-[11px] text-gray-700">
                    <thead>
                      <tr className="bg-gray-100 text-gray-800">
                        <th className="border border-gray-200 bg-gray-100 px-2 py-2 text-left font-semibold min-w-[100px]">Horários</th>
                        {weekDates.map((day) => (
                          <th key={`${member.id}-${day.key}`} className="border border-gray-200 bg-gray-100 px-2 py-2 text-center font-semibold min-w-[140px]">
                            <div>{day.label}</div>
                            <div className="text-[10px] text-gray-500 font-medium">{formatDate(day.key)}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {TIME_SLOTS.map((slot) => (
                        <tr key={`${member.id}-${slot}`} className="hover:bg-gray-50/60">
                          <td className="border border-gray-200 bg-gray-50 px-2 py-2 font-semibold text-gray-700 text-center">{slot}</td>
                          {weekDates.map((day) => {
                            const appt = appointments.find((item) => Number(item.professional_id) === Number(member.id) && matchesWeeklyAppointment(item, slot, day.key));
                            return (
                              <td key={`${member.id}-${day.key}-${slot}`} className="border border-gray-200 px-2 py-2 align-top min-w-[140px]">
                                {appt ? (
                                  <div className={`rounded border px-2 py-1.5 text-left leading-tight ${appt.patient?.is_aba ? 'bg-yellow-100 border-yellow-300 text-yellow-900' : 'bg-pink-50 border-pink-200 text-gray-700'}`}>
                                    <div className={`font-semibold ${appt.patient?.is_aba ? 'text-yellow-800' : 'text-pink-700'}`}>
                                      {appt.patient?.name || 'Paciente'}
                                      {appt.patient?.is_aba && <span className="ml-1 text-[9px] font-bold">ABA</span>}
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
              </div>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-center text-gray-500 py-8">Carregando…</p>
      ) : funcionarios.length === 0 ? (
        <p className="text-center text-gray-500 py-8">Nenhum usuário cadastrado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="bg-gradient-to-r from-lavender/40 to-pink-light/30 text-gray-700">
                <th className="px-4 py-3 text-left rounded-tl-lg">Nome</th>
                <th className="px-4 py-3 text-left">Cargo</th>
                <th className="px-4 py-3 text-left">Telefone</th>
                <th className="px-4 py-3 text-left">Clínica</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-center rounded-tr-lg">Ações</th>
              </tr>
            </thead>
            <tbody>
              {funcionarios.map((u, i) => (
                <tr key={u.id} className={`border-b ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-lavender/10`}>
                  <td className="px-4 py-3 font-medium flex flex-col">
                    {u.full_name}
                    {u.must_change_password ? (
                      <span className="text-[10px] text-yellow-600">senha pedente (1º acesso)</span>
                    ) : (
                      <span className="text-[10px] text-green-600">senha ok</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{u.cargo || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{u.phone}</td>
                  <td className="px-4 py-3 text-xs">
                    <span className={`font-bold ${u.role==='superadmin' ? 'text-red-700': u.role==='admin' ? 'text-blue-700': 'text-gray-700'}`}>
                      {u.role.toUpperCase()}
                    </span>
                    <br />
                    <span className="text-gray-500">{u.clinic ? u.clinic.name : 'Nenhuma'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {u.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-center flex-wrap">
                      <button onClick={() => handleEdit(u)} className="px-3 py-1 text-xs bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 border border-blue-200">
                        Editar
                      </button>
                      <button onClick={() => handleToggleActive(u)} className={`px-3 py-1 text-xs rounded-lg border ${u.is_active ? 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100' : 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100'}`}>
                        {u.is_active ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        onClick={() => handleResetPassword(u)}
                        disabled={resettingId === u.id}
                        className="px-3 py-1 text-xs bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 border border-amber-200 disabled:opacity-50"
                        title="Forçar nova definição de senha"
                      >
                        {resettingId === u.id ? '⏳' : 'Reset'}
                      </button>
                      <button onClick={() => handleDelete(u.id, u.full_name)} className="px-3 py-1 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 border border-red-200">
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
