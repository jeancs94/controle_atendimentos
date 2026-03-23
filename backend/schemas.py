from pydantic import BaseModel
from typing import Optional, List
from datetime import date, time

# --- Patient Schemas ---
class PatientBase(BaseModel):
    name: str
    created_at: date
    rate: float
    type: str # 'Avulso' ou 'Pacote Mensal'

class PatientCreate(PatientBase):
    pass

class Patient(PatientBase):
    id: int

    class Config:
        from_attributes = True

# --- Appointment Schemas ---
class AppointmentBase(BaseModel):
    patient_id: int
    date: date
    time: time
    observations: Optional[str] = None

class AppointmentCreate(AppointmentBase):
    pass

class Appointment(AppointmentBase):
    id: int
    patient: Optional[Patient] = None

    class Config:
        from_attributes = True

class MonthlyReport(BaseModel):
    total_appointments: int
    total_value: float
    patients: List[dict]
