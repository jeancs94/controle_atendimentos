from __future__ import annotations
from typing import Optional, List
from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from database import engine, Base, get_db
from auth import hash_password, verify_password, create_access_token
from dependencies import get_current_user, require_superadmin, require_admin, require_employee
import models, schemas
import os
import io
import pandas as pd
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER

# Creates the database tables
Base.metadata.create_all(bind=engine)

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
    existing = db.query(models.User).filter(models.User.role == "superadmin").first()
    if not existing:
        sa = models.User(
            full_name="Super Administrador",
            phone="11999999999",
            email=None,
            password_hash=hash_password("admin123"),
            role="superadmin",
            is_active=True,
            must_change_password=False,
            clinic_id=None
        )
        db.add(sa)
        db.commit()
        print("✅ Usuário superadmin padrão criado: telefone=11999999999, senha=admin123")


@app.on_event("startup")
def on_startup():
    db = next(get_db())
    create_default_superadmin(db)

# ── Health ───────────────────────────────────────────────────

@app.get("/")
def read_root():
    return {"message": "Bem-vindo à API de Controle de Atendimentos (Fase 2)"}


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
def create_patient(patient: schemas.PatientCreate, db: Session = Depends(get_db), current_user: models.User = Depends(require_employee)):
    if current_user.role == "superadmin" and not patient.clinic_id: # Needs injection from payload if superadmin, but schema has no clinic_id
        raise HTTPException(status_code=400, detail="Superadmin precisa especificar a clínica (não suportado ainda por UX)")
    
    clinic_id = current_user.clinic_id
    if not clinic_id:
        raise HTTPException(status_code=400, detail="Usuário não pertence a uma clínica")

    db_patient = models.Patient(**patient.dict(), created_by=current_user.id, clinic_id=clinic_id)
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
    elif current_user.role == "employee":
        q = q.filter(models.Patient.created_by == current_user.id)
    return q.offset(skip).limit(limit).all()


@app.get("/patients/{patient_id}", response_model=schemas.Patient)
def read_patient(patient_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_employee)):
    q = db.query(models.Patient).filter(models.Patient.id == patient_id)
    if current_user.role == "admin":
        q = q.filter(models.Patient.clinic_id == current_user.clinic_id)
    elif current_user.role == "employee":
        q = q.filter(models.Patient.created_by == current_user.id)
    p = q.first()
    if not p:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    return p


@app.put("/patients/{patient_id}", response_model=schemas.Patient)
def update_patient(patient_id: int, patient_update: schemas.PatientUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(require_employee)):
    p = read_patient(patient_id, db, current_user)
    for k, v in patient_update.dict(exclude_unset=True).items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return p


@app.delete("/patients/{patient_id}")
def delete_patient(patient_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_employee)):
    p = read_patient(patient_id, db, current_user)
    create_audit(db, current_user.id, "DELETE", "patient", p.id)
    db.delete(p)
    db.commit()
    return {"detail": "Paciente excluído"}


# ── Appointments ─────────────────────────────────────────────

def validate_appointment_rules(date_obj, time_obj):
    from datetime import time, timedelta, datetime as dt
    if date_obj.weekday() >= 5:
        raise HTTPException(status_code=400, detail="Não é possível realizar atendimentos aos fins de semana")
    if time_obj < time(8, 0) or time_obj > time(19, 0):
        raise HTTPException(status_code=400, detail="Horário fora do expediente (08h às 19h)")
    if time(12, 0) <= time_obj < time(13, 0):
        raise HTTPException(status_code=400, detail="Horário indisponível devido ao almoço (12h às 13h)")

    curr = dt.combine(dt.today(), time(8, 0))
    valid_slots = []
    while curr.time() <= time(19, 0):
        if curr.hour != 12:
            valid_slots.append(curr.time())
        if curr.hour == 12:
            curr = dt.combine(dt.today(), time(13, 0))
        else:
            curr += timedelta(minutes=40)
    
    if time_obj not in valid_slots:
        raise HTTPException(status_code=400, detail="Horário inválido. As sessões devem ter intervalos de 40 minutos")

@app.post("/appointments", response_model=schemas.Appointment)
def create_appointment(appointment: schemas.AppointmentCreate, db: Session = Depends(get_db), current_user: models.User = Depends(require_employee)):
    # Same visibility rules
    p = db.query(models.Patient).filter(models.Patient.id == appointment.patient_id)
    if current_user.role == "admin":
        p = p.filter(models.Patient.clinic_id == current_user.clinic_id)
    elif current_user.role == "employee":
        p = p.filter(models.Patient.created_by == current_user.id)
    db_patient = p.first()
    if not db_patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")

    validate_appointment_rules(appointment.date, appointment.time)

    db_appointment = models.Appointment(**appointment.dict(), created_by=current_user.id, clinic_id=db_patient.clinic_id)
    db.add(db_appointment)
    db.commit()
    db.refresh(db_appointment)
    create_audit(db, current_user.id, "CREATE", "appointment", db_appointment.id)
    return db_appointment


