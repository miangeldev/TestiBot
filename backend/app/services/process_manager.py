import os
import subprocess
from pathlib import Path


class ProcessManager:
    def __init__(self, base_env: dict[str, str] | None = None) -> None:
        self.base_env = base_env or {}

    def start_process(
        self,
        command: list[str],
        cwd: Path,
        env_path: Path,
        env_overrides: dict[str, str] | None = None,
    ) -> subprocess.Popen:
        env = os.environ.copy()
        env.update(self.base_env)
        env["ENV_PATH"] = str(env_path)
        env["INSTANCE_PATH"] = str(cwd)
        env["QR_PATH"] = str(cwd / "qr.txt")
        if env_overrides:
            env.update(env_overrides)
        process = subprocess.Popen(command, cwd=str(cwd), env=env)
        return process

    def stop_process(self, pid: int) -> None:
        try:
            os.kill(pid, 15)
        except ProcessLookupError:
            return

    def is_running(self, pid: int) -> bool:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return False
        except PermissionError:
            return True
        return True
