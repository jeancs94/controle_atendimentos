import sys
import unittest
from datetime import date, time
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main
import models
import schemas
from database import Base


class ScheduleRulesTests(unittest.TestCase):
    def test_workday_slots_exclude_lunch_and_end_at_1740(self):
        slots = main.build_workday_slots()
        self.assertEqual(slots[0], time(8, 0))
        self.assertNotIn(time(12, 0), slots)
        self.assertIn(time(13, 0), slots)
        self.assertEqual(slots[-1], time(17, 40))
        self.assertEqual(len(slots), 14)

    def test_validates_lunch_and_boundary_rules(self):
        self.assertTrue(main.is_time_slot_valid(time(8, 0)))
        self.assertFalse(main.is_time_slot_valid(time(12, 0)))
        self.assertFalse(main.is_time_slot_valid(time(12, 30)))
        self.assertTrue(main.is_time_slot_valid(time(17, 0)))
        self.assertTrue(main.is_time_slot_valid(time(17, 40)))
        self.assertFalse(main.is_time_slot_valid(time(17, 50)))

    def test_approved_schedule_change_updates_appointment(self):
        engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(bind=engine)
        Session = sessionmaker(bind=engine)
        db = Session()

        try:
            db.execute(text("INSERT INTO clinics (id, name, is_active, mfa_required, backup_active, created_at) VALUES (1, 'Clínica Teste', 1, 0, 0, '2024-01-01 00:00:00')"))
            db.execute(text("INSERT INTO users (id, clinic_id, full_name, phone, email, password_hash, role, is_active, must_change_password, created_at) VALUES (1, 1, 'Admin', '19999000001', NULL, NULL, 'admin', 1, 0, '2024-01-01 00:00:00')"))
            db.execute(text("INSERT INTO users (id, clinic_id, full_name, phone, email, password_hash, role, is_active, must_change_password, created_at) VALUES (2, 1, 'Profissional', '19999000002', NULL, NULL, 'employee', 1, 0, '2024-01-01 00:00:00')"))
            db.execute(text("INSERT INTO patients (id, clinic_id, name, created_at, rate, type, created_by) VALUES (1, 1, 'Paciente Teste', '2024-01-01', 150.0, 'Avulso', 1)"))
            db.execute(text("INSERT INTO appointments (id, clinic_id, patient_id, professional_id, date, time, observations, value, created_by) VALUES (1, 1, 1, 2, '2024-01-05', '09:00:00', 'Teste', 150.0, 1)"))
            db.execute(text("INSERT INTO schedule_change_requests (id, patient_id, professional_id, requested_date, requested_time, message, status, created_at) VALUES (1, 1, 2, '2024-01-08', '10:40:00', 'Solicitação de teste', 'pending', '2024-01-01 00:00:00')"))
            db.commit()

            admin = db.query(models.User).filter(models.User.id == 1).first()
            request = db.query(models.ScheduleChangeRequest).filter(models.ScheduleChangeRequest.id == 1).first()
            appointment = db.query(models.Appointment).filter(models.Appointment.id == 1).first()

            main.update_schedule_change_request_status(
                request.id,
                'approved',
                db=db,
                current_user=admin,
            )

            db.refresh(appointment)
            self.assertEqual(appointment.date, date(2024, 1, 8))
            self.assertEqual(appointment.time, time(10, 40))
            self.assertEqual(request.status, 'approved')
        finally:
            db.close()

    def test_calc_earnings_uses_professional_assignment(self):
        engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(bind=engine)
        Session = sessionmaker(bind=engine)
        db = Session()

        try:
            db.execute(text("INSERT INTO clinics (id, name, is_active, mfa_required, backup_active, created_at) VALUES (1, 'Clínica Teste', 1, 0, 0, '2024-01-01 00:00:00')"))
            db.execute(text("INSERT INTO users (id, clinic_id, full_name, phone, email, password_hash, role, is_active, must_change_password, created_at) VALUES (1, 1, 'Admin', '19999000001', NULL, NULL, 'admin', 1, 0, '2024-01-01 00:00:00')"))
            db.execute(text("INSERT INTO users (id, clinic_id, full_name, phone, email, password_hash, role, is_active, must_change_password, created_at) VALUES (2, 1, 'Profissional', '19999000002', NULL, NULL, 'employee', 1, 0, '2024-01-01 00:00:00')"))
            db.execute(text("INSERT INTO patients (id, clinic_id, name, created_at, rate, type, created_by) VALUES (1, 1, 'Paciente Teste', '2024-01-01', 150.0, 'Avulso', 1)"))
            db.execute(text("INSERT INTO appointments (id, clinic_id, patient_id, professional_id, date, time, observations, value, created_by) VALUES (1, 1, 1, 2, '2024-01-05', '09:00:00', 'Teste', 150.0, 1)"))
            db.commit()

            total_val, count = main.calc_earnings(2, 2024, 1, db)
            self.assertEqual(count, 1)
            self.assertEqual(total_val, 150.0)
        finally:
            db.close()

    def test_create_appointment_allows_recurring_flag(self):
        engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(bind=engine)
        Session = sessionmaker(bind=engine)
        db = Session()

        try:
            db.execute(text("INSERT INTO clinics (id, name, is_active, mfa_required, backup_active, created_at) VALUES (1, 'Clínica Teste', 1, 0, 0, '2024-01-01 00:00:00')"))
            db.execute(text("INSERT INTO users (id, clinic_id, full_name, phone, email, password_hash, role, is_active, must_change_password, created_at) VALUES (1, 1, 'Admin', '19999000001', NULL, NULL, 'admin', 1, 0, '2024-01-01 00:00:00')"))
            db.execute(text("INSERT INTO users (id, clinic_id, full_name, phone, email, password_hash, role, is_active, must_change_password, created_at) VALUES (2, 1, 'Profissional', '19999000002', NULL, NULL, 'employee', 1, 0, '2024-01-01 00:00:00')"))
            db.execute(text("INSERT INTO patients (id, clinic_id, name, created_at, rate, type, created_by) VALUES (1, 1, 'Paciente Teste', '2024-01-01', 150.0, 'Avulso', 1)"))
            db.commit()

            payload = schemas.AppointmentCreate(
                patient_id=1,
                professional_id=2,
                date=date(2024, 1, 5),
                time=time(8, 40),
                value=150.0,
                recurring=True,
                observations='Teste',
            )
            created = main.create_appointment(payload, db=db, current_user=db.query(models.User).filter(models.User.id == 1).first())
            self.assertEqual(created.recurring, True)
            self.assertEqual(created.professional_id, 2)
        finally:
            db.close()

    def test_ensure_database_schema_adds_missing_columns(self):
        engine = create_engine('sqlite:///:memory:')
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE appointments (id INTEGER PRIMARY KEY, clinic_id INTEGER, patient_id INTEGER, date TEXT, time TEXT)"))

        main.engine = engine
        try:
            main.ensure_database_schema()
            columns = {row[1] for row in engine.connect().execute(text("PRAGMA table_info('appointments')")).fetchall()}
            self.assertIn('professional_id', columns)
            self.assertIn('value', columns)
            self.assertIn('observations', columns)
            self.assertIn('recurring', columns)
            self.assertIn('created_by', columns)
        finally:
            main.engine = engine

    def test_update_appointment_keeps_existing_data_when_partial_payload(self):
        engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(bind=engine)
        Session = sessionmaker(bind=engine)
        db = Session()

        try:
            db.execute(text("INSERT INTO clinics (id, name, is_active, mfa_required, backup_active, created_at) VALUES (1, 'Clínica Teste', 1, 0, 0, '2024-01-01 00:00:00')"))
            db.execute(text("INSERT INTO users (id, clinic_id, full_name, phone, email, password_hash, role, is_active, must_change_password, created_at) VALUES (1, 1, 'Admin', '19999000001', NULL, NULL, 'admin', 1, 0, '2024-01-01 00:00:00')"))
            db.execute(text("INSERT INTO users (id, clinic_id, full_name, phone, email, password_hash, role, is_active, must_change_password, created_at) VALUES (2, 1, 'Profissional', '19999000002', NULL, NULL, 'employee', 1, 0, '2024-01-01 00:00:00')"))
            db.execute(text("INSERT INTO patients (id, clinic_id, name, created_at, rate, type, created_by) VALUES (1, 1, 'Paciente Teste', '2024-01-01', 150.0, 'Avulso', 1)"))
            db.execute(text("INSERT INTO appointments (id, clinic_id, patient_id, professional_id, date, time, observations, value, recurring, created_by) VALUES (1, 1, 1, 2, '2024-01-05', '09:00:00', 'Teste', 150.0, 0, 1)"))
            db.commit()

            current_user = db.query(models.User).filter(models.User.id == 1).first()
            payload = schemas.AppointmentUpdate(observations='Atualizado', value=180.0)
            updated = main.update_appointment(1, payload, db=db, current_user=current_user)

            self.assertEqual(updated.observations, 'Atualizado')
            self.assertEqual(updated.value, 180.0)
            self.assertEqual(updated.professional_id, 2)
            self.assertEqual(updated.patient_id, 1)
        finally:
            db.close()


if __name__ == '__main__':
    unittest.main()
