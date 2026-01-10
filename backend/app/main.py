from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api.auth import router as auth_router
from .api.instances import router as instances_router
from .database import Base, engine, SessionLocal, ensure_schema
from .models import Instance
from .services.instance_manager import InstanceManager

app = FastAPI(title="TestiBot Backend")

app.include_router(auth_router)
app.include_router(instances_router)

STATIC_DIR = Path(__file__).resolve().parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/login", include_in_schema=False)
def login():
    return FileResponse(STATIC_DIR / "login.html")


@app.get("/register", include_in_schema=False)
def register():
    return FileResponse(STATIC_DIR / "register.html")


@app.get("/app", include_in_schema=False)
def app_view():
    return FileResponse(STATIC_DIR / "index.html")


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    ensure_schema()
    db = SessionLocal()
    try:
        manager = InstanceManager(db)
        instances = db.query(Instance).all()
        for instance in instances:
            manager.start_instance(instance)
    finally:
        db.close()
