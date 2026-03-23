import { useState } from 'react';
import CadastroPaciente from './components/CadastroPaciente';
import RegistroAtendimento from './components/RegistroAtendimento';
import PainelRelatorios from './components/PainelRelatorios';

function App() {
  const [activeTab, setActiveTab] = useState('cadastro');

  return (
    <div className="min-h-screen bg-beige font-sans flex flex-col">
      {/* Navbar */}
      <nav className="bg-pink-light p-4 shadow-md w-full">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row justify-between items-center text-gray-800">
          <h1 className="text-2xl font-bold mb-4 sm:mb-0 logo-text tracking-tight">Agendamentos Clínica</h1>
          <div className="flex space-x-2 overflow-x-auto pb-2 sm:pb-0 w-full sm:w-auto">
            <button onClick={() => setActiveTab('cadastro')} className={`px-4 py-2 rounded-full whitespace-nowrap transition-colors shadow-sm font-medium ${activeTab === 'cadastro' ? 'bg-pink-dark text-white' : 'bg-white hover:bg-lavender'} `}>
              Cadastro
            </button>
            <button onClick={() => setActiveTab('atendimentos')} className={`px-4 py-2 rounded-full whitespace-nowrap transition-colors shadow-sm font-medium ${activeTab === 'atendimentos' ? 'bg-pink-dark text-white' : 'bg-white hover:bg-lavender'} `}>
              Agendar
            </button>
            <button onClick={() => setActiveTab('relatorios')} className={`px-4 py-2 rounded-full whitespace-nowrap transition-colors shadow-sm font-medium ${activeTab === 'relatorios' ? 'bg-pink-dark text-white' : 'bg-white hover:bg-lavender'} `}>
              Relatórios
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="bg-white rounded-xl shadow-lg p-6 min-h-[400px] border border-lavender/50">
          {activeTab === 'cadastro' && <CadastroPaciente />}
          {activeTab === 'atendimentos' && <RegistroAtendimento />}
          {activeTab === 'relatorios' && <PainelRelatorios />}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-lavender p-4 text-center text-sm font-medium text-gray-600 mt-auto border-t border-purple-200">
        Controle de Atendimentos © {new Date().getFullYear()}
      </footer>
    </div>
  )
}

export default App
