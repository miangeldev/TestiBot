from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api.instances import router as instances_router
from .database import Base, engine, SessionLocal
from .models import Instance
from .services.instance_manager import InstanceManager

app = FastAPI(title="TestiBot Backend")

app.include_router(instances_router)

STATIC_DIR = Path(__file__).resolve().parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        manager = InstanceManager(db)
        instances = db.query(Instance).all()
        for instance in instances:
            manager.start_instance(instance)
    finally:
        db.close()
