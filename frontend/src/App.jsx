import { useState } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import LoginPage from './pages/LoginPage';
import PrimeiroAcesso from './pages/PrimeiroAcesso';
import GerenciarFuncionarios from './pages/GerenciarFuncionarios';
import LogsAuditoria from './pages/LogsAuditoria';
import CadastroPaciente from './components/CadastroPaciente';
import RegistroAtendimento from './components/RegistroAtendimento';
import PainelRelatorios from './components/PainelRelatorios';

function AppContent() {
  const { user, logout, isMaster } = useAuth();
  const [activeTab, setActiveTab] = useState('cadastro');

  // Not logged in
  if (!user) return <LoginPage />;

  // First access – must set password
  if (user.must_change_password) return <PrimeiroAcesso />;

  const tabs = [
    { id: 'cadastro', label: 'Pacientes' },
    { id: 'atendimentos', label: 'Agendar' },
    { id: 'relatorios', label: 'Relatórios' },
    ...(isMaster ? [{ id: 'funcionarios', label: '👥 Funcionários' }] : []),
    ...(isMaster ? [{ id: 'logs', label: '🔍 Logs' }] : []),
  ];

  return (
    <div className="min-h-screen bg-beige font-sans flex flex-col">
      {/* Navbar */}
      <nav className="bg-pink-light p-4 shadow-md w-full">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3">
          <h1 className="text-2xl font-bold logo-text tracking-tight text-gray-800 shrink-0">
            🌸 Clinica Evoluir M.M.
          </h1>
          <div className="flex flex-wrap gap-2 items-center">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-4 py-2 rounded-full whitespace-nowrap transition-colors shadow-sm font-medium text-sm
                  ${activeTab === t.id ? 'bg-pink-dark text-white' : 'bg-white hover:bg-lavender'}`}
              >
                {t.label}
              </button>
            ))}
            <div className="flex items-center gap-2 ml-2 pl-3 border-l border-pink-200">
              <span className="text-xs text-gray-600 hidden sm:block">
                {user.full_name}
                {isMaster && <span className="ml-1 text-[10px] bg-purple-200 text-purple-800 rounded-full px-1.5 py-0.5">master</span>}
              </span>
              <button
                onClick={logout}
                className="px-3 py-1.5 text-xs bg-white border border-gray-300 rounded-full hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors font-medium"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main */}
      <main className="flex-1 w-full max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="bg-white rounded-xl shadow-lg p-6 min-h-[400px] border border-lavender/50">
          {activeTab === 'cadastro' && <CadastroPaciente />}
          {activeTab === 'atendimentos' && <RegistroAtendimento />}
          {activeTab === 'relatorios' && <PainelRelatorios />}
          {activeTab === 'funcionarios' && isMaster && <GerenciarFuncionarios />}
          {activeTab === 'logs' && isMaster && <LogsAuditoria />}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-lavender p-4 text-center text-sm font-medium text-gray-600 mt-auto border-t border-purple-200">
        Controle de Atendimentos © {new Date().getFullYear()}
      </footer>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
