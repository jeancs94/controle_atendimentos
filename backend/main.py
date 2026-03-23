from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from database import engine, Base, get_db
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
    allow_origins=["*"], # For MVP
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXPORTS_DIR = os.path.join(BASE_DIR, "exports")
if not os.path.exists(EXPORTS_DIR):
    os.makedirs(EXPORTS_DIR)

@app.get("/")
def read_root():
    return {"message": "Bem-vindo à API de Controle de Atendimentos"}

# --- Patients ---
@app.post("/patients", response_model=schemas.Patient)
def create_patient(patient: schemas.PatientCreate, db: Session = Depends(get_db)):
    db_patient = models.Patient(**patient.dict())
    db.add(db_patient)
    db.commit()
    db.refresh(db_patient)
    return db_patient

@app.get("/patients", response_model=list[schemas.Patient])
def read_patients(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    patients = db.query(models.Patient).offset(skip).limit(limit).all()
    return patients

@app.get("/patients/{patient_id}", response_model=schemas.Patient)
def read_patient(patient_id: int, db: Session = Depends(get_db)):
    db_patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if db_patient is None:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    return db_patient

@app.put("/patients/{patient_id}", response_model=schemas.Patient)
def update_patient(patient_id: int, patient_update: schemas.PatientUpdate, db: Session = Depends(get_db)):
    db_patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if db_patient is None:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    
    update_data = patient_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_patient, key, value)
        
    db.commit()
    db.refresh(db_patient)
    return db_patient

@app.delete("/patients/{patient_id}")
def delete_patient(patient_id: int, db: Session = Depends(get_db)):
    db_patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if db_patient is None:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    
    db.delete(db_patient)
    db.commit()
    return {"detail": "Paciente excluído com sucesso"}

# --- Appointments ---
@app.post("/appointments", response_model=schemas.Appointment)
def create_appointment(appointment: schemas.AppointmentCreate, db: Session = Depends(get_db)):
    db_patient = db.query(models.Patient).filter(models.Patient.id == appointment.patient_id).first()
    if not db_patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    
    db_appointment = models.Appointment(**appointment.dict())
    db.add(db_appointment)
    db.commit()
    db.refresh(db_appointment)
    return db_appointment

@app.get("/appointments", response_model=list[schemas.Appointment])
def read_appointments(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    appointments = db.query(models.Appointment).offset(skip).limit(limit).all()
    return appointments

@app.put("/appointments/{appointment_id}", response_model=schemas.Appointment)
def update_appointment(appointment_id: int, appointment_update: schemas.AppointmentUpdate, db: Session = Depends(get_db)):
    db_appointment = db.query(models.Appointment).filter(models.Appointment.id == appointment_id).first()
    if db_appointment is None:
        raise HTTPException(status_code=404, detail="Atendimento não encontrado")
    
    if appointment_update.patient_id is not None:
        db_patient = db.query(models.Patient).filter(models.Patient.id == appointment_update.patient_id).first()
        if not db_patient:
            raise HTTPException(status_code=404, detail="Paciente não encontrado")

    update_data = appointment_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_appointment, key, value)
        
    db.commit()
    db.refresh(db_appointment)
    return db_appointment

@app.delete("/appointments/{appointment_id}")
def delete_appointment(appointment_id: int, db: Session = Depends(get_db)):
    db_appointment = db.query(models.Appointment).filter(models.Appointment.id == appointment_id).first()
    if db_appointment is None:
        raise HTTPException(status_code=404, detail="Atendimento não encontrado")
    
    db.delete(db_appointment)
    db.commit()
    return {"detail": "Atendimento excluído com sucesso"}

# --- Reports ---
@app.get("/reports/monthly")
def get_monthly_report(year: int, month: int, db: Session = Depends(get_db)):
    # Total appointments in month
    appointments = db.query(models.Appointment).filter(
        extract('year', models.Appointment.date) == year,
        extract('month', models.Appointment.date) == month
    ).all()
    
    total_appointments = len(appointments)
    total_value = 0.0
    
    # Process patients
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
                # Only add fixed rate once per month
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

# --- Export ---
@app.get("/export/excel")
def export_excel(db: Session = Depends(get_db)):
    appointments = db.query(models.Appointment).all()
    
    data = []
    for appt in appointments:
        p = appt.patient
        value = p.rate if p.type == 'Avulso' else 0.0
        data.append({
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
    
    return FileResponse(path=filepath, filename=filename, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
