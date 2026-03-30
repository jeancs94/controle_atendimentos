from __future__ import annotations
from typing import Optional
from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from database import engine, Base, get_db
from auth import hash_password, verify_password, create_access_token
from dependencies import get_current_user, require_master, require_employee
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
from fastapi.responses import StreamingResponse

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


@app.put("/users/{user_id}/reset-password")
def reset_user_password(user_id: int, db: Session = Depends(get_db),
                         current_user: models.User = Depends(require_master)):
    """Master resets employee password forcing them to set a new one on next login."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if user.role == "master":
        raise HTTPException(status_code=403, detail="Não é possível resetar a senha do master")

    user.password_hash = None
    user.must_change_password = True
    db.commit()
    create_audit(db, current_user.id, "RESET_PASSWORD", "user", user.id,
                 f"Resetou senha de {user.full_name}")
    return {"detail": "Senha resetada. O funcionário deverá definir uma nova senha no próximo acesso."}


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

def validate_appointment_rules(date_obj, time_obj):
    from datetime import time, timedelta, datetime as dt
    # 1. No weekends
    if date_obj.weekday() >= 5:
        raise HTTPException(status_code=400, detail="Não é possível realizar atendimentos aos fins de semana")

    # 2. Business hours (08:00 to 19:00)
    start_v = time(8, 0)
    last_v = time(19, 0)
    if time_obj < start_v or time_obj > last_v:
        raise HTTPException(status_code=400, detail="Horário fora do expediente (08h às 19h)")

    # 3. Lunch break (12:00 to 13:00)
    lunch_s = time(12, 0)
    lunch_e = time(13, 0)
    if lunch_s <= time_obj < lunch_e:
        raise HTTPException(status_code=400, detail="Horário indisponível devido ao almoço (12h às 13h)")

    # 4. 40-minute intervals
    def is_valid_slot(t):
        curr = dt.combine(dt.today(), time(8, 0))
        valid_slots = []
        while curr.time() <= time(19, 0):
            if curr.hour != 12:
                valid_slots.append(curr.time())
            if curr.hour == 12:
                curr = dt.combine(dt.today(), time(13, 0))
            else:
                curr += timedelta(minutes=40)
        return t in valid_slots

    if not is_valid_slot(time_obj):
        raise HTTPException(status_code=400, detail="Horário inválido. As sessões devem ter intervalos de 40 minutos")

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

    # Business rules validation
    validate_appointment_rules(appointment.date, appointment.time)

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

    # Validate rules if date or time is changing
    new_date = appointment_update.date or db_appointment.date
    new_time = appointment_update.time or db_appointment.time
    if appointment_update.date is not None or appointment_update.time is not None:
        validate_appointment_rules(new_date, new_time)

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
    employee_stats = {}

    for appt in appointments:
        pid = appt.patient_id
        emp_id = appt.created_by

        # Patient breakdown
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

        # Employee breakdown
        if emp_id not in employee_stats:
            emp = appt.created_by_user
            employee_stats[emp_id] = {
                "user_id": emp_id,
                "full_name": emp.full_name if emp else "—",
                "total_appointments": 0,
                "total_value": 0.0,
                "seen_monthly_patients": set(),
            }
        employee_stats[emp_id]["total_appointments"] += 1
        p = appt.patient
        if p.type == 'Avulso':
            employee_stats[emp_id]["total_value"] += p.rate
        elif p.id not in employee_stats[emp_id]["seen_monthly_patients"]:
            employee_stats[emp_id]["total_value"] += p.rate
            employee_stats[emp_id]["seen_monthly_patients"].add(p.id)

    # Clean up internal set before returning
    employees_list = [
        {
            "user_id": v["user_id"],
            "full_name": v["full_name"],
            "total_appointments": v["total_appointments"],
            "total_value": v["total_value"],
        }
        for v in employee_stats.values()
    ]

    return {
        "total_appointments": total_appointments,
        "total_value": total_value,
        "patients": list(patient_stats.values()),
        "employees": employees_list,
    }


# ─────────────────────────────────────────────────────────────
# Export (Master only)
# ─────────────────────────────────────────────────────────────

@app.get("/export/excel")
def export_excel(
    user_id: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_master),
):
    q = db.query(models.Appointment)
    if user_id:
        q = q.filter(models.Appointment.created_by == user_id)
    if year:
        q = q.filter(extract('year', models.Appointment.date) == year)
    if month:
        q = q.filter(extract('month', models.Appointment.date) == month)
    appointments = q.all()

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
    create_audit(db, current_user.id, "EXPORT_EXCEL", "report", None,
                 f"Exportou Excel (user_id={user_id}, {year}/{month})")
    return FileResponse(path=filepath, filename=filename,
                        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


@app.get("/export/pdf")
def export_pdf(
    user_id: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_master),
):
    q = db.query(models.Appointment)
    if user_id:
        q = q.filter(models.Appointment.created_by == user_id)
    if year:
        q = q.filter(extract('year', models.Appointment.date) == year)
    if month:
        q = q.filter(extract('month', models.Appointment.date) == month)
    appointments = q.all()

    # Resolve employee name for header
    emp_name = "Todos os funcionários"
    if user_id:
        emp = db.query(models.User).filter(models.User.id == user_id).first()
        if emp:
            emp_name = emp.full_name

    month_names = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                   "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
    period = ""
    if year and month:
        period = f"{month_names[month - 1]}/{year}"
    elif year:
        period = str(year)

    # Build PDF in memory
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4,
                            rightMargin=2*cm, leftMargin=2*cm,
                            topMargin=2*cm, bottomMargin=2*cm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('title', parent=styles['Title'],
                                  fontSize=16, spaceAfter=6,
                                  textColor=colors.HexColor('#c2185b'))
    sub_style = ParagraphStyle('sub', parent=styles['Normal'],
                                fontSize=10, spaceAfter=12,
                                textColor=colors.HexColor('#555555'))

    story = []
    story.append(Paragraph("Relatório de Atendimentos", title_style))
    story.append(Paragraph(f"Funcionário: {emp_name}   |   Período: {period or 'Geral'}", sub_style))
    story.append(Spacer(1, 0.3*cm))

    # Summary totals
    total_value = 0.0
    seen_monthly = {}
    for appt in appointments:
        p = appt.patient
        emp_id = appt.created_by
        if p.type == 'Avulso':
            total_value += p.rate
        else:
            key = (emp_id, p.id)
            if key not in seen_monthly:
                seen_monthly[key] = True
                total_value += p.rate

    summary_data = [
        ["Total de atendimentos", str(len(appointments))],
        ["Valor total", f"R$ {total_value:.2f}"],
    ]
    summary_table = Table(summary_data, colWidths=[9*cm, 5*cm])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#fce4ec')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#333333')),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('PADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e91e63')),
        ('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.HexColor('#fce4ec'), colors.HexColor('#fff')]),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 0.5*cm))

    # Detail table
    headers = ["Funcionário", "Paciente", "Data", "Tipo", "Valor"]
    rows = [headers]
    for appt in appointments:
        p = appt.patient
        emp = appt.created_by_user
        value = p.rate if p.type == 'Avulso' else 0.0
        rows.append([
            emp.full_name if emp else "—",
            p.name,
            appt.date.strftime("%d/%m/%Y"),
            p.type,
            f"R$ {value:.2f}"
        ])

    col_widths = [4.5*cm, 4.5*cm, 2.8*cm, 3*cm, 2.5*cm]
    detail_table = Table(rows, colWidths=col_widths, repeatRows=1)
    detail_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#c2185b')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('PADDING', (0, 0), (-1, -1), 6),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#fce4ec')]),
        ('GRID', (0, 0), (-1, -1), 0.3, colors.HexColor('#e0e0e0')),
        ('ALIGN', (4, 0), (4, -1), 'RIGHT'),
    ]))
    story.append(detail_table)
    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph(
        f"Gerado em {datetime.now().strftime('%d/%m/%Y às %H:%M')} — Controle de Atendimentos",
        ParagraphStyle('footer', parent=styles['Normal'], fontSize=7,
                        textColor=colors.grey, alignment=TA_CENTER)
    ))

    doc.build(story)
    buffer.seek(0)

    filename = f"relatorio_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    create_audit(db, current_user.id, "EXPORT_PDF", "report", None,
                 f"Exportou PDF (user_id={user_id}, {year}/{month})")
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# ─────────────────────────────────────────────────────────────
# Audit Logs (Master only)
# ─────────────────────────────────────────────────────────────

@app.get("/audit-logs", response_model=list[schemas.AuditLogOut])
def get_audit_logs(skip: int = 0, limit: int = 100, db: Session = Depends(get_db),
                   current_user: models.User = Depends(require_master)):
    return db.query(models.AuditLog).order_by(
        models.AuditLog.timestamp.desc()
    ).offset(skip).limit(limit).all()