@app.get("/appointments", response_model=List[schemas.Appointment])
def read_appointments(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(require_employee)):
    q = db.query(models.Appointment)
    if current_user.role == "admin":
        q = q.filter(models.Appointment.clinic_id == current_user.clinic_id)
    elif current_user.role == "employee":
        q = q.filter(models.Appointment.created_by == current_user.id)
    return q.offset(skip).limit(limit).all()


@app.put("/appointments/{appointment_id}", response_model=schemas.Appointment)
def update_appointment(appointment_id: int, appointment_update: schemas.AppointmentUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(require_employee)):
    q = db.query(models.Appointment).filter(models.Appointment.id == appointment_id)
    if current_user.role == "admin":
        q = q.filter(models.Appointment.clinic_id == current_user.clinic_id)
    elif current_user.role == "employee":
        q = q.filter(models.Appointment.created_by == current_user.id)
    appo = q.first()
    if not appo:
        raise HTTPException(status_code=404, detail="Atendimento não encontrado")

    new_date = appointment_update.date or appo.date
    new_time = appointment_update.time or appo.time
    if appointment_update.date or appointment_update.time:
        validate_appointment_rules(new_date, new_time)

    for k, v in appointment_update.dict(exclude_unset=True).items():
        setattr(appo, k, v)
    db.commit()
    db.refresh(appo)
    return appo


@app.delete("/appointments/{appointment_id}")
def delete_appointment(appointment_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_employee)):
    q = db.query(models.Appointment).filter(models.Appointment.id == appointment_id)
    if current_user.role == "admin":
        q = q.filter(models.Appointment.clinic_id == current_user.clinic_id)
    elif current_user.role == "employee":
        q = q.filter(models.Appointment.created_by == current_user.id)
    appo = q.first()
    if not appo:
        raise HTTPException(status_code=404, detail="Atendimento não encontrado")
    create_audit(db, current_user.id, "DELETE", "appointment", appo.id)
    db.delete(appo)
    db.commit()
    return {"detail": "Atendimento excluído com sucesso"}


# ── Payroll & Reports ────────────────────────────────────────

def calc_earnings(user_id: int, year: int, month: int, db: Session) -> tuple[float, int]:
    appointments = db.query(models.Appointment).filter(
        models.Appointment.created_by == user_id,
        extract('year', models.Appointment.date) == year,
        extract('month', models.Appointment.date) == month,
    ).all()
    total_val = 0.0
    seen = set()
    for appt in appointments:
        p = appt.patient
        if p.type == 'Avulso':
            total_val += p.rate
        elif p.id not in seen:
            total_val += p.rate
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
        emp_id = appt.created_by
        p = appt.patient

        if pid not in patient_stats:
            patient_stats[pid] = {"id": p.id, "name": p.name, "type": p.type, "rate": p.rate, "session_count": 0, "total_value": 0.0}
            if p.type == 'Pacote Mensal':
                patient_stats[pid]["total_value"] = p.rate
                total_value += p.rate

        patient_stats[pid]["session_count"] += 1
        if patient_stats[pid]["type"] == 'Avulso':
            patient_stats[pid]["total_value"] += patient_stats[pid]["rate"]
            total_value += patient_stats[pid]["rate"]

        if emp_id not in employee_stats:
            emp = appt.created_by_user
            employee_stats[emp_id] = {"user_id": emp_id, "full_name": emp.full_name if emp else "—", "total_appointments": 0, "total_value": 0.0, "seen_monthly_pats": set()}
        
        employee_stats[emp_id]["total_appointments"] += 1
        if p.type == 'Avulso':
            employee_stats[emp_id]["total_value"] += p.rate
        elif p.id not in employee_stats[emp_id]["seen_monthly_pats"]:
            employee_stats[emp_id]["total_value"] += p.rate
            employee_stats[emp_id]["seen_monthly_pats"].add(p.id)

    emps_clean = []
    for k, v in employee_stats.items():
        # check payroll paid status
        pr = db.query(models.Payroll).filter(models.Payroll.user_id==k, models.Payroll.ref_year==year, models.Payroll.ref_month==month).first()
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


# ── Audit & Exports ──────────────────────────────────────────

@app.get("/audit-logs", response_model=List[schemas.AuditLogOut])
def get_audit_logs(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(require_superadmin)):
    return db.query(models.AuditLog).order_by(models.AuditLog.timestamp.desc()).offset(skip).limit(limit).all()
