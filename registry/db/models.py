from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    github_id: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False)
    username: Mapped[str] = mapped_column(Text, nullable=False)
    avatar_url: Mapped[str] = mapped_column(Text, default="")
    access_level: Mapped[str] = mapped_column(Text, default="user")
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    github_access_token_enc: Mapped[str] = mapped_column(Text, default="")

    roles: Mapped[list["RegistryRole"]] = relationship(back_populates="owner")


class RegistryRole(Base):
    __tablename__ = "registry_roles"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    owner_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    download_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at = mapped_column(DateTime(timezone=True), onupdate=func.now())

    owner: Mapped["User"] = relationship(back_populates="roles")
    versions: Mapped[list["RoleVersion"]] = relationship(
        back_populates="role", cascade="all, delete-orphan", order_by="RoleVersion.version_number.desc()"
    )


class RoleVersion(Base):
    __tablename__ = "role_versions"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    role_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("registry_roles.id", ondelete="CASCADE"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    racksmith_version: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    platforms: Mapped[list] = mapped_column(JSONB, default=list)
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    inputs: Mapped[list] = mapped_column(JSONB, default=list)
    tasks_yaml: Mapped[str] = mapped_column(Text, default="")
    defaults_yaml: Mapped[str] = mapped_column(Text, default="")
    meta_yaml: Mapped[str] = mapped_column(Text, default="")
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())

    role: Mapped["RegistryRole"] = relationship(back_populates="versions")

    __table_args__ = (UniqueConstraint("role_id", "version_number"),)
