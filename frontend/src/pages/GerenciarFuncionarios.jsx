import { useState, useEffect } from 'react';
import { getUsers, createUser, updateUser, deleteUser, resetUserPassword } from '../api';

export default function GerenciarFuncionarios() {
  const [funcionarios, setFuncionarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({ full_name: '', phone: '', email: '' });
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resettingId, setResettingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getUsers();
      setFuncionarios(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm({ full_name: '', phone: '', email: '' });
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (u) => {
    setForm({ full_name: u.full_name, phone: u.phone, email: u.email || '' });
    setEditingId(u.id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await updateUser(editingId, form);
      } else {
        await createUser(form);
      }
      await load();
      resetForm();
      setSuccess(editingId ? 'Funcionário atualizado com sucesso!' : 'Funcionário cadastrado com sucesso!');
      setTimeout(() => setSuccess(''), 4000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Excluir funcionário "${name}"? Esta ação não pode ser desfeita.`)) return;
    setError('');
    try {
      await deleteUser(id);
      setFuncionarios(f => f.filter(x => x.id !== id));
      setSuccess('Funcionário excluído.');
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-800">👥 Funcionários</h2>
        <button
          onClick={() => setShowForm(s => !s)}
          className="px-4 py-2 bg-pink-dark text-white rounded-lg text-sm font-medium hover:bg-pink-600 transition-colors"
        >
          {showForm ? '✕ Fechar' : '+ Novo Funcionário'}
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
          <h3 className="font-semibold text-gray-700">{editingId ? 'Editar Funcionário' : 'Novo Funcionário'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              <label className="block text-xs font-medium text-gray-600 mb-1">E-mail (opcional)</label>
              <input
                type="email" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </div>
          </div>
          {!editingId && (
            <p className="text-xs text-gray-500 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
              ℹ️ O funcionário definirá a própria senha no primeiro acesso usando o telefone cadastrado.
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={resetForm} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
            <button type="submit" disabled={saving} className="px-5 py-2 bg-pink-dark text-white rounded-lg text-sm font-medium hover:bg-pink-600 disabled:opacity-60">
              {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Cadastrar'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-center text-gray-500 py-8">Carregando…</p>
      ) : funcionarios.length === 0 ? (
        <p className="text-center text-gray-500 py-8">Nenhum funcionário cadastrado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="bg-gradient-to-r from-lavender/40 to-pink-light/30 text-gray-700">
                <th className="px-4 py-3 text-left rounded-tl-lg">Nome</th>
                <th className="px-4 py-3 text-left">Telefone</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Senha</th>
                <th className="px-4 py-3 text-center rounded-tr-lg">Ações</th>
              </tr>
            </thead>
            <tbody>
              {funcionarios.map((u, i) => (
                <tr key={u.id} className={`border-b ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-lavender/10`}>
                  <td className="px-4 py-3 font-medium">{u.full_name}</td>
                  <td className="px-4 py-3 text-gray-600">{u.phone}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {u.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.must_change_password ? (
                      <span className="text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 rounded px-2 py-0.5">Aguardando 1º acesso</span>
                    ) : (
                      <span className="text-xs text-green-600">✓ Definida</span>
                    )}
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
                        title="Forçar nova definição de senha no próximo acesso"
                      >
                        {resettingId === u.id ? '⏳' : '🔑 Reset Senha'}
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
