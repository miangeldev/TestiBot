from fastapi import FastAPI

from .api.instances import router as instances_router
from .database import Base, engine, SessionLocal
from .models import Instance
from .services.instance_manager import InstanceManager

app = FastAPI(title="TestiBot Backend")

app.include_router(instances_router)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        manager = InstanceManager(db)
        running_instances = (
            db.query(Instance).filter(Instance.status == "running").all()
        )
        for instance in running_instances:
            manager.start_instance(instance)
    finally:
        db.close()
