import os
import subprocess
from pathlib import Path


class ProcessManager:
    def __init__(self, base_env: dict[str, str] | None = None) -> None:
        self.base_env = base_env or {}

    def start_process(self, command: list[str], cwd: Path, env_path: Path) -> subprocess.Popen:
        env = os.environ.copy()
        env.update(self.base_env)
        env["ENV_PATH"] = str(env_path)
        process = subprocess.Popen(command, cwd=str(cwd), env=env)
        return process

    def stop_process(self, pid: int) -> None:
        try:
            os.kill(pid, 15)
        except ProcessLookupError:
            return
