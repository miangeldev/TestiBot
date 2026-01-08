from pathlib import Path

from ..database import DATA_DIR
from .process_manager import ProcessManager

REPO_ROOT = Path(__file__).resolve().parents[3]
MAIN_PID_PATH = DATA_DIR / "main.pid"
MAIN_ENV_PATH = REPO_ROOT / ".env"
MAIN_COMMAND = ["node", "index.js", "--main"]


class MainManager:
    def __init__(self, process_manager: ProcessManager | None = None) -> None:
        self.process_manager = process_manager or ProcessManager()

    def status(self) -> dict[str, int | bool | None]:
        pid = self._read_pid()
        if pid and not self.process_manager.is_running(pid):
            self._clear_pid()
            pid = None
        return {"running": bool(pid), "pid": pid}

    def start(self) -> dict[str, int | bool | None]:
        status = self.status()
        if status["running"]:
            return status
        process = self.process_manager.start_process(
            MAIN_COMMAND,
            cwd=REPO_ROOT,
            env_path=MAIN_ENV_PATH,
            env_overrides={"BACKEND_DISABLED": "1"},
        )
        self._write_pid(process.pid)
        return {"running": True, "pid": process.pid}

    def stop(self) -> dict[str, int | bool | None]:
        pid = self._read_pid()
        if pid:
            self.process_manager.stop_process(pid)
        self._clear_pid()
        return {"running": False, "pid": None}

    def _read_pid(self) -> int | None:
        if not MAIN_PID_PATH.exists():
            return None
        try:
            return int(MAIN_PID_PATH.read_text(encoding="utf-8").strip())
        except ValueError:
            self._clear_pid()
            return None

    def _write_pid(self, pid: int) -> None:
        MAIN_PID_PATH.parent.mkdir(parents=True, exist_ok=True)
        MAIN_PID_PATH.write_text(str(pid), encoding="utf-8")

    def _clear_pid(self) -> None:
        if MAIN_PID_PATH.exists():
            MAIN_PID_PATH.unlink()
