from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Instance(Base):
    __tablename__ = "instances"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, unique=True, index=True)
    status: Mapped[str] = mapped_column(String, default="stopped")
    path: Mapped[str] = mapped_column(String)
    env_path: Mapped[str] = mapped_column(String)
    version: Mapped[str | None] = mapped_column(String, nullable=True)
    port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pid: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
