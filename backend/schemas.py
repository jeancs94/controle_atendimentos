from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import date, time, datetime

# --- Auth Schemas ---
class LoginRequest(BaseModel):
    phone: str
    password: str

class SetPasswordRequest(BaseModel):
    phone: str
    new_password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    full_name: str
    role: str
    must_change_password: bool

# --- User Schemas ---
class UserCreate(BaseModel):
    full_name: str
    phone: str
    email: Optional[str] = None

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None

class UserOut(BaseModel):
    id: int
    full_name: str
    phone: str
    email: Optional[str] = None
    role: str
    is_active: bool
    must_change_password: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class UserEarnings(BaseModel):
    user_id: int
    full_name: str
    year: int
    month: int
    total_appointments: int
    total_value: float

# --- Patient Schemas ---
class PatientBase(BaseModel):
    name: str
    created_at: date
    rate: float
    type: str  # 'Avulso' ou 'Pacote Mensal'

class PatientCreate(PatientBase):
    pass

class PatientUpdate(BaseModel):
    name: Optional[str] = None
    created_at: Optional[date] = None
    rate: Optional[float] = None
    type: Optional[str] = None

class Patient(PatientBase):
    id: int
    created_by: Optional[int] = None

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

class AppointmentUpdate(BaseModel):
    patient_id: Optional[int] = None
    date: Optional[date] = None
    time: Optional[time] = None
    observations: Optional[str] = None

class Appointment(AppointmentBase):
    id: int
    created_by: Optional[int] = None
    patient: Optional[Patient] = None

    class Config:
        from_attributes = True

# --- Report Schemas ---
class MonthlyReport(BaseModel):
    total_appointments: int
    total_value: float
    patients: List[dict]

# --- Audit Log Schemas ---
class AuditLogOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    action: str
    resource: str
    resource_id: Optional[int] = None
    detail: Optional[str] = None
    timestamp: datetime

    class Config:
        from_attributes = True
