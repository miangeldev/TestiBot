import shutil
import subprocess
from pathlib import Path


def clone_repo(repo_url: str, destination: Path, version: str | None = None) -> None:
    if destination.exists():
        raise FileExistsError(f"Destination already exists: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(["git", "clone", repo_url, str(destination)], check=True)
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"Failed to clone repo: {repo_url}") from exc
    if version:
        try:
            subprocess.run(["git", "checkout", version], check=True, cwd=str(destination))
        except subprocess.CalledProcessError as exc:
            raise ValueError(f"Version not found: {version}") from exc
    if _is_local_repo(repo_url) and not version:
        _apply_worktree_overrides(Path(repo_url).expanduser().resolve(), destination)


def update_repo(destination: Path, version: str | None = None) -> None:
    if not destination.exists():
        raise FileNotFoundError(f"Destination does not exist: {destination}")
    subprocess.run(["git", "fetch", "--all", "--tags"], check=True, cwd=str(destination))
    if version:
        try:
            subprocess.run(["git", "checkout", version], check=True, cwd=str(destination))
        except subprocess.CalledProcessError as exc:
            raise ValueError(f"Version not found: {version}") from exc
    else:
        subprocess.run(["git", "pull", "--ff-only"], check=True, cwd=str(destination))


def _is_local_repo(repo_url: str) -> bool:
    source = Path(repo_url).expanduser().resolve()
    return source.exists() and (source / ".git").exists()


def _apply_worktree_overrides(source: Path, destination: Path) -> None:
    status = subprocess.check_output(
        ["git", "status", "--porcelain"],
        cwd=str(source),
        text=True,
    )
    if status.strip():
        diff = subprocess.check_output(
            ["git", "diff", "--binary"],
            cwd=str(source),
        )
        if diff:
            subprocess.run(
                ["git", "apply", "--binary"],
                check=True,
                cwd=str(destination),
                input=diff,
            )

    untracked = subprocess.check_output(
        ["git", "ls-files", "--others", "--exclude-standard"],
        cwd=str(source),
        text=True,
    )
    for rel_path in filter(None, untracked.splitlines()):
        if _should_skip_untracked(rel_path):
            continue
        src = source / rel_path
        dst = destination / rel_path
        if src.is_dir():
            shutil.copytree(src, dst, dirs_exist_ok=True)
        else:
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)


def _should_skip_untracked(rel_path: str) -> bool:
    parts = Path(rel_path).parts
    if not parts:
        return True
    ignored_roots = {
        ".venv",
        "node_modules",
        "instances",
        "auth_info",
        "__pycache__",
    }
    if parts[0] in ignored_roots:
        return True
    if parts[0:3] == ("backend", "app", "data"):
        return True
    return False
