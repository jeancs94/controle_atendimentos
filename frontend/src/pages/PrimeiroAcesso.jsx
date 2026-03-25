import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { setPassword } from '../api';

export default function PrimeiroAcesso() {
  const { user, login, clearMustChangePassword } = useAuth();
  const [nova, setNova] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (nova.length < 6) { setError('A senha deve ter no mínimo 6 caracteres'); return; }
    if (nova !== confirmar) { setError('As senhas não coincidem'); return; }
    setLoading(true);
    try {
      await setPassword(user.phone || '', nova);
      clearMustChangePassword();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-beige flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm border border-lavender/50">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🔑</div>
          <h2 className="text-xl font-bold text-gray-800">Primeiro acesso</h2>
          <p className="text-gray-500 text-sm mt-1">
            Olá, <strong>{user?.full_name}</strong>! Defina uma senha para sua conta.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
            <input
              type="password"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar senha</label>
            <input
              type="password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              placeholder="Repita a senha"
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400 text-sm"
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-pink-dark text-white py-2.5 rounded-lg font-medium hover:bg-pink-600 disabled:opacity-60 transition-colors"
          >
            {loading ? 'Salvando…' : 'Definir senha e entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
