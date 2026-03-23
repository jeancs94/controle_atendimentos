export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export async function createPatient(data) {
    const res = await fetch(`${API_URL}/patients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Erro ao criar paciente');
    return res.json();
}

export async function getPatients() {
    const res = await fetch(`${API_URL}/patients`);
    if (!res.ok) throw new Error('Erro ao buscar pacientes');
    return res.json();
}

export async function updatePatient(id, data) {
    const res = await fetch(`${API_URL}/patients/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Erro ao atualizar paciente');
    return res.json();
}

export async function deletePatient(id) {
    const res = await fetch(`${API_URL}/patients/${id}`, {
        method: 'DELETE'
    });
    if (!res.ok) throw new Error('Erro ao excluir paciente');
    return res.json();
}

export async function createAppointment(data) {
    const res = await fetch(`${API_URL}/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Erro ao registrar atendimento');
    return res.json();
}

export async function getAppointments() {
    const res = await fetch(`${API_URL}/appointments`);
    if (!res.ok) throw new Error('Erro ao buscar atendimentos');
    return res.json();
}

export async function updateAppointment(id, data) {
    const res = await fetch(`${API_URL}/appointments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Erro ao atualizar atendimento');
    return res.json();
}

export async function deleteAppointment(id) {
    const res = await fetch(`${API_URL}/appointments/${id}`, {
        method: 'DELETE'
    });
    if (!res.ok) throw new Error('Erro ao excluir atendimento');
    return res.json();
}

export async function getMonthlyReport(year, month) {
    const res = await fetch(`${API_URL}/reports/monthly?year=${year}&month=${month}`);
    if (!res.ok) throw new Error('Erro ao buscar relatórios');
    return res.json();
}
