import datetime
import random
from sqlalchemy.orm import Session
from database import SessionLocal, engine
import models
from auth import hash_password

def seed_data():
    db = SessionLocal()
    try:
        # 1. Create Clinic
        clinic_name = "Clínica Nova Esperança"
        clinic = db.query(models.Clinic).filter(models.Clinic.name == clinic_name).first()
        if not clinic:
            clinic = models.Clinic(name=clinic_name)
            db.add(clinic)
            db.commit()
            db.refresh(clinic)
            print(f"✅ Clínica '{clinic_name}' criada.")
        else:
            print(f"ℹ️ Clínica '{clinic_name}' já existe.")

        # 2. Create 2 Admins
        admins = []
        for i in range(1, 3):
            phone = f"1191000000{i}"
            admin = db.query(models.User).filter(models.User.phone == phone).first()
            if not admin:
                admin = models.User(
                    clinic_id=clinic.id,
                    full_name=f"Administrador {i}",
                    phone=phone,
                    password_hash=hash_password("senha123"),
                    role="admin",
                    must_change_password=False
                )
                db.add(admin)
                admins.append(admin)
            else:
                admins.append(admin)
        db.commit()
        print(f"✅ {len(admins)} Admins verificados/criados.")

        # 3. Create 5 Employees
        employees = []
        for i in range(1, 6):
            phone = f"1192000000{i}"
            emp = db.query(models.User).filter(models.User.phone == phone).first()
            if not emp:
                emp = models.User(
                    clinic_id=clinic.id,
                    full_name=f"Funcionário {chr(64+i)}",
                    phone=phone,
                    password_hash=hash_password("senha123"),
                    role="employee",
                    must_change_password=False
                )
                db.add(emp)
                employees.append(emp)
            else:
                employees.append(emp)
        db.commit()
        print(f"✅ {len(employees)} Funcionários verificados/criados.")

        # 4. Create 10 Patients per Employee (Total 50)
        patient_types = ["Avulso", "Pacote Mensal"]
        all_patients = []
        for emp in employees:
            for i in range(1, 11):
                p_name = f"Paciente {i} ({emp.full_name})"
                p_type = random.choice(patient_types)
                p_rate = random.choice([80.0, 100.0, 120.0, 150.0, 200.0, 250.0])
                
                patient = db.query(models.Patient).filter(
                    models.Patient.name == p_name, 
                    models.Patient.created_by == emp.id
                ).first()
                
                if not patient:
                    patient = models.Patient(
                        clinic_id=clinic.id,
                        name=p_name,
                        type=p_type,
                        rate=p_rate,
                        created_by=emp.id,
                        created_at=datetime.date(2026, 1, 1)
                    )
                    db.add(patient)
                    all_patients.append(patient)
                else:
                    all_patients.append(patient)
        db.commit()
        print(f"✅ {len(all_patients)} Pacientes verificados/criados.")

        # 5. Create 15 Appointments per Employee in April 2026 (Total 75)
        # Rules: Mon-Fri, 08:00-19:00, no 12:00-13:00, 40 min slots
        valid_times = []
        curr = datetime.datetime.combine(datetime.date.today(), datetime.time(8, 0))
        end_time = datetime.time(19, 0)
        while curr.time() <= end_time:
            if curr.hour != 12:
                valid_times.append(curr.time())
            curr += datetime.timedelta(minutes=40)

        appointments_created = 0
        for emp in employees:
            # Get patients for this employee
            emp_patients = [p for p in all_patients if p.created_by == emp.id]
            
            # Days in April 2026 (1-30)
            april_days = list(range(1, 31))
            random.shuffle(april_days)
            
            created_for_this_emp = 0
            while created_for_this_emp < 15:
                for day in april_days:
                    dt = datetime.date(2026, 4, day)
                    if dt.weekday() >= 5: # Weekend
                        continue
                    
                    # Random slot
                    tm = random.choice(valid_times)
                    
                    # Check if already exists for this clinic/time
                    exists = db.query(models.Appointment).filter(
                        models.Appointment.clinic_id == clinic.id,
                        models.Appointment.date == dt,
                        models.Appointment.time == tm
                    ).first()
                    
                    if not exists:
                        p = random.choice(emp_patients)
                        appt = models.Appointment(
                            clinic_id=clinic.id,
                            patient_id=p.id,
                            date=dt,
                            time=tm,
                            created_by=emp.id,
                            observations="Sessão de rotina."
                        )
                        db.add(appt)
                        created_for_this_emp += 1
                        appointments_created += 1
                    
                    if created_for_this_emp >= 15:
                        break
        
        db.commit()
        print(f"✅ {appointments_created} Atendimentos criados para o mês de Abril.")

    except Exception as e:
        db.rollback()
        print(f"❌ Erro ao popular dados: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_data()
