from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Instance
from ..schemas import InstanceCreate, InstanceOut, InstanceUpdate
from ..services.instance_manager import InstanceManager

router = APIRouter(prefix="/instances", tags=["instances"])
REPO_ROOT = Path(__file__).resolve().parents[3]


@router.get("/", response_model=list[InstanceOut])
def list_instances(db: Session = Depends(get_db)):
    manager = InstanceManager(db)
    return list(manager.list_instances())


@router.post("/", response_model=InstanceOut)
def create_instance(payload: InstanceCreate, db: Session = Depends(get_db)):
    manager = InstanceManager(db)
    try:
        return manager.create_instance(payload)
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/{instance_id}", response_model=InstanceOut)
def update_instance(instance_id: int, payload: InstanceUpdate, db: Session = Depends(get_db)):
    instance = db.query(Instance).get(instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
    manager = InstanceManager(db)
    try:
        return manager.update_instance(instance, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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

@router.get("/main/qr")
def get_main_qr():
    qr_path = REPO_ROOT / "qr.txt"
    return _read_qr(qr_path)


@router.get("/{instance_id}/qr")
def get_instance_qr(instance_id: int, db: Session = Depends(get_db)):
    instance = db.query(Instance).get(instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
    qr_path = Path(instance.path) / "qr.txt"
    return _read_qr(qr_path)


def _read_qr(qr_path: Path):
    if not qr_path.exists():
        return Response(status_code=204)
    qr_value = qr_path.read_text(encoding="utf-8").strip()
    if not qr_value:
        return Response(status_code=204)
    return {"qr": qr_value}
