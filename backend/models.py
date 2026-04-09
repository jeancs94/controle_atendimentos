from sqlalchemy import Column, Integer, String, Float, ForeignKey, Text, Date, Time, Boolean, DateTime
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime

class Clinic(Base):
    __tablename__ = "clinics"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    is_active = Column(Boolean, default=True)
    mfa_required = Column(Boolean, default=False)
    backup_active = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    users = relationship("User", back_populates="clinic")
    patients = relationship("Patient", back_populates="clinic")
    appointments = relationship("Appointment", back_populates="clinic")
    payrolls = relationship("Payroll", back_populates="clinic")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    clinic_id = Column(Integer, ForeignKey("clinics.id"), nullable=True) # Superadmin might not have a clinic
    full_name = Column(String, nullable=False)
    phone = Column(String, unique=True, nullable=False, index=True)  # login
    email = Column(String, nullable=True)
    password_hash = Column(String, nullable=True)  # null until first login
    role = Column(String, default="employee")  # "superadmin", "admin" or "employee"
    is_active = Column(Boolean, default=True)
    must_change_password = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    clinic = relationship("Clinic", back_populates="users")
    patients = relationship("Patient", back_populates="created_by_user")
    appointments = relationship("Appointment", back_populates="created_by_user")
    audit_logs = relationship("AuditLog", back_populates="user")
    payrolls_received = relationship("Payroll", foreign_keys="[Payroll.user_id]", back_populates="user")
    payrolls_paid = relationship("Payroll", foreign_keys="[Payroll.paid_by]", back_populates="paid_by_admin")


class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    clinic_id = Column(Integer, ForeignKey("clinics.id"), nullable=False)
    name = Column(String, index=True)
    created_at = Column(Date)
    rate = Column(Float)
    type = Column(String)  # 'Avulso' ou 'Pacote Mensal'
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    clinic = relationship("Clinic", back_populates="patients")
    appointments = relationship("Appointment", back_populates="patient", cascade="all, delete")
    created_by_user = relationship("User", back_populates="patients")


class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True, index=True)
    clinic_id = Column(Integer, ForeignKey("clinics.id"), nullable=False)
    patient_id = Column(Integer, ForeignKey("patients.id"))
    date = Column(Date)
    time = Column(Time)
    observations = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    clinic = relationship("Clinic", back_populates="appointments")
    patient = relationship("Patient", back_populates="appointments")
    created_by_user = relationship("User", back_populates="appointments")


class Payroll(Base):
    __tablename__ = "payrolls"

    id = Column(Integer, primary_key=True, index=True)
    clinic_id = Column(Integer, ForeignKey("clinics.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False) # Employee who got paid
    ref_year = Column(Integer, nullable=False)
    ref_month = Column(Integer, nullable=False)
    amount = Column(Float, nullable=False)
    paid_at = Column(DateTime, default=datetime.utcnow)
    paid_by = Column(Integer, ForeignKey("users.id"), nullable=False) # Admin who paid

    clinic = relationship("Clinic", back_populates="payrolls")
    user = relationship("User", foreign_keys=[user_id], back_populates="payrolls_received")
    paid_by_admin = relationship("User", foreign_keys=[paid_by], back_populates="payrolls_paid")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String, nullable=False)   # CREATE, UPDATE, DELETE, LOGIN
    resource = Column(String, nullable=False)  # clinic, patient, appointment, user, payroll
    resource_id = Column(Integer, nullable=True)
    detail = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="audit_logs")
