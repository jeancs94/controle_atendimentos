from __future__ import annotations
from typing import Optional, List
from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, text
from database import engine, Base, get_db
from auth import hash_password, verify_password, create_access_token
from dependencies import get_current_user, require_superadmin, require_admin, require_employee
import models, schemas
import os
import io
import hashlib
import pandas as pd
from datetime import datetime

# Compatibilidade com OpenSSL 3 para bibliotecas antigas do reportlab.
_original_md5 = hashlib.md5

def _compat_md5(*args, **kwargs):
    kwargs.pop('usedforsecurity', None)
    return _original_md5(*args, **kwargs)

hashlib.md5 = _compat_md5

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER

# Creates the database tables
Base.metadata.create_all(bind=engine)


def ensure_database_schema():
    with engine.begin() as conn:
        table_exists = conn.execute(text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='appointments' LIMIT 1")).fetchone()
        if not table_exists:
            return

        columns = {row[1] for row in conn.execute(text("PRAGMA table_info('appointments')")).fetchall()}

        if 'professional_id' not in columns:
            conn.execute(text("ALTER TABLE appointments ADD COLUMN professional_id INTEGER"))
        if 'type' not in columns:
            conn.execute(text("ALTER TABLE appointments ADD COLUMN type TEXT DEFAULT 'Avulso'"))
        if 'value' not in columns:
            conn.execute(text("ALTER TABLE appointments ADD COLUMN value FLOAT"))
        if 'observations' not in columns:
            conn.execute(text("ALTER TABLE appointments ADD COLUMN observations TEXT"))
        if 'recurring' not in columns:
            conn.execute(text("ALTER TABLE appointments ADD COLUMN recurring BOOLEAN DEFAULT 0"))
        if 'created_by' not in columns:
            conn.execute(text("ALTER TABLE appointments ADD COLUMN created_by INTEGER"))

    with engine.begin() as conn:
        users_exists = conn.execute(text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users' LIMIT 1")).fetchone()
        if users_exists:
            user_columns = {row[1] for row in conn.execute(text("PRAGMA table_info('users')")).fetchall()}
            if 'cargo' not in user_columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN cargo TEXT DEFAULT ''"))

    with engine.begin() as conn:
        patients_exists = conn.execute(text("SELECT 1 FROM sqlite_master WHERE type='table' AND name='patients' LIMIT 1")).fetchone()
        if patients_exists:
            patient_columns = {row[1] for row in conn.execute(text("PRAGMA table_info('patients')")).fetchall()}
            if 'is_aba' not in patient_columns:
                conn.execute(text("ALTER TABLE patients ADD COLUMN is_aba BOOLEAN DEFAULT 0"))


ensure_database_schema()

app = FastAPI(title="Controle de Atendimentos API (Fase 2)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXPORTS_DIR = os.path.join(BASE_DIR, "exports")
if not os.path.exists(EXPORTS_DIR):
    os.makedirs(EXPORTS_DIR)

# ── Helpers ──────────────────────────────────────────────────

def create_audit(db: Session, user_id: int | None, action: str, resource: str,
                 resource_id: int | None = None, detail: str | None = None):
    log = models.AuditLog(
        user_id=user_id,
        action=action,
        resource=resource,
        resource_id=resource_id,
        detail=detail,
    )
    db.add(log)
    db.commit()


def create_default_superadmin(db: Session):
    target_phone = "19993873359"
    existing = db.query(models.User).filter(models.User.role == "superadmin").first()
    
    if existing:
        if existing.phone != target_phone:
            old_phone = existing.phone
            existing.phone = target_phone
            db.commit()
            print(f"✅ Telefone do superadmin atualizado: {old_phone} -> {target_phone}")
    else:
        sa = models.User(
            full_name="Super Administrador",
            phone=target_phone,
            email=None,
            password_hash=hash_password("admin123"),
            role="superadmin",
            is_active=True,
            must_change_password=False,
            clinic_id=None
        )
        db.add(sa)
        db.commit()
        print(f"✅ Usuário superadmin criado: telefone={target_phone}, senha=admin123")


@app.on_event("startup")
def on_startup():
    ensure_database_schema()
    db = next(get_db())
    create_default_superadmin(db)

# ── Health ───────────────────────────────────────────────────

@app.get("/")
def read_root():
    return {"message": "Bem-vindo à API de Controle de Atendimentos (Fase 2)"}


def build_workday_slots():
    from datetime import datetime, time, timedelta

    slots = []
    current = datetime.combine(datetime.today().date(), time(8, 0))
    end = datetime.combine(datetime.today().date(), time(17, 40))

    while current.time() <= end.time():
        if current.hour == 12:
            current = datetime.combine(current.date(), time(13, 0))
            continue
        slots.append(current.time())
        current += timedelta(minutes=40)

    return slots


def is_time_slot_valid(value):
    if value is None:
        return False
    return value in build_workday_slots()


# ── Auth ─────────────────────────────────────────────────────

@app.post("/auth/login", response_model=schemas.TokenResponse)
def login(data: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.phone == data.phone).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas")

    # Employee without password yet → allow login for set-password flow
    if user.must_change_password and user.password_hash is None:
        token = create_access_token({"sub": user.id, "role": user.role})
        create_audit(db, user.id, "LOGIN_FIRST", "user", user.id)
        return schemas.TokenResponse(
            access_token=token,
            user_id=user.id,
            clinic_id=user.clinic_id,
            full_name=user.full_name,
            role=user.role,
            must_change_password=True,
            mfa_required=user.clinic.mfa_required if user.clinic else False
        )

    if not user.password_hash or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas")

    token = create_access_token({"sub": user.id, "role": user.role})
    create_audit(db, user.id, "LOGIN", "user", user.id)
    return schemas.TokenResponse(
        access_token=token,
        user_id=user.id,
        clinic_id=user.clinic_id,
        full_name=user.full_name,
        role=user.role,
        must_change_password=user.must_change_password,
        mfa_required=user.clinic.mfa_required if user.clinic else False
    )


@app.post("/auth/set-password")
def set_password(data: schemas.SetPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.phone == data.phone).first()
    if not user or not user.must_change_password:
        raise HTTPException(status_code=400, detail="Este usuário não precisa redefinir a senha")
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Senha deve ter no mínimo 6 caracteres")

    user.password_hash = hash_password(data.new_password)
    user.must_change_password = False
    db.commit()
    create_audit(db, user.id, "SET_PASSWORD", "user", user.id)
    return {"detail": "Senha definida com sucesso"}


@app.get("/users/me", response_model=schemas.UserOut)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user


@app.put("/users/me", response_model=schemas.UserOut)
def update_me(data: schemas.UserMeUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if data.full_name:
        current_user.full_name = data.full_name
    if data.email:
        current_user.email = data.email
    db.commit()
    db.refresh(current_user)
    create_audit(db, current_user.id, "UPDATE_PROFILE", "user", current_user.id)
    return current_user


@app.post("/auth/change-password")
def change_password(data: schemas.PasswordChangeRequest, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(status_code=401, detail="Senha atual incorreta")
    
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Nova senha deve ter no mínimo 6 caracteres")
    
    current_user.password_hash = hash_password(data.new_password)
    db.commit()
    create_audit(db, current_user.id, "CHANGE_PASSWORD", "user", current_user.id)
    return {"detail": "Senha alterada com sucesso"}


@app.post("/schedule-change-requests", response_model=schemas.ScheduleChangeRequestOut)
def create_schedule_change_request(request: schemas.ScheduleChangeRequestCreate, db: Session = Depends(get_db), current_user: models.User = Depends(require_employee)):
    if len(request.message) > 200:
        raise HTTPException(status_code=400, detail="A mensagem deve ter até 200 caracteres")

    patient = db.query(models.Patient).filter(models.Patient.id == request.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")

    if current_user.role == "admin":
        if patient.clinic_id != current_user.clinic_id:
            raise HTTPException(status_code=403, detail="Acesso negado")
    elif current_user.role == "employee":
        has_assignment = db.query(models.Appointment.id).filter(models.Appointment.patient_id == request.patient_id, models.Appointment.professional_id == current_user.id).first()
        if not has_assignment:
            raise HTTPException(status_code=403, detail="Você não está atribuído a este paciente")

    validate_appointment_rules(request.requested_date, request.requested_time)

    obj = models.ScheduleChangeRequest(
        patient_id=request.patient_id,
        professional_id=current_user.id,
        requested_date=request.requested_date,
        requested_time=request.requested_time,
        message=request.message,
        status="pending",
    )
    db.add(obj)
    db.commit(); db.refresh(obj)
    create_audit(db, current_user.id, "REQUEST_CHANGE", "schedule_change_request", obj.id)
    return obj


@app.get("/schedule-change-requests", response_model=List[schemas.ScheduleChangeRequestOut])
def list_schedule_change_requests(db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    q = db.query(models.ScheduleChangeRequest)
    if current_user.role == "admin":
        q = q.join(models.Patient).filter(models.Patient.clinic_id == current_user.clinic_id)
    return q.order_by(models.ScheduleChangeRequest.created_at.desc()).all()


@app.put("/schedule-change-requests/{request_id}/status")
def update_schedule_change_request_status(request_id: int, status: str, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    req = db.query(models.ScheduleChangeRequest).filter(models.ScheduleChangeRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    if current_user.role == "admin" and req.patient.clinic_id != current_user.clinic_id:
        raise HTTPException(status_code=403, detail="Acesso negado")

    allowed = {"pending", "approved", "rejected"}
    if status not in allowed:
        raise HTTPException(status_code=400, detail="Status inválido")

    req.status = status

    if status == "approved":
        appointment = db.query(models.Appointment).filter(
            models.Appointment.patient_id == req.patient_id,
            models.Appointment.professional_id == req.professional_id,
        ).order_by(models.Appointment.date.desc(), models.Appointment.time.desc()).first()

        if appointment:
            appointment.date = req.requested_date
            appointment.time = req.requested_time
            validate_appointment_rules(appointment.date, appointment.time)
        else:
            patient = db.query(models.Patient).filter(models.Patient.id == req.patient_id).first()
            if patient:
                new_appointment = models.Appointment(
                    clinic_id=patient.clinic_id,
                    patient_id=req.patient_id,
                    professional_id=req.professional_id,
                    date=req.requested_date,
                    time=req.requested_time,
                    type='Avulso',
                    value=patient.rate if patient.rate is not None else 0.0,
                    observations='Atendimento aprovado via solicitação de alteração de horário',
                    created_by=current_user.id,
                )
                db.add(new_appointment)
                validate_appointment_rules(new_appointment.date, new_appointment.time)

    db.commit()
    create_audit(db, current_user.id, "UPDATE", "schedule_change_request", req.id, f"Status atualizado para {status}")
    return {"detail": "Status atualizado"}


# ── Clinics (Superadmin Only) ────────────────────────────────

@app.get("/clinics", response_model=List[schemas.Clinic])
def list_clinics(db: Session = Depends(get_db), current_user: models.User = Depends(require_superadmin)):
    return db.query(models.Clinic).all()


@app.post("/clinics", response_model=schemas.Clinic)
def create_clinic(clinic_in: schemas.ClinicCreate, db: Session = Depends(get_db),
                  current_user: models.User = Depends(require_superadmin)):
    new_clinic = models.Clinic(**clinic_in.dict())
    db.add(new_clinic)
    db.commit()
    db.refresh(new_clinic)
    create_audit(db, current_user.id, "CREATE", "clinic", new_clinic.id, f"Criou clínica {new_clinic.name}")
    return new_clinic


@app.put("/clinics/{clinic_id}", response_model=schemas.Clinic)
def update_clinic(clinic_id: int, clinic_in: schemas.ClinicUpdate, db: Session = Depends(get_db),
                  current_user: models.User = Depends(require_superadmin)):
    clinic = db.query(models.Clinic).filter(models.Clinic.id == clinic_id).first()
    if not clinic:
        raise HTTPException(status_code=404, detail="Clínica não encontrada")
    for k, v in clinic_in.dict(exclude_unset=True).items():
        setattr(clinic, k, v)
    db.commit()
    db.refresh(clinic)
    create_audit(db, current_user.id, "UPDATE", "clinic", clinic.id, "Editou configurações da clínica")
    return clinic


# ── Users ────────────────────────────────────────────────────

@app.get("/users", response_model=List[schemas.UserOut])
def list_users(db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    q = db.query(models.User)
    if current_user.role == "admin":
        q = q.filter(models.User.clinic_id == current_user.clinic_id, models.User.role == "employee")
    return q.all()


@app.post("/users", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED)
def create_user(user_in: schemas.UserCreate, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    existing = db.query(models.User).filter(models.User.phone == user_in.phone).first()
    if existing:
        raise HTTPException(status_code=400, detail="Telefone já cadastrado")

    # Admins can only create employees for their own clinic
    if current_user.role == "admin":
        if user_in.role != "employee":
            raise HTTPException(status_code=403, detail="Admins só podem criar funcionários")
        clinic_id = current_user.clinic_id
        role = "employee"
    else:
        # Superadmin
        clinic_id = user_in.clinic_id
        role = user_in.role

    new_user = models.User(
        full_name=user_in.full_name,
        phone=user_in.phone,
        email=user_in.email,
        cargo=user_in.cargo or '',
        password_hash=None,
        role=role,
        clinic_id=clinic_id,
        is_active=True,
        must_change_password=True,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    create_audit(db, current_user.id, "CREATE", "user", new_user.id, f"Criou {role} {new_user.full_name}")
    return new_user


@app.put("/users/{user_id}", response_model=schemas.UserOut)
def update_user(user_id: int, user_in: schemas.UserUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    if current_user.role == "admin":
        if user.clinic_id != current_user.clinic_id or user.role != "employee":
            raise HTTPException(status_code=403, detail="Acesso negado")
    
    if user.role == "superadmin" and current_user.id != user.id:
        raise HTTPException(status_code=403, detail="Não é possível alterar outro superadmin")

    for k, v in user_in.dict(exclude_unset=True).items():
        if k == "role" and current_user.role != "superadmin":
            continue
        if k == "clinic_id" and current_user.role != "superadmin":
            continue
        setattr(user, k, v)
    
    db.commit()
    db.refresh(user)
    create_audit(db, current_user.id, "UPDATE", "user", user.id)
    return user


@app.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if user.role == "superadmin":
        raise HTTPException(status_code=403, detail="Não é possível excluir o superadmin")
    if current_user.role == "admin":
        if user.clinic_id != current_user.clinic_id or user.role != "employee":
            raise HTTPException(status_code=403, detail="Acesso negado")

    create_audit(db, current_user.id, "DELETE", "user", user.id, f"Excluiu {user.full_name}")
    db.delete(user)
    db.commit()
    return {"detail": "Usuário excluído com sucesso"}


@app.put("/users/{user_id}/reset-password")
def reset_user_password(user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if current_user.role == "admin" and (user.clinic_id != current_user.clinic_id or user.role != "employee"):
        raise HTTPException(status_code=403, detail="Acesso negado")

    user.password_hash = None
    user.must_change_password = True
    db.commit()
    create_audit(db, current_user.id, "RESET_PASSWORD", "user", user.id)
    return {"detail": "Senha resetada."}


# ── Patients ─────────────────────────────────────────────────

@app.post("/patients", response_model=schemas.Patient)
def create_patient(patient: schemas.PatientCreate, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    if current_user.role == "superadmin" and not getattr(patient, "clinic_id", None):
        raise HTTPException(status_code=400, detail="Superadmin precisa especificar a clínica")

    clinic_id = current_user.clinic_id if current_user.role == "admin" else patient.clinic_id
    if not clinic_id:
        raise HTTPException(status_code=400, detail="Usuário não pertence a uma clínica")

    db_patient = models.Patient(**patient.dict(exclude={'clinic_id'}), created_by=current_user.id, clinic_id=clinic_id)
    db.add(db_patient)
    db.commit()
    db.refresh(db_patient)
    create_audit(db, current_user.id, "CREATE", "patient", db_patient.id)
    return db_patient


@app.get("/patients", response_model=List[schemas.Patient])
def read_patients(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(require_employee)):
    q = db.query(models.Patient)
    if current_user.role == "admin":
        q = q.filter(models.Patient.clinic_id == current_user.clinic_id)
    elif current_user.role == "superadmin":
        q = q.filter(models.Patient.clinic_id.is_not(None))
    else:
        assigned = db.query(models.Appointment.patient_id).filter(models.Appointment.professional_id == current_user.id).subquery()
        q = q.filter((models.Patient.created_by == current_user.id) | (models.Patient.id.in_(assigned)))
    return q.offset(skip).limit(limit).all()


@app.get("/patients/{patient_id}", response_model=schemas.Patient)
def read_patient(patient_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_employee)):
    q = db.query(models.Patient).filter(models.Patient.id == patient_id)
    if current_user.role == "admin":
        q = q.filter(models.Patient.clinic_id == current_user.clinic_id)
    elif current_user.role == "superadmin":
        q = q.filter(models.Patient.clinic_id.is_not(None))
    else:
        assigned = db.query(models.Appointment.patient_id).filter(models.Appointment.professional_id == current_user.id).subquery()
        q = q.filter((models.Patient.created_by == current_user.id) | (models.Patient.id.in_(assigned)))
    p = q.first()
    if not p:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    return p


@app.put("/patients/{patient_id}", response_model=schemas.Patient)
def update_patient(patient_id: int, patient_update: schemas.PatientUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    p = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    if current_user.role == "admin" and p.clinic_id != current_user.clinic_id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    if current_user.role == "admin" and patient_update.clinic_id is not None and patient_update.clinic_id != current_user.clinic_id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    for k, v in patient_update.dict(exclude_unset=True).items():
        if k == "clinic_id" and current_user.role == "admin":
            continue
        setattr(p, k, v)
    db.commit(); db.refresh(p)
    create_audit(db, current_user.id, "UPDATE", "patient", p.id)
    return p


@app.delete("/patients/{patient_id}")
def delete_patient(patient_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    p = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    if current_user.role == "admin" and p.clinic_id != current_user.clinic_id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    create_audit(db, current_user.id, "DELETE", "patient", p.id)
    db.delete(p)
    db.commit()
    return {"detail": "Paciente excluído"}


# ── Appointments ─────────────────────────────────────────────

def validate_appointment_rules(date_obj, time_obj):
    from datetime import time

    if date_obj.weekday() >= 5:
        raise HTTPException(status_code=400, detail="Não é possível realizar atendimentos aos fins de semana")
    if not is_time_slot_valid(time_obj):
        raise HTTPException(status_code=400, detail="Horário inválido. Use intervalos de 40 minutos entre 08:00 e 17:40, sem almoço das 12:00 às 13:00.")


def normalize_appointment_update_payload(payload: dict, current_record: models.Appointment | None = None):
    cleaned = {}
    for key, value in payload.items():
        if value is None:
            continue
        if isinstance(value, str):
            stripped = value.strip()
            if stripped == '':
                continue
            if key in {'professional_id', 'patient_id'}:
                try:
                    cleaned[key] = int(stripped)
                except ValueError:
                    raise HTTPException(status_code=400, detail=f"Campo {key} inválido")
                continue
            if key == 'value':
                try:
                    cleaned[key] = float(stripped)
                except ValueError:
                    raise HTTPException(status_code=400, detail="Campo value inválido")
                continue
        cleaned[key] = value

    if current_record is not None:
        for field in ['patient_id', 'professional_id', 'date', 'time', 'observations', 'type', 'value', 'recurring']:
            if field not in cleaned:
                continue
            value = cleaned[field]
            if field == 'professional_id' and value == 0:
                raise HTTPException(status_code=400, detail="Profissional inválido")
            if field == 'value' and value is not None and value < 0:
                raise HTTPException(status_code=400, detail="Valor do atendimento não pode ser negativo")
            if field == 'recurring' and value is not None:
                cleaned[field] = bool(value)

    return cleaned


@app.post("/appointments", response_model=schemas.Appointment)
def create_appointment(appointment: schemas.AppointmentCreate, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    p = db.query(models.Patient).filter(models.Patient.id == appointment.patient_id)
    if current_user.role == "admin":
        p = p.filter(models.Patient.clinic_id == current_user.clinic_id)
    elif current_user.role == "superadmin":
        pass
    else:
        p = p.filter(models.Patient.clinic_id == current_user.clinic_id)
    db_patient = p.first()
    if not db_patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")

    if appointment.professional_id is None:
        raise HTTPException(status_code=400, detail="Selecione um profissional para o atendimento")

    professional = db.query(models.User).filter(models.User.id == appointment.professional_id).first()
    if not professional:
        raise HTTPException(status_code=404, detail="Profissional não encontrado")
    if professional.clinic_id != db_patient.clinic_id and current_user.role == "admin":
        raise HTTPException(status_code=403, detail="Profissional pertence a outra clínica")

    if appointment.value is None:
        raise HTTPException(status_code=400, detail="Informe o valor do atendimento")

    validate_appointment_rules(appointment.date, appointment.time)

    db_appointment = models.Appointment(
        patient_id=appointment.patient_id,
        professional_id=appointment.professional_id,
        date=appointment.date,
        time=appointment.time,
        observations=appointment.observations,
        type=appointment.type,
        value=appointment.value,
        recurring=bool(appointment.recurring),
        created_by=current_user.id,
        clinic_id=db_patient.clinic_id,
    )
    db.add(db_appointment)
    db.commit(); db.refresh(db_appointment)
    create_audit(db, current_user.id, "CREATE", "appointment", db_appointment.id)
    return db_appointment


@app.get("/appointments", response_model=List[schemas.Appointment])
def read_appointments(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(require_employee)):
    q = db.query(models.Appointment)
    if current_user.role == "admin":
        q = q.filter(models.Appointment.clinic_id == current_user.clinic_id)
    elif current_user.role == "superadmin":
        q = q.filter(models.Appointment.clinic_id.is_not(None))
    else:
        q = q.filter((models.Appointment.professional_id == current_user.id) | (models.Appointment.created_by == current_user.id))
    return q.offset(skip).limit(limit).all()


@app.put("/appointments/{appointment_id}", response_model=schemas.Appointment)
def update_appointment(appointment_id: int, appointment_update: schemas.AppointmentUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    appo = db.query(models.Appointment).filter(models.Appointment.id == appointment_id).first()
    if not appo:
        raise HTTPException(status_code=404, detail="Atendimento não encontrado")
    if current_user.role == "admin" and appo.clinic_id != current_user.clinic_id:
        raise HTTPException(status_code=403, detail="Acesso negado")

    payload = normalize_appointment_update_payload(appointment_update.model_dump(exclude_unset=True), appo)
    if not payload:
        raise HTTPException(status_code=400, detail="Nenhum campo foi informado para atualizar o atendimento")

    if 'patient_id' in payload:
        patient = db.query(models.Patient).filter(models.Patient.id == payload['patient_id']).first()
        if not patient:
            raise HTTPException(status_code=404, detail="Paciente não encontrado")
        if current_user.role == "admin" and patient.clinic_id != current_user.clinic_id:
            raise HTTPException(status_code=403, detail="Acesso negado")

    if 'professional_id' in payload and payload['professional_id'] is not None:
        professional = db.query(models.User).filter(models.User.id == payload['professional_id']).first()
        if not professional:
            raise HTTPException(status_code=404, detail="Profissional não encontrado")
        if current_user.role == "admin" and professional.clinic_id != current_user.clinic_id:
            raise HTTPException(status_code=403, detail="Profissional pertence a outra clínica")

    new_date = payload.get('date', appo.date)
    new_time = payload.get('time', appo.time)
    if 'date' in payload or 'time' in payload:
        validate_appointment_rules(new_date, new_time)

    for key, value in payload.items():
        if key == 'recurring':
            setattr(appo, key, bool(value))
        else:
            setattr(appo, key, value)

    db.commit(); db.refresh(appo)
    create_audit(db, current_user.id, "UPDATE", "appointment", appo.id)
    return appo


@app.delete("/appointments/{appointment_id}")
def delete_appointment(appointment_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    appo = db.query(models.Appointment).filter(models.Appointment.id == appointment_id).first()
    if not appo:
        raise HTTPException(status_code=404, detail="Atendimento não encontrado")
    if current_user.role == "admin" and appo.clinic_id != current_user.clinic_id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    create_audit(db, current_user.id, "DELETE", "appointment", appo.id)
    db.delete(appo)
    db.commit()
    return {"detail": "Atendimento excluído com sucesso"}


# ── Payroll & Reports ────────────────────────────────────────

def calc_earnings(user_id: int, year: int, month: int, db: Session) -> tuple[float, int]:
    appointments = db.query(models.Appointment).filter(
        models.Appointment.professional_id == user_id,
        extract('year', models.Appointment.date) == year,
        extract('month', models.Appointment.date) == month,
    ).all()
    total_val = 0.0
    seen = set()
    for appt in appointments:
        p = appt.patient
        if p is None:
            continue
        value = float(appt.value) if appt.value is not None else (float(p.rate) if p.rate is not None else 0.0)
        appointment_type = (appt.type or p.type or 'Avulso').strip()
        if appointment_type == 'Avulso':
            total_val += value
        elif p.id not in seen:
            total_val += value
            seen.add(p.id)
    return total_val, len(appointments)

@app.get("/users/{user_id}/monthly-earnings", response_model=schemas.UserEarnings)
def get_user_monthly_earnings(user_id: int, year: int, month: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_employee)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    # Employee can only see their own. Admin can see their clinic employees
    if current_user.role == "employee" and user.id != current_user.id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    if current_user.role == "admin" and user.clinic_id != current_user.clinic_id:
        raise HTTPException(status_code=403, detail="Acesso negado")

    val, count = calc_earnings(user_id, year, month, db)
    
    # Check if paid
    payroll = db.query(models.Payroll).filter(
        models.Payroll.user_id == user_id,
        models.Payroll.ref_year == year,
        models.Payroll.ref_month == month
    ).first()

    return schemas.UserEarnings(
        user_id=user_id,
        full_name=user.full_name,
        year=year,
        month=month,
        total_appointments=count,
        total_value=val,
        is_paid=True if payroll else False
    )

@app.post("/payrolls", response_model=schemas.PayrollOut)
def pay_employee(payroll: schemas.PayrollCreate, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    # verify user
    user = db.query(models.User).filter(models.User.id == payroll.user_id).first()
    if not user or user.role != "employee":
        raise HTTPException(status_code=400, detail="Funcionário inválido")
    if current_user.role == "admin" and user.clinic_id != current_user.clinic_id:
        raise HTTPException(status_code=403, detail="Pertence a outra clínica")

    # verify not already paid
    existing = db.query(models.Payroll).filter(
        models.Payroll.user_id == payroll.user_id,
        models.Payroll.ref_year == payroll.ref_year,
        models.Payroll.ref_month == payroll.ref_month
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Pagamento já efetuado para o período")

    val, _ = calc_earnings(payroll.user_id, payroll.ref_year, payroll.ref_month, db)
    if val <= 0:
        raise HTTPException(status_code=400, detail="Não há rendimentos para esse período")

    p = models.Payroll(
        clinic_id=user.clinic_id,
        user_id=user.id,
        ref_year=payroll.ref_year,
        ref_month=payroll.ref_month,
        amount=val,
        paid_by=current_user.id
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    create_audit(db, current_user.id, "PAYMENT", "payroll", p.id)
    return p


@app.get("/reports/monthly", response_model=schemas.MonthlyReport)
def get_monthly_report(year: int, month: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    q = db.query(models.Appointment).filter(
        extract('year', models.Appointment.date) == year,
        extract('month', models.Appointment.date) == month
    )
    if current_user.role == "admin":
        q = q.filter(models.Appointment.clinic_id == current_user.clinic_id)
    appointments = q.all()

    total_value = 0.0
    patient_stats = {}
    employee_stats = {}

    for appt in appointments:
        pid = appt.patient_id
        emp_id = appt.professional_id
        p = appt.patient
        if p is None:
            continue

        value = float(appt.value) if appt.value is not None else (float(p.rate) if p.rate is not None else 0.0)
        appt_type = (appt.type or p.type or 'Avulso').strip()

        if pid not in patient_stats:
            patient_stats[pid] = {"id": p.id, "name": p.name, "type": appt_type, "rate": p.rate, "session_count": 0, "total_value": 0.0, "seen_monthly_pats": set()}

        patient_stats[pid]["session_count"] += 1
        if appt_type == 'Pacote Mensal':
            if p.id not in patient_stats[pid]["seen_monthly_pats"]:
                patient_stats[pid]["total_value"] += value
                patient_stats[pid]["seen_monthly_pats"].add(p.id)
                total_value += value
        else:
            patient_stats[pid]["total_value"] += value
            total_value += value

        if emp_id is None:
            continue
        emp = appt.professional
        if emp_id not in employee_stats:
            employee_stats[emp_id] = {"user_id": emp_id, "full_name": emp.full_name if emp else "—", "total_appointments": 0, "total_value": 0.0, "seen_monthly_pats": set()}

        employee_stats[emp_id]["total_appointments"] += 1
        if appt_type == 'Avulso':
            employee_stats[emp_id]["total_value"] += value
        elif p.id not in employee_stats[emp_id]["seen_monthly_pats"]:
            employee_stats[emp_id]["total_value"] += value
            employee_stats[emp_id]["seen_monthly_pats"].add(p.id)

    emps_clean = []
    for k, v in employee_stats.items():
        pr = db.query(models.Payroll).filter(models.Payroll.user_id == k, models.Payroll.ref_year == year, models.Payroll.ref_month == month).first()
        emps_clean.append({
            "user_id": v["user_id"],
            "full_name": v["full_name"],
            "total_appointments": v["total_appointments"],
            "total_value": v["total_value"],
            "is_paid": bool(pr)
        })

    return {
        "total_appointments": len(appointments),
        "total_value": total_value,
        "patients": list(patient_stats.values()),
        "employees": emps_clean,
    }


def _export_rows_for_report(db: Session, current_user: models.User, user_id: int | None = None, year: int | None = None, month: int | None = None):
    q = db.query(models.Appointment)
    if current_user.role == "admin":
        q = q.filter(models.Appointment.clinic_id == current_user.clinic_id)
    if user_id is not None:
        q = q.filter(models.Appointment.professional_id == user_id)
    if year is not None:
        q = q.filter(extract('year', models.Appointment.date) == year)
    if month is not None:
        q = q.filter(extract('month', models.Appointment.date) == month)

    rows = []
    for appt in q.order_by(models.Appointment.date.asc(), models.Appointment.time.asc()).all():
        patient = appt.patient
        professional = appt.professional
        appt_type = (appt.type or (patient.type if patient else None) or 'Avulso').strip()
        rows.append({
            "data": appt.date.isoformat() if appt.date else '',
            "hora": appt.time.isoformat() if appt.time else '',
            "paciente": patient.name if patient else '-',
            "profissional": professional.full_name if professional else '-',
            "tipo": appt_type,
            "valor": float(appt.value) if appt.value is not None else (float(patient.rate) if patient and patient.rate is not None else 0.0),
            "recorrente": 'Sim' if appt.recurring else 'Não',
            "observacoes": appt.observations or '',
            "criador": appt.created_by_user.full_name if appt.created_by_user else '-',
        })
    return rows


@app.get("/export/excel")
def export_excel(user_id: Optional[int] = Query(default=None), year: Optional[int] = Query(default=None), month: Optional[int] = Query(default=None), db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    rows = _export_rows_for_report(db, current_user, user_id=user_id, year=year, month=month)
    frame = pd.DataFrame(rows, columns=['data', 'hora', 'paciente', 'profissional', 'tipo', 'valor', 'recorrente', 'observacoes', 'criador'])
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
        frame.to_excel(writer, index=False, sheet_name='Atendimentos')
    buffer.seek(0)
    return StreamingResponse(buffer, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers={'Content-Disposition': 'attachment; filename="relatorio_atendimentos.xlsx"'})


@app.get("/export/pdf")
def export_pdf(user_id: Optional[int] = Query(default=None), year: Optional[int] = Query(default=None), month: Optional[int] = Query(default=None), db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    rows = _export_rows_for_report(db, current_user, user_id=user_id, year=year, month=month)
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, title='Relatório de Atendimentos')
    styles = getSampleStyleSheet()
    elements = [Paragraph('Relatório de Atendimentos', styles['Title']), Spacer(1, 0.5 * cm)]
    data = [['Data', 'Hora', 'Paciente', 'Profissional', 'Tipo', 'Valor', 'Recorrente']]
    for row in rows:
        data.append([
            row['data'],
            row['hora'],
            row['paciente'],
            row['profissional'],
            row['tipo'],
            f"R$ {float(row['valor']):.2f}",
            row['recorrente'],
        ])
    table = Table(data, colWidths=[2.1 * cm, 1.7 * cm, 3.8 * cm, 3.2 * cm, 2.0 * cm, 2.0 * cm, 2.0 * cm])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F4D5E8')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('ALIGN', (4, 1), (4, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    elements.append(table)
    doc.build(elements)
    buffer.seek(0)
    return StreamingResponse(buffer, media_type='application/pdf', headers={'Content-Disposition': 'attachment; filename="relatorio_atendimentos.pdf"'})


# ── Audit & Exports ──────────────────────────────────────────

@app.get("/audit-logs", response_model=List[schemas.AuditLogOut])
def get_audit_logs(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(require_superadmin)):
    return db.query(models.AuditLog).order_by(models.AuditLog.timestamp.desc()).offset(skip).limit(limit).all()


def _build_export_query(db: Session, current_user, user_id: Optional[int], year: Optional[int], month: Optional[int]):
    """Builds the appointment query for exports, respecting access rules."""
    q = db.query(models.Appointment)

    if current_user.role == "admin":
        q = q.filter(models.Appointment.clinic_id == current_user.clinic_id)
        if user_id:
            q = q.filter(models.Appointment.created_by == user_id)
    elif current_user.role == "employee":
        q = q.filter(models.Appointment.created_by == current_user.id)
    # superadmin: no clinic filter, can optionally filter by user_id
    elif user_id:
        q = q.filter(models.Appointment.created_by == user_id)

    if year:
        q = q.filter(extract('year', models.Appointment.date) == year)
    if month:
        q = q.filter(extract('month', models.Appointment.date) == month)

    return q.order_by(models.Appointment.date, models.Appointment.time).all()


@app.get("/export/excel")
def export_excel(
    user_id: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_employee),
):
    appointments = _build_export_query(db, current_user, user_id, year, month)

    rows = []
    emp_summary: dict = {}

    for appt in appointments:
        patient = appt.patient
        employee = appt.created_by_user
        eid = appt.created_by
        rows.append({
            "Data": appt.date.strftime("%d/%m/%Y") if appt.date else "",
            "Horário": appt.time.strftime("%H:%M") if appt.time else "",
            "Paciente": patient.name if patient else "",
            "Tipo": patient.type if patient else "",
            "Valor (R$)": patient.rate if patient else 0.0,
            "Funcionário": employee.full_name if employee else "",
            "Observações": appt.observations or "",
        })
        if eid not in emp_summary:
            emp_summary[eid] = {"Funcionário": employee.full_name if employee else "—",
                                "Total de Atendimentos": 0, "Total de Rendimentos (R$)": 0.0, "_seen": set()}
        emp_summary[eid]["Total de Atendimentos"] += 1
        if patient:
            if patient.type == "Avulso":
                emp_summary[eid]["Total de Rendimentos (R$)"] += patient.rate
            elif patient.id not in emp_summary[eid]["_seen"]:
                emp_summary[eid]["Total de Rendimentos (R$)"] += patient.rate
                emp_summary[eid]["_seen"].add(patient.id)

    summary_rows = [{"Funcionário": v["Funcionário"], "Total de Atendimentos": v["Total de Atendimentos"],
                     "Total de Rendimentos (R$)": round(v["Total de Rendimentos (R$)"], 2)}
                    for v in emp_summary.values()]

    suffix = f"_func{user_id}" if user_id else ""
    filename = f"relatorio_{year or 'todos'}_{month or 'todos'}{suffix}.xlsx"
    filepath = os.path.join(EXPORTS_DIR, filename)

    with pd.ExcelWriter(filepath, engine="openpyxl") as writer:
        pd.DataFrame(rows).to_excel(writer, sheet_name="Atendimentos", index=False)
        if summary_rows:
            df_sum = pd.DataFrame(summary_rows)
            total_row = pd.DataFrame([{"Funcionário": "TOTAL",
                                        "Total de Atendimentos": df_sum["Total de Atendimentos"].sum(),
                                        "Total de Rendimentos (R$)": round(df_sum["Total de Rendimentos (R$)"].sum(), 2)}])
            pd.concat([df_sum, total_row], ignore_index=True).to_excel(
                writer, sheet_name="Resumo por Funcionário", index=False)

    create_audit(db, current_user.id, "EXPORT_EXCEL", "appointment", detail=f"Exportou Excel: {filename}")
    return FileResponse(
        filepath,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename,
    )


@app.get("/export/pdf")
def export_pdf(
    user_id: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_employee),
):
    from calendar import month_name as _month_name
    appointments = _build_export_query(db, current_user, user_id, year, month)

    # ── Per-employee summary ───────────────────────────────────
    emp_summary: dict = {}
    for appt in appointments:
        patient = appt.patient
        employee = appt.created_by_user
        eid = appt.created_by
        if eid not in emp_summary:
            emp_summary[eid] = {"name": employee.full_name if employee else "—",
                                "count": 0, "total": 0.0, "_seen": set()}
        emp_summary[eid]["count"] += 1
        if patient:
            if patient.type == "Avulso":
                emp_summary[eid]["total"] += patient.rate
            elif patient.id not in emp_summary[eid]["_seen"]:
                emp_summary[eid]["total"] += patient.rate
                emp_summary[eid]["_seen"].add(patient.id)

    grand_total_val = sum(v["total"] for v in emp_summary.values())
    grand_total_appts = len(appointments)

    def fmt_brl(v: float) -> str:
        return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

    # ── PDF setup ──────────────────────────────────────────────
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4,
                            leftMargin=1.5*cm, rightMargin=1.5*cm,
                            topMargin=1.5*cm, bottomMargin=1.5*cm)
    styles = getSampleStyleSheet()
    PURPLE = colors.HexColor("#7B5EA7")
    LIGHT_PURPLE = colors.HexColor("#F3ECFC")
    PURPLE_BORDER = colors.HexColor("#CCBBEE")
    title_style = ParagraphStyle("title_", parent=styles["Heading1"], alignment=TA_CENTER,
                                  fontSize=15, textColor=PURPLE, spaceAfter=4)
    subtitle_style = ParagraphStyle("sub_", parent=styles["Normal"], alignment=TA_CENTER,
                                     fontSize=10, textColor=colors.HexColor("#555555"), spaceAfter=2)
    section_style = ParagraphStyle("sec_", parent=styles["Heading2"], fontSize=11,
                                    textColor=PURPLE, spaceBefore=10, spaceAfter=4)

    # ── Resolve helpers ────────────────────────────────────────
    clinic = None
    if current_user.clinic_id:
        clinic = db.query(models.Clinic).filter(models.Clinic.id == current_user.clinic_id).first()

    period_label = ""
    if year and month:
        try:
            period_label = f"{_month_name[month]} / {year}"
        except Exception:
            period_label = f"{month}/{year}"
    elif year:
        period_label = str(year)

    filtered_emp_name = None
    if user_id:
        target_user = db.query(models.User).filter(models.User.id == user_id).first()
        if target_user:
            filtered_emp_name = target_user.full_name

    elements = []

    # ── Header ─────────────────────────────────────────────────
    elements.append(Paragraph(clinic.name if clinic else "Relatório de Atendimentos", title_style))
    if filtered_emp_name:
        elements.append(Paragraph(f"Funcionário: {filtered_emp_name}", subtitle_style))
    if period_label:
        elements.append(Paragraph(f"Período: {period_label}", subtitle_style))
    elements.append(Spacer(1, 0.3*cm))

    # ── Grand-totals box ───────────────────────────────────────
    totals_table = Table(
        [["Total de Atendimentos", "Total de Rendimentos"],
         [str(grand_total_appts), fmt_brl(grand_total_val)]],
        colWidths=[9*cm, 9*cm])
    totals_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PURPLE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 10),
        ("BACKGROUND", (0, 1), (-1, 1), LIGHT_PURPLE),
        ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 1), (-1, 1), 14),
        ("TEXTCOLOR", (0, 1), (-1, 1), PURPLE),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("GRID", (0, 0), (-1, -1), 0.5, PURPLE_BORDER),
    ]))
    elements.append(totals_table)
    elements.append(Spacer(1, 0.4*cm))

    # ── Per-employee summary (multi-employee only) ─────────────
    if len(emp_summary) > 1:
        elements.append(Paragraph("Resumo por Funcionário", section_style))
        emp_rows = [["Funcionário", "Atendimentos", "Total a Pagar"]]
        for info in emp_summary.values():
            emp_rows.append([info["name"], str(info["count"]), fmt_brl(info["total"])])
        emp_rows.append(["TOTAL GERAL", str(grand_total_appts), fmt_brl(grand_total_val)])
        last = len(emp_rows) - 1
        emp_tbl = Table(emp_rows, colWidths=[8*cm, 4*cm, 6*cm], repeatRows=1)
        emp_tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), PURPLE),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("ROWBACKGROUNDS", (0, 1), (-1, last - 1), [colors.white, LIGHT_PURPLE]),
            ("BACKGROUND", (0, last), (-1, last), colors.HexColor("#EDE0FF")),
            ("FONTNAME", (0, last), (-1, last), "Helvetica-Bold"),
            ("TEXTCOLOR", (0, last), (-1, last), PURPLE),
            ("GRID", (0, 0), (-1, -1), 0.4, PURPLE_BORDER),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        elements.append(emp_tbl)
        elements.append(Spacer(1, 0.5*cm))

    # ── Appointment detail table ───────────────────────────────
    elements.append(Paragraph("Detalhamento de Atendimentos", section_style))
    if not appointments:
        elements.append(Paragraph("Nenhum atendimento encontrado para o período.", styles["Normal"]))
    else:
        show_emp_col = not filtered_emp_name
        if show_emp_col:
            header = ["Data", "Horário", "Paciente", "Tipo", "Valor (R$)", "Funcionário"]
            col_widths = [2.5*cm, 2*cm, 5*cm, 3*cm, 2.5*cm, 4*cm]
        else:
            header = ["Data", "Horário", "Paciente", "Tipo", "Valor (R$)", "Observações"]
            col_widths = [2.5*cm, 2*cm, 5*cm, 3*cm, 2.5*cm, 4*cm]
        data = [header]
        for appt in appointments:
            patient = appt.patient
            employee = appt.created_by_user
            rate_str = fmt_brl(patient.rate) if patient else "-"
            last_col = (employee.full_name if employee else "") if show_emp_col else (appt.observations or "")
            data.append([
                appt.date.strftime("%d/%m/%Y") if appt.date else "",
                appt.time.strftime("%H:%M") if appt.time else "",
                patient.name if patient else "",
                patient.type if patient else "",
                rate_str,
                last_col,
            ])
        detail_tbl = Table(data, colWidths=col_widths, repeatRows=1)
        detail_tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), PURPLE),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("FONTSIZE", (0, 1), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_PURPLE]),
            ("GRID", (0, 0), (-1, -1), 0.4, PURPLE_BORDER),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(detail_tbl)

    doc.build(elements)
    buffer.seek(0)

    suffix = f"_func{user_id}" if user_id else ""
    filename = f"relatorio_{year or 'todos'}_{month or 'todos'}{suffix}.pdf"
    create_audit(db, current_user.id, "EXPORT_PDF", "appointment", detail=f"Exportou PDF: {filename}")
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

