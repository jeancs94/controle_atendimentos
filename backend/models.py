from sqlalchemy import Column, Integer, String, Float, ForeignKey, Text, Date, Time
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime

class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    created_at = Column(Date)
    rate = Column(Float)
    type = Column(String) # 'Avulso' ou 'Pacote Mensal'
    
    appointments = relationship("Appointment", back_populates="patient", cascade="all, delete")

class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"))
    date = Column(Date)
    time = Column(Time)
    observations = Column(Text, nullable=True)
    
    patient = relationship("Patient", back_populates="appointments")
