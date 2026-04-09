export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function getToken() {
  return localStorage.getItem('auth_token');
}

async function authFetch(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    // Session expired – clear storage and reload to go to login
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    window.location.reload();
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  return res;
}

// ---------- Patients ----------
export async function createPatient(data) {
  const res = await authFetch(`${API_URL}/patients`, {
    method: 'POST', body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erro ao criar paciente');
  return res.json();
}

export async function getPatients() {
  const res = await authFetch(`${API_URL}/patients`);
  if (!res.ok) throw new Error('Erro ao buscar pacientes');
  return res.json();
}

export async function updatePatient(id, data) {
  const res = await authFetch(`${API_URL}/patients/${id}`, {
    method: 'PUT', body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erro ao atualizar paciente');
  return res.json();
}

export async function deletePatient(id) {
  const res = await authFetch(`${API_URL}/patients/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Erro ao excluir paciente');
  return res.json();
}

// ---------- Appointments ----------
export async function createAppointment(data) {
  const res = await authFetch(`${API_URL}/appointments`, {
    method: 'POST', body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erro ao registrar atendimento');
  return res.json();
}

export async function getAppointments() {
  const res = await authFetch(`${API_URL}/appointments`);
  if (!res.ok) throw new Error('Erro ao buscar atendimentos');
  return res.json();
}

export async function updateAppointment(id, data) {
  const res = await authFetch(`${API_URL}/appointments/${id}`, {
    method: 'PUT', body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erro ao atualizar atendimento');
  return res.json();
}

export async function deleteAppointment(id) {
  const res = await authFetch(`${API_URL}/appointments/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Erro ao excluir atendimento');
  return res.json();
}

// ---------- Reports ----------
export async function getMonthlyReport(year, month) {
  const res = await authFetch(`${API_URL}/reports/monthly?year=${year}&month=${month}`);
  if (!res.ok) throw new Error('Erro ao buscar relatórios');
  return res.json();
}

export async function getExportUrl() {
  return `${API_URL}/export/excel`;
}

export async function exportExcel() {
  const token = getToken();
  const res = await fetch(`${API_URL}/export/excel`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Erro ao exportar');
  return res.blob();
}

export async function exportExcelFiltered({ userId, year, month } = {}) {
  const params = new URLSearchParams();
  if (userId) params.set('user_id', userId);
  if (year) params.set('year', year);
  if (month) params.set('month', month);
  const token = getToken();
  const res = await fetch(`${API_URL}/export/excel?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Erro ao exportar Excel');
  return res.blob();
}

export async function exportPDF({ userId, year, month } = {}) {
  const params = new URLSearchParams();
  if (userId) params.set('user_id', userId);
  if (year) params.set('year', year);
  if (month) params.set('month', month);
  const token = getToken();
  const res = await fetch(`${API_URL}/export/pdf?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Erro ao exportar PDF');
  return res.blob();
}

export async function getAuditLogs(skip = 0, limit = 100) {
  const res = await authFetch(`${API_URL}/audit-logs?skip=${skip}&limit=${limit}`);
  if (!res.ok) throw new Error('Erro ao buscar logs');
  return res.json();
}

// ---------- Users (Master only) ----------
export async function getUsers() {
  const res = await authFetch(`${API_URL}/users`);
  if (!res.ok) throw new Error('Erro ao buscar usuários');
  return res.json();
}

export async function createUser(data) {
  const res = await authFetch(`${API_URL}/users`, {
    method: 'POST', body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erro ao criar usuário');
  }
  return res.json();
}

export async function updateUser(id, data) {
  const res = await authFetch(`${API_URL}/users/${id}`, {
    method: 'PUT', body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erro ao atualizar usuário');
  return res.json();
}

export async function deleteUser(id) {
  const res = await authFetch(`${API_URL}/users/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Erro ao excluir usuário');
  return res.json();
}

export async function resetUserPassword(id) {
  const res = await authFetch(`${API_URL}/users/${id}/reset-password`, { method: 'PUT' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erro ao resetar senha');
  }
  return res.json();
}

export async function getUserEarnings(userId, year, month) {
  const res = await authFetch(`${API_URL}/users/${userId}/monthly-earnings?year=${year}&month=${month}`);
  if (!res.ok) throw new Error('Erro ao buscar ganhos');
  return res.json();
}

// ---------- Auth ----------
export async function setPassword(phone, newPassword) {
  const res = await fetch(`${API_URL}/auth/set-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, new_password: newPassword }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erro ao definir senha');
  }
  return res.json();
}

// ---------- Clinics (Superadmin only) ----------
export async function getClinics() {
  const res = await authFetch(`${API_URL}/clinics`);
  if (!res.ok) throw new Error('Erro ao buscar clínicas');
  return res.json();
}

export async function createClinic(data) {
  const res = await authFetch(`${API_URL}/clinics`, {
    method: 'POST', body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erro ao criar clínica');
  return res.json();
}

export async function updateClinic(id, data) {
  const res = await authFetch(`${API_URL}/clinics/${id}`, {
    method: 'PUT', body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erro ao atualizar clínica');
  return res.json();
}

// ---------- Payroll ----------
export async function payEmployee(data) {
  const res = await authFetch(`${API_URL}/payrolls`, {
    method: 'POST', body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erro ao efetuar pagamento');
  }
  return res.json();
}
