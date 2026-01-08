from datetime import datetime

from pydantic import BaseModel


class InstanceBase(BaseModel):
    name: str
    version: str | None = None
    port: int | None = None


class InstanceCreate(InstanceBase):
    repo_url: str


class InstanceUpdate(BaseModel):
    status: str | None = None
    version: str | None = None
    port: int | None = None


class InstanceOut(InstanceBase):
    id: int
    status: str
    path: str
    env_path: str
    pid: int | None
    wa_number: str | None = None
    created_at: datetime
    updated_at: datetime
    last_started_at: datetime | None

    class Config:
        from_attributes = True
