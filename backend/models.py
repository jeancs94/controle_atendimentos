from sqlalchemy import Column, Integer, String, Float, ForeignKey, Text, Date, Time, Boolean, DateTime
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    phone = Column(String, unique=True, nullable=False, index=True)  # login
    email = Column(String, nullable=True)
    password_hash = Column(String, nullable=True)  # null until first login
    role = Column(String, default="employee")  # "master" or "employee"
    is_active = Column(Boolean, default=True)
    must_change_password = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    patients = relationship("Patient", back_populates="created_by_user")
    appointments = relationship("Appointment", back_populates="created_by_user")
    audit_logs = relationship("AuditLog", back_populates="user")


class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    created_at = Column(Date)
    rate = Column(Float)
    type = Column(String)  # 'Avulso' ou 'Pacote Mensal'
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    appointments = relationship("Appointment", back_populates="patient", cascade="all, delete")
    created_by_user = relationship("User", back_populates="patients")


class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"))
    date = Column(Date)
    time = Column(Time)
    observations = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    patient = relationship("Patient", back_populates="appointments")
    created_by_user = relationship("User", back_populates="appointments")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String, nullable=False)   # CREATE, UPDATE, DELETE, LOGIN
    resource = Column(String, nullable=False)  # patient, appointment, user
    resource_id = Column(Integer, nullable=True)
    detail = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="audit_logs")
