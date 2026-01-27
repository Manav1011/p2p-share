from sqlalchemy import Boolean, Column, Integer, String, DateTime
from .database import Base
from datetime import datetime

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_online = Column(Boolean, default=False)
    last_ping = Column(DateTime, default=datetime.utcnow)
    is_busy = Column(Boolean, default=False)
