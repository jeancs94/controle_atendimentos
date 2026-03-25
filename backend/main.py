from __future__ import annotations
from typing import Optional
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from database import engine, Base, get_db
from auth import hash_password, verify_password, create_access_token
from dependencies import get_current_user, require_master, require_employee
import models, schemas
import os
import pandas as pd
from datetime import datetime

# Creates the database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Controle de Atendimentos API")

# Setup CORS for the frontend
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


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

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


def create_default_master(db: Session):
    """Create a default master user if none exists."""
    existing = db.query(models.User).filter(models.User.role == "master").first()
    if not existing:
        master = models.User(
            full_name="Administrador",
            phone="11999999999",
            email=None,
            password_hash=hash_password("admin123"),
            role="master",
            is_active=True,
            must_change_password=False,
        )
        db.add(master)
        db.commit()
        print("✅ Usuário master padrão criado: telefone=11999999999, senha=admin123")


@app.on_event("startup")
def on_startup():
    db = next(get_db())
    create_default_master(db)


# ─────────────────────────────────────────────────────────────
# Health
# ─────────────────────────────────────────────────────────────

@app.get("/")
def read_root():
    return {"message": "Bem-vindo à API de Controle de Atendimentos"}


# ─────────────────────────────────────────────────────────────
# Auth
# ─────────────────────────────────────────────────────────────

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
            full_name=user.full_name,
            role=user.role,
            must_change_password=True,
        )

    if not user.password_hash or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas")

    token = create_access_token({"sub": user.id, "role": user.role})
    create_audit(db, user.id, "LOGIN", "user", user.id)
    return schemas.TokenResponse(
        access_token=token,
        user_id=user.id,
        full_name=user.full_name,
        role=user.role,
        must_change_password=user.must_change_password,
    )


@app.post("/auth/set-password")
def set_password(data: schemas.SetPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.phone == data.phone).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if not user.must_change_password:
        raise HTTPException(status_code=400, detail="Este usuário não precisa redefinir a senha")
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Senha deve ter no mínimo 6 caracteres")

    user.password_hash = hash_password(data.new_password)
    user.must_change_password = False
    db.commit()
    create_audit(db, user.id, "SET_PASSWORD", "user", user.id)
    return {"detail": "Senha definida com sucesso"}


# ─────────────────────────────────────────────────────────────
# Users (Master only)
# ─────────────────────────────────────────────────────────────

@app.get("/users", response_model=list[schemas.UserOut])
def list_users(db: Session = Depends(get_db), current_user: models.User = Depends(require_master)):
    return db.query(models.User).filter(models.User.role == "employee").all()


