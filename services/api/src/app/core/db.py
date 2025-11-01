from __future__ import annotations

from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

ASYNC_DB_URL = settings.database_url.replace("postgresql://", "postgresql+asyncpg://")

engine = create_async_engine(ASYNC_DB_URL, echo=False, future=True)
SessionLocal = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


@asynccontextmanager
async def get_session() -> AsyncSession:
    session: AsyncSession = SessionLocal()
    try:
        yield session
        await session.commit()
    except Exception:  # pragma: no cover - thin wrapper
        await session.rollback()
        raise
    finally:
        await session.close()
