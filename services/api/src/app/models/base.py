from __future__ import annotations

from datetime import datetime

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

metadata = MetaData(schema="public")


class Base(DeclarativeBase):
    metadata = metadata


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)
