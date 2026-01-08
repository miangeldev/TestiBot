from datetime import datetime
from pathlib import Path
from typing import Iterable

from sqlalchemy.orm import Session

from ..models import Instance
from ..schemas import InstanceCreate
from .git_manager import clone_repo
from .process_manager import ProcessManager

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_INSTANCES_DIR = REPO_ROOT / "instances"
DEFAULT_START_COMMAND = ["node", "index.js"]


class InstanceManager:
    def __init__(self, db: Session, process_manager: ProcessManager | None = None) -> None:
        self.db = db
        self.process_manager = process_manager or ProcessManager()

    def list_instances(self) -> Iterable[Instance]:
        return self.db.query(Instance).all()

    def create_instance(self, payload: InstanceCreate) -> Instance:
        instances_dir = DEFAULT_INSTANCES_DIR
        instance_path = instances_dir / payload.name
        env_path = instance_path / ".env"

        clone_repo(payload.repo_url, instance_path, payload.version)
        self._write_env(env_path, payload)

        instance = Instance(
            name=payload.name,
            status="stopped",
            path=str(instance_path),
            env_path=str(env_path),
            version=payload.version,
            port=payload.port,
            updated_at=datetime.utcnow(),
        )
        self.db.add(instance)
        self.db.commit()
        self.db.refresh(instance)
        return instance

    def start_instance(self, instance: Instance) -> Instance:
        process = self.process_manager.start_process(
            DEFAULT_START_COMMAND,
            cwd=Path(instance.path),
            env_path=Path(instance.env_path),
        )
        instance.pid = process.pid
        instance.status = "running"
        instance.last_started_at = datetime.utcnow()
        instance.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(instance)
        return instance

    def stop_instance(self, instance: Instance) -> Instance:
        if instance.pid:
            self.process_manager.stop_process(instance.pid)
        instance.status = "stopped"
        instance.pid = None
        instance.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(instance)
        return instance

    def _write_env(self, env_path: Path, payload: InstanceCreate) -> None:
        env_lines = [
            f"INSTANCE_NAME={payload.name}",
            f"INSTANCE_VERSION={payload.version or ''}",
        ]
        if payload.port:
            env_lines.append(f"PORT={payload.port}")
        env_path.write_text("\n".join(env_lines) + "\n", encoding="utf-8")
