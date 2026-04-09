import { useState } from 'react';
import { updateMyProfile, changeMyPassword } from '../api';
import { useAuth } from '../AuthContext';

export default function MeuPerfil() {
  const { user } = useAuth();
  const [dataForm, setDataForm] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
  });
  
  const [passForm, setPassForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await updateMyProfile(dataForm);
      setSuccess('Dados atualizados com sucesso! (Algumas mudanças podem exigir novo login para refletir no cabeçalho)');
      // In a real app, we might update the AuthContext state here too
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passForm.new_password !== passForm.confirm_password) {
      setError('A nova senha e a confirmação não coincidem.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await changeMyPassword({
        current_password: passForm.current_password,
        new_password: passForm.new_password,
      });
      setSuccess('Senha alterada com sucesso!');
      setPassForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="border-b border-gray-200 pb-4">
        <h2 className="text-2xl font-bold text-gray-800">👤 Meu Perfil</h2>
        <p className="text-gray-500 text-sm">Gerencie suas informações pessoais e segurança da conta.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          ✅ {success}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Dados Pessoais */}
        <div className="bg-white p-6 rounded-xl border border-lavender shadow-sm space-y-4">
          <h3 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
            📝 Dados Pessoais
          </h3>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nome Completo</label>
              <input
                type="text"
                required
                value={dataForm.full_name}
                onChange={(e) => setDataForm({ ...dataForm, full_name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-pink-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">E-mail</label>
              <input
                type="email"
                value={dataForm.email}
                onChange={(e) => setDataForm({ ...dataForm, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-pink-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Telefone (Login)</label>
              <input
                type="text"
                disabled
                value={user?.phone || ''}
                className="w-full px-4 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-500 cursor-not-allowed"
              />
              <p className="text-[10px] text-gray-400 mt-1">O telefone de login não pode ser alterado.</p>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-pink-dark text-white py-2 rounded-lg font-medium hover:bg-pink-600 transition-colors disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Atualizar Dados'}
            </button>
          </form>
        </div>

        {/* Segurança */}
        <div className="bg-white p-6 rounded-xl border border-lavender shadow-sm space-y-4">
          <h3 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
            🔒 Segurança
          </h3>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Senha Atual</label>
              <input
                type="password"
                required
                value={passForm.current_password}
                onChange={(e) => setPassForm({ ...passForm, current_password: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-pink-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nova Senha</label>
              <input
                type="password"
                required
                minLength={6}
                value={passForm.new_password}
                onChange={(e) => setPassForm({ ...passForm, new_password: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-pink-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Confirmar Nova Senha</label>
              <input
                type="password"
                required
                value={passForm.confirm_password}
                onChange={(e) => setPassForm({ ...passForm, confirm_password: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-pink-400 outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-800 text-white py-2 rounded-lg font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Alterando...' : 'Alterar Senha'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
