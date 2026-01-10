from datetime import datetime

from pydantic import BaseModel, Field


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


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=6, max_length=128)


class UserOut(BaseModel):
    id: int
    username: str
    created_at: datetime

    class Config:
        from_attributes = True


class TokenOut(BaseModel):
    access_token: str
    token_type: str
