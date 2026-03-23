# Controle de Atendimentos

Aplicação web completa para controle de atendimentos (terapeutas, psicólogas, fisioterapeutas etc). Focada em simplicidade, usabilidade e agilidade no fechamento de mês.

## Tecnologias

- **Backend**: Python + FastAPI + SQLite + SQLAlchemy
- **Frontend**: React (Vite) + Tailwind CSS

## Como Rodar Localmente

### Backend

1. Abra um terminal na pasta do projeto e navegue até a pasta `backend`:
   ```bash
   cd backend
   ```
2. Crie e ative um ambiente virtual:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```
3. Instale as dependências:
   ```bash
   pip install -r requirements.txt
   ```
4. Inicie o servidor:
   ```bash
   uvicorn main:app --reload
   ```
O backend ficará disponível em `http://localhost:8000`.

### Frontend

Requer Node.js (preferencialmente v18 ou superior).

1. Abra um terminal na pasta raíz e navegue para `frontend`:
   ```bash
   cd frontend
   ```
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Inicie a aplicação:
   ```bash
   npm run dev
   ```
A aplicação abrirá no seu navegador, geralmente em `http://localhost:5173`. Para que ela possa se comunicar com a API localmente, tenha o backend rodando.

## Deploy no Render.com

Para realizar o deploy no portal do Render (render.com):

1. **Repositório via GitHub**: Suba este código para um repositório no Github.
2. **Backend (Web Service)**:
   - Cadastre um **New Web Service**.
   - Conecte seu repositório.
   - Configure o **Build Command**: `cd backend && pip install -r requirements.txt`
   - Configure o **Start Command**: `cd backend && uvicorn main:app --host 0.0.0.0 --port 10000`
   - Salve. Anote a URL que será gerada.
   
3. **Frontend (Static Site)**:
   - Cadastre um **New Static Site**.
   - Conecte seu repositório.
   - Configure o **Build Command**: `cd frontend && npm install && npm run build`
   - Configure o **Publish Directory**: `frontend/dist`
   - Em Configurações Avançadas (Advanced), adicione uma variável de ambiente chamada `VITE_API_URL` com o valor da URL do Backend anotado na etapa anterior (ex: `https://seu-backend.onrender.com`).
   - Salve.

Pronto, seu painel de controle está online!
