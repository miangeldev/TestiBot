from pathlib import Path
import subprocess


def clone_repo(repo_url: str, destination: Path, version: str | None = None) -> None:
    if destination.exists():
        raise FileExistsError(f"Destination already exists: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "clone", repo_url, str(destination)], check=True)
    if version:
        subprocess.run(["git", "checkout", version], check=True, cwd=str(destination))
