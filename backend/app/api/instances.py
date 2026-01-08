from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Instance
from ..schemas import InstanceCreate, InstanceOut
from ..services.instance_manager import InstanceManager

router = APIRouter(prefix="/instances", tags=["instances"])


@router.get("/", response_model=list[InstanceOut])
def list_instances(db: Session = Depends(get_db)):
    manager = InstanceManager(db)
    return list(manager.list_instances())


@router.post("/", response_model=InstanceOut)
def create_instance(payload: InstanceCreate, db: Session = Depends(get_db)):
    manager = InstanceManager(db)
    return manager.create_instance(payload)


@router.post("/{instance_id}/start", response_model=InstanceOut)
def start_instance(instance_id: int, db: Session = Depends(get_db)):
    instance = db.query(Instance).get(instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
    manager = InstanceManager(db)
    return manager.start_instance(instance)


@router.post("/{instance_id}/stop", response_model=InstanceOut)
def stop_instance(instance_id: int, db: Session = Depends(get_db)):
    instance = db.query(Instance).get(instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
    manager = InstanceManager(db)
    return manager.stop_instance(instance)