@app.post("/users", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED)
def create_user(user_in: schemas.UserCreate, db: Session = Depends(get_db),
                current_user: models.User = Depends(require_master)):
    existing = db.query(models.User).filter(models.User.phone == user_in.phone).first()
    if existing:
        raise HTTPException(status_code=400, detail="Telefone já cadastrado")

    new_user = models.User(
        full_name=user_in.full_name,
        phone=user_in.phone,
        email=user_in.email,
        password_hash=None,
        role="employee",
        is_active=True,
        must_change_password=True,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    create_audit(db, current_user.id, "CREATE", "user", new_user.id,
                 f"Criou funcionário {new_user.full_name}")
    return new_user


@app.put("/users/{user_id}", response_model=schemas.UserOut)
def update_user(user_id: int, user_in: schemas.UserUpdate, db: Session = Depends(get_db),
                current_user: models.User = Depends(require_master)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if user.role == "master":
        raise HTTPException(status_code=403, detail="Não é possível editar o master")

    for key, value in user_in.dict(exclude_unset=True).items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    create_audit(db, current_user.id, "UPDATE", "user", user.id,
                 f"Editou funcionário {user.full_name}")
    return user


@app.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db),
                current_user: models.User = Depends(require_master)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if user.role == "master":
        raise HTTPException(status_code=403, detail="Não é possível excluir o master")

    create_audit(db, current_user.id, "DELETE", "user", user.id,
                 f"Excluiu funcionário {user.full_name}")
    db.delete(user)
    db.commit()
    return {"detail": "Funcionário excluído com sucesso"}


@app.get("/users/{user_id}/monthly-earnings", response_model=schemas.UserEarnings)
def get_user_monthly_earnings(user_id: int, year: int, month: int,
                               db: Session = Depends(get_db),
                               current_user: models.User = Depends(require_master)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    appointments = db.query(models.Appointment).filter(
        models.Appointment.created_by == user_id,
        extract('year', models.Appointment.date) == year,
        extract('month', models.Appointment.date) == month,
    ).all()

    total_value = 0.0
    seen_monthly_patients = set()
    for appt in appointments:
        p = appt.patient
        if p.type == 'Avulso':
            total_value += p.rate
        elif p.id not in seen_monthly_patients:
            total_value += p.rate
            seen_monthly_patients.add(p.id)

    return schemas.UserEarnings(
        user_id=user_id,
        full_name=user.full_name,
        year=year,
        month=month,
        total_appointments=len(appointments),
        total_value=total_value,
    )


# ─────────────────────────────────────────────────────────────
# Patients
# ─────────────────────────────────────────────────────────────

@app.post("/patients", response_model=schemas.Patient)
def create_patient(patient: schemas.PatientCreate, db: Session = Depends(get_db),
                   current_user: models.User = Depends(require_employee)):
    db_patient = models.Patient(**patient.dict(), created_by=current_user.id)
    db.add(db_patient)
    db.commit()
    db.refresh(db_patient)
    create_audit(db, current_user.id, "CREATE", "patient", db_patient.id,
                 f"Cadastrou paciente {db_patient.name}")
    return db_patient


@app.get("/patients", response_model=list[schemas.Patient])
def read_patients(skip: int = 0, limit: int = 100, db: Session = Depends(get_db),
                  current_user: models.User = Depends(require_employee)):
    q = db.query(models.Patient)
    if current_user.role != "master":
        q = q.filter(models.Patient.created_by == current_user.id)
    return q.offset(skip).limit(limit).all()


@app.get("/patients/{patient_id}", response_model=schemas.Patient)
def read_patient(patient_id: int, db: Session = Depends(get_db),
                 current_user: models.User = Depends(require_employee)):
    q = db.query(models.Patient).filter(models.Patient.id == patient_id)
    if current_user.role != "master":
        q = q.filter(models.Patient.created_by == current_user.id)
    db_patient = q.first()
    if db_patient is None:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    return db_patient


@app.put("/patients/{patient_id}", response_model=schemas.Patient)
def update_patient(patient_id: int, patient_update: schemas.PatientUpdate,
                   db: Session = Depends(get_db),
                   current_user: models.User = Depends(require_employee)):
    q = db.query(models.Patient).filter(models.Patient.id == patient_id)
    if current_user.role != "master":
        q = q.filter(models.Patient.created_by == current_user.id)
    db_patient = q.first()
    if db_patient is None:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")

    for key, value in patient_update.dict(exclude_unset=True).items():
        setattr(db_patient, key, value)
    db.commit()
    db.refresh(db_patient)
    create_audit(db, current_user.id, "UPDATE", "patient", db_patient.id,
                 f"Editou paciente {db_patient.name}")
    return db_patient


@app.delete("/patients/{patient_id}")
def delete_patient(patient_id: int, db: Session = Depends(get_db),
                   current_user: models.User = Depends(require_employee)):
    q = db.query(models.Patient).filter(models.Patient.id == patient_id)
    if current_user.role != "master":
        q = q.filter(models.Patient.created_by == current_user.id)
    db_patient = q.first()
    if db_patient is None:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")

    create_audit(db, current_user.id, "DELETE", "patient", db_patient.id,
                 f"Excluiu paciente {db_patient.name}")
    db.delete(db_patient)
    db.commit()
    return {"detail": "Paciente excluído com sucesso"}


# ─────────────────────────────────────────────────────────────
# Appointments
# ─────────────────────────────────────────────────────────────

@app.post("/appointments", response_model=schemas.Appointment)
def create_appointment(appointment: schemas.AppointmentCreate, db: Session = Depends(get_db),
                       current_user: models.User = Depends(require_employee)):
    # Validate patient belongs to the employee (or master)
    q = db.query(models.Patient).filter(models.Patient.id == appointment.patient_id)
    if current_user.role != "master":
        q = q.filter(models.Patient.created_by == current_user.id)
    db_patient = q.first()
    if not db_patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")

    db_appointment = models.Appointment(**appointment.dict(), created_by=current_user.id)
    db.add(db_appointment)
    db.commit()
    db.refresh(db_appointment)
    create_audit(db, current_user.id, "CREATE", "appointment", db_appointment.id)
    return db_appointment


@app.get("/appointments", response_model=list[schemas.Appointment])
def read_appointments(skip: int = 0, limit: int = 100, db: Session = Depends(get_db),
                      current_user: models.User = Depends(require_employee)):
    q = db.query(models.Appointment)
    if current_user.role != "master":
        q = q.filter(models.Appointment.created_by == current_user.id)
    return q.offset(skip).limit(limit).all()


@app.put("/appointments/{appointment_id}", response_model=schemas.Appointment)
def update_appointment(appointment_id: int, appointment_update: schemas.AppointmentUpdate,
                       db: Session = Depends(get_db),
                       current_user: models.User = Depends(require_employee)):
    q = db.query(models.Appointment).filter(models.Appointment.id == appointment_id)
    if current_user.role != "master":
        q = q.filter(models.Appointment.created_by == current_user.id)
    db_appointment = q.first()
    if db_appointment is None:
        raise HTTPException(status_code=404, detail="Atendimento não encontrado")

    if appointment_update.patient_id is not None:
        pq = db.query(models.Patient).filter(models.Patient.id == appointment_update.patient_id)
        if current_user.role != "master":
            pq = pq.filter(models.Patient.created_by == current_user.id)
        if not pq.first():
            raise HTTPException(status_code=404, detail="Paciente não encontrado")

    for key, value in appointment_update.dict(exclude_unset=True).items():
        setattr(db_appointment, key, value)
    db.commit()
    db.refresh(db_appointment)
    create_audit(db, current_user.id, "UPDATE", "appointment", db_appointment.id)
    return db_appointment


@app.delete("/appointments/{appointment_id}")
def delete_appointment(appointment_id: int, db: Session = Depends(get_db),
                       current_user: models.User = Depends(require_employee)):
    q = db.query(models.Appointment).filter(models.Appointment.id == appointment_id)
    if current_user.role != "master":
        q = q.filter(models.Appointment.created_by == current_user.id)
    db_appointment = q.first()
    if db_appointment is None:
        raise HTTPException(status_code=404, detail="Atendimento não encontrado")

    create_audit(db, current_user.id, "DELETE", "appointment", db_appointment.id)
    db.delete(db_appointment)
    db.commit()
    return {"detail": "Atendimento excluído com sucesso"}


# ─────────────────────────────────────────────────────────────
# Reports (Master only)
# ─────────────────────────────────────────────────────────────

@app.get("/reports/monthly")
def get_monthly_report(year: int, month: int, db: Session = Depends(get_db),
                       current_user: models.User = Depends(require_master)):
    appointments = db.query(models.Appointment).filter(
        extract('year', models.Appointment.date) == year,
        extract('month', models.Appointment.date) == month
    ).all()

    total_appointments = len(appointments)
    total_value = 0.0
    patient_stats = {}

    for appt in appointments:
        pid = appt.patient_id
        if pid not in patient_stats:
            p = appt.patient
            patient_stats[pid] = {
                "id": p.id,
                "name": p.name,
                "type": p.type,
                "rate": p.rate,
                "session_count": 0,
                "total_value": 0.0
            }
            if p.type == 'Pacote Mensal':
                patient_stats[pid]["total_value"] = p.rate
                total_value += p.rate

        patient_stats[pid]["session_count"] += 1

        if patient_stats[pid]["type"] == 'Avulso':
            patient_stats[pid]["total_value"] += patient_stats[pid]["rate"]
            total_value += patient_stats[pid]["rate"]

    return {
        "total_appointments": total_appointments,
        "total_value": total_value,
        "patients": list(patient_stats.values())
    }


# ─────────────────────────────────────────────────────────────
# Export (Master only)
# ─────────────────────────────────────────────────────────────

@app.get("/export/excel")
def export_excel(db: Session = Depends(get_db),
                 current_user: models.User = Depends(require_master)):
    appointments = db.query(models.Appointment).all()

    data = []
    for appt in appointments:
        p = appt.patient
        employee = appt.created_by_user
        value = p.rate if p.type == 'Avulso' else 0.0
        data.append({
            "Funcionário": employee.full_name if employee else "—",
            "Paciente": p.name,
            "Data do atendimento": appt.date.strftime("%d/%m/%Y"),
            "Horário": appt.time.strftime("%H:%M"),
            "Tipo de atendimento": p.type,
            "Valor": value,
            "Observações": appt.observations or ""
        })

    df = pd.DataFrame(data)
    filename = f"relatorio_atendimentos_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    filepath = os.path.join(EXPORTS_DIR, filename)
    df.to_excel(filepath, index=False)

    return FileResponse(path=filepath, filename=filename,
                        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


# ─────────────────────────────────────────────────────────────
# Audit Logs (Master only)
# ─────────────────────────────────────────────────────────────

@app.get("/audit-logs", response_model=list[schemas.AuditLogOut])
def get_audit_logs(skip: int = 0, limit: int = 100, db: Session = Depends(get_db),
                   current_user: models.User = Depends(require_master)):
    return db.query(models.AuditLog).order_by(
        models.AuditLog.timestamp.desc()
    ).offset(skip).limit(limit).all()
