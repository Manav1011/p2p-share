from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import asyncio
from passlib.context import CryptContext
from pydantic import BaseModel
from typing import List, Optional

from . import models, database

models.Base.metadata.create_all(bind=database.engine)

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency
def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Password Hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class UserCreate(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    username: str
    is_online: bool
    is_busy: bool

    class Config:
        orm_mode = True

# --- Background Task for Pruning ---
async def prune_users():
    while True:
        try:
            db = database.SessionLocal()
            cutoff = datetime.utcnow() - timedelta(seconds=60)
            # Find users who haven't pinged in 60s and marked as online
            stale_users = db.query(models.User).filter(
                models.User.is_online == True,
                models.User.last_ping < cutoff
            ).all()
            
            for user in stale_users:
                user.is_online = False
                user.is_busy = False # Reset busy status if they dropped off
            
            if stale_users:
                db.commit()
            db.close()
        except Exception as e:
            print(f"Pruning error: {e}")
        
        await asyncio.sleep(10) # Run every 10 seconds

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(prune_users())

# --- Endpoints ---

@app.post("/register")
def register(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed_password = pwd_context.hash(user.password)
    new_user = models.User(username=user.username, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    return {"message": "User created successfully"}

@app.post("/login")
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if not db_user or not pwd_context.verify(user.password, db_user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid credentials")
    
    # Mark as online immediately
    db_user.is_online = True
    db_user.last_ping = datetime.utcnow()
    db.commit()
    
    return {"username": db_user.username, "message": "Login successful"}

@app.post("/ping")
def ping(username: str, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == username).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    db_user.last_ping = datetime.utcnow()
    db_user.is_online = True
    db.commit()
    return {"status": "ok"}

@app.get("/users", response_model=List[UserResponse])
def get_users(db: Session = Depends(get_db)):
    # Return users online within last 60s AND not busy
    cutoff = datetime.utcnow() - timedelta(seconds=60)
    users = db.query(models.User).filter(
        models.User.is_online == True,
        models.User.last_ping > cutoff,
        models.User.is_busy == False
    ).all()
    return users

@app.post("/status")
def update_status(username: str, is_busy: bool, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == username).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    db_user.is_busy = is_busy
    db.commit()
    return {"status": "updated"}
