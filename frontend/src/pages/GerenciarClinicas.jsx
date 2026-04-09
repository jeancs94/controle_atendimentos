import { useState, useEffect } from 'react';
import { getClinics, createClinic, updateClinic } from '../api';

export default function GerenciarClinicas() {
  const [clinicas, setClinicas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({ name: '', is_active: true, mfa_required: false, backup_active: false });
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getClinics();
      setClinicas(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm({ name: '', is_active: true, mfa_required: false, backup_active: false });
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (c) => {
    setForm({
      name: c.name,
      is_active: c.is_active,
      mfa_required: c.mfa_required,
      backup_active: c.backup_active
    });
    setEditingId(c.id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await updateClinic(editingId, form);
      } else {
        await createClinic(form);
      }
      await load();
      resetForm();
      setSuccess(editingId ? 'Clínica atualizada!' : 'Clínica cadastrada!');
      setTimeout(() => setSuccess(''), 4000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-800">🏥 Gerenciar Clínicas</h2>
        <button
          onClick={() => setShowForm(s => !s)}
          className="px-4 py-2 bg-pink-dark text-white rounded-lg text-sm font-medium hover:bg-pink-600 transition-colors"
        >
          {showForm ? '✕ Fechar' : '+ Nova Clínica'}
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
        <form onSubmit={handleSubmit} className="bg-lavender/20 border border-lavender rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-gray-700">{editingId ? 'Editar Clínica' : 'Nova Clínica'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nome da Clínica *</label>
              <input
                required value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </div>
            <div className="flex flex-col gap-2 justify-center mt-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                />
                Clínica Ativa
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.mfa_required}
                  onChange={e => setForm(f => ({ ...f, mfa_required: e.target.checked }))}
                  className="rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                />
                Exigir MFA para funcionários
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.backup_active}
                  onChange={e => setForm(f => ({ ...f, backup_active: e.target.checked }))}
                  className="rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                />
                Rotina de Backup Automático
              </label>
            </div>
          </div>
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
      ) : clinicas.length === 0 ? (
        <p className="text-center text-gray-500 py-8">Nenhuma clínica cadastrada.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-lavender/40 to-pink-light/30 text-gray-700">
                <th className="px-4 py-3 text-left rounded-tl-lg">Id</th>
                <th className="px-4 py-3 text-left">Nome da Clínica</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Políticas Seg.</th>
                <th className="px-4 py-3 text-center rounded-tr-lg">Ações</th>
              </tr>
            </thead>
            <tbody>
              {clinicas.map((c, i) => (
                <tr key={c.id} className={`border-b ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-lavender/10`}>
                  <td className="px-4 py-3 font-medium text-gray-500">#{c.id}</td>
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {c.is_active ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1 text-[10px]">
                      <span className={c.mfa_required ? 'text-blue-600 font-bold' : 'text-gray-400'}>MFA: {c.mfa_required ? 'ON' : 'OFF'}</span>
                      <span className={c.backup_active ? 'text-blue-600 font-bold' : 'text-gray-400'}>Backup: {c.backup_active ? 'ON' : 'OFF'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => handleEdit(c)} className="px-3 py-1 text-xs bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 border border-blue-200">
                      Editar & Configurar
                    </button>
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
