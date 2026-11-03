"""
Test configuration, fixtures, and database isolation.
Uses an in-memory async SQLite engine with foreign keys enabled.
"""

import os
os.environ["DEBUG"] = "false"
# Tests never reach external services, whatever the developer's local .env says.
os.environ["PUSH_NOTIFICATIONS_ENABLED"] = "false"
os.environ["REQUIRE_EMAIL_VERIFICATION"] = "false"
os.environ["SSLCOMMERZ_STORE_ID"] = ""
os.environ["SSLCOMMERZ_STORE_PASSWORD"] = ""
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_ANON_KEY"] = ""
from collections.abc import AsyncGenerator
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import get_db
from app.main import create_app
from app.models.base import Base

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
)

# Enable foreign keys for SQLite
@event.listens_for(test_engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

TestingSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


@pytest.fixture(scope="session", autouse=True)
async def setup_test_database():
    """Create all database schema tables once for the test session."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture(autouse=True)
async def clean_tables():
    """Ensure database tables are cleaned before each test execution."""
    async with test_engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(table.delete())


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Provide an isolated database session per test."""
    async with TestingSessionLocal() as session:
        yield session


@pytest.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Test HTTP client with overridden get_db dependency."""
    app = create_app()

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def owner_tokens(client: AsyncClient, db_session: AsyncSession) -> dict:
    """Register and log in an owner user who is a verified publisher with one channel."""
    reg = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "owneruser",
            "email": "owner@example.com",
            "password": "Password123!",
        },
    )
    assert reg.status_code == 201

    from app.models import User
    from app.models.platform import Channel
    import uuid
    owner = await db_session.get(User, uuid.UUID(reg.json()["id"]))
    owner.publisher_status = "active"
    channel = Channel(owner_id=owner.id, name="Owner channel")
    db_session.add(channel)
    await db_session.commit()
    login = await client.post(
        "/api/v1/auth/login",
        json={"username_or_email": "owner@example.com", "password": "Password123!"},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]
    return {
        "headers": {"Authorization": f"Bearer {token}"},
        "user": reg.json(),
        "channel_id": str(channel.id),
    }


@pytest.fixture
async def other_tokens(client: AsyncClient) -> dict:
    """Register and log in a secondary (non-owner) user."""
    reg = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "otheruser",
            "email": "other@example.com",
            "password": "Password123!",
        },
    )
    assert reg.status_code == 201

    login = await client.post(
        "/api/v1/auth/login",
        json={"username_or_email": "other@example.com", "password": "Password123!"},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]
    return {
        "headers": {"Authorization": f"Bearer {token}"},
        "user": reg.json(),
    }
