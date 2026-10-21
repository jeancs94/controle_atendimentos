import { useState } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import LoginPage from './pages/LoginPage';
import PrimeiroAcesso from './pages/PrimeiroAcesso';
import GerenciarFuncionarios from './pages/GerenciarFuncionarios';
import LogsAuditoria from './pages/LogsAuditoria';
import GerenciarClinicas from './pages/GerenciarClinicas';
import CadastroPaciente from './components/CadastroPaciente';
import PainelRelatorios from './components/PainelRelatorios';
import MeusRendimentos from './components/MeusRendimentos';
import MeuPerfil from './components/MeuPerfil';
import SolicitacoesAgenda from './components/SolicitacoesAgenda';

function AppContent() {
  const { user, logout, isSuperAdmin, isAdmin, isEmployee } = useAuth();
  
  // default active tab depends on role
  const [activeTab, setActiveTab] = useState(isSuperAdmin ? 'clinicas' : 'cadastro');

  // Not logged in
  if (!user) return <LoginPage />;

  // First access – must set password
  if (user.must_change_password) return <PrimeiroAcesso />;

  let tabs = [];
  if (isSuperAdmin) {
    tabs = [
      { id: 'clinicas', label: '🏥 Clínicas' },
      { id: 'cadastro', label: 'Pacientes' },
      { id: 'funcionarios', label: '👥 Administradores' },
      { id: 'solicitacoes', label: '📩 Solicitações' },
      { id: 'logs', label: '🔍 Logs Globais' },
      { id: 'perfil', label: '👤 Meu Perfil' },
    ];
  } else if (isAdmin) { // Clinic Owner
    tabs = [
      { id: 'cadastro', label: 'Pacientes' },
      { id: 'solicitacoes', label: '📩 Solicitações' },
      { id: 'relatorios', label: 'Relatórios & Financeiro' },
      { id: 'funcionarios', label: '👥 Equipe' },
      { id: 'perfil', label: '👤 Meu Perfil' },
    ];
  } else { // Employee
    tabs = [
      { id: 'cadastro', label: 'Meus Pacientes' },
      { id: 'meus_rendimentos', label: 'Meus Rendimentos' },
      { id: 'perfil', label: '👤 Meu Perfil' },
    ];
  }

  // Ensure active tab is valid for current role
  if (!tabs.find(t => t.id === activeTab)) {
    setActiveTab(tabs[0].id);
  }

  return (
    <div className="min-h-screen bg-[#edf4ff] font-sans flex flex-col">
      {/* Navbar */}
      <nav className="bg-[#0b2344] p-4 shadow-md w-full">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-3">
          <div className="shrink-0 flex items-center gap-3">
            <img src="/logo-evoluir-mm.svg" alt="Evoluir M.M." className="h-11 w-auto object-contain" />
          </div>

          <div className="flex flex-wrap gap-2 items-center justify-center">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-3 py-1.5 rounded-full whitespace-nowrap transition-colors shadow-sm font-medium text-sm
                  ${activeTab === t.id ? 'bg-[#1c4a77] text-white' : 'bg-white/10 text-slate-100 hover:bg-white/20'}`}
              >
                {t.label}
              </button>
            ))}
            <div className="flex items-center gap-2 ml-2 pl-3 border-l border-white/20">
              <div className="text-xs text-slate-200 hidden sm:flex flex-col items-end">
                <span className="font-semibold text-white">{user.full_name}</span>
                {isSuperAdmin && <span className="text-[9px] bg-[#dcecff] text-[#0b2344] rounded px-1 mt-0.5">SUPERADMIN</span>}
                {user.role === 'admin' && <span className="text-[9px] bg-[#dcecff] text-[#0b2344] rounded px-1 mt-0.5">ADMIN</span>}
              </div>
              <button
                onClick={logout}
                className="px-3 py-1.5 text-xs bg-white/10 border border-white/20 rounded-full hover:bg-red-500/20 hover:border-red-400/60 hover:text-red-100 transition-colors font-medium text-white"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main */}
      <main className="flex-1 w-full max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="bg-white rounded-xl shadow-lg p-6 min-h-[400px] border border-lavender/50">
          {activeTab === 'clinicas' && isSuperAdmin && <GerenciarClinicas />}
          
          {activeTab === 'cadastro' && <CadastroPaciente />}
          {activeTab === 'solicitacoes' && (isAdmin || isSuperAdmin) && <SolicitacoesAgenda />}
          {activeTab === 'relatorios' && isAdmin && <PainelRelatorios />}
          {activeTab === 'meus_rendimentos' && isEmployee && <MeusRendimentos />}
          
          { activeTab === 'funcionarios' && (isSuperAdmin || isAdmin) && <GerenciarFuncionarios />}
          { activeTab === 'logs' && isSuperAdmin && <LogsAuditoria />}
          { activeTab === 'perfil' && <MeuPerfil />}
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
