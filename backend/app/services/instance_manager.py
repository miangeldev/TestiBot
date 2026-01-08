from datetime import datetime
from pathlib import Path
from typing import Iterable

from sqlalchemy.orm import Session

from ..models import Instance
from ..schemas import InstanceCreate, InstanceUpdate
from .git_manager import clone_repo, update_repo
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
        self._write_env(env_path, payload.name, payload.version, payload.port)

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
        if instance.pid:
            if self.process_manager.is_running(instance.pid):
                if instance.status != "running":
                    instance.status = "running"
                    instance.updated_at = datetime.utcnow()
                    self.db.commit()
                    self.db.refresh(instance)
                return instance
            instance.pid = None

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

    def update_instance(self, instance: Instance, payload: InstanceUpdate) -> Instance:
        if payload.status and payload.status not in ("running", "stopped"):
            raise ValueError(f"Invalid status: {payload.status}")
        desired_status = payload.status or instance.status
        version_changed = payload.version is not None and payload.version != instance.version
        port_changed = payload.port is not None and payload.port != instance.port
        changed = version_changed or port_changed

        if not changed:
            if desired_status == "running" and instance.status != "running":
                return self.start_instance(instance)
            if desired_status == "stopped" and instance.status == "running":
                return self.stop_instance(instance)
            return instance

        if instance.status == "running":
            self.stop_instance(instance)

        if version_changed:
            update_repo(Path(instance.path), payload.version)
            instance.version = payload.version

        if port_changed:
            instance.port = payload.port

        self._write_env(Path(instance.env_path), instance.name, instance.version, instance.port)
        instance.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(instance)

        if desired_status == "running":
            return self.start_instance(instance)

        return instance

    def _write_env(self, env_path: Path, name: str, version: str | None, port: int | None) -> None:
        env_lines = [
            f"INSTANCE={name}",
            f"INSTANCE_NAME={name}",
            f"INSTANCE_VERSION={version or ''}",
        ]
        if port is not None:
            env_lines.append(f"PORT={port}")
        env_path.write_text("\n".join(env_lines) + "\n", encoding="utf-8")
