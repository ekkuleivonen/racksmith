from datetime import datetime
from uuid import uuid4

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR, UUID
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
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    github_access_token_enc: Mapped[str] = mapped_column(Text, default="")
    refresh_token_hash: Mapped[str | None] = mapped_column(Text, nullable=True)

    roles: Mapped[list["RegistryRole"]] = relationship(back_populates="owner")
    playbooks: Mapped[list["RegistryPlaybook"]] = relationship(back_populates="owner")


class RegistryRole(Base):
    __tablename__ = "registry_roles"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    owner_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    owner: Mapped["User"] = relationship(back_populates="roles")
    versions: Mapped[list["RoleVersion"]] = relationship(
        back_populates="role", cascade="all, delete-orphan", order_by="RoleVersion.version_number.desc()"
    )
    download_events: Mapped[list["DownloadEvent"]] = relationship(
        back_populates="role", cascade="all, delete-orphan",
        primaryjoin="RegistryRole.id == DownloadEvent.role_id",
    )


class RoleVersion(Base):
    __tablename__ = "role_versions"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    role_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("registry_roles.id", ondelete="CASCADE"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    platforms: Mapped[list] = mapped_column(JSONB, default=list)
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    inputs: Mapped[list] = mapped_column(JSONB, default=list)
    tasks_yaml: Mapped[str] = mapped_column(Text, default="")
    defaults_yaml: Mapped[str] = mapped_column(Text, default="")
    meta_yaml: Mapped[str] = mapped_column(Text, default="")
    search_vector: Mapped[str | None] = mapped_column(TSVECTOR, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())

    role: Mapped["RegistryRole"] = relationship(back_populates="versions")

    __table_args__ = (UniqueConstraint("role_id", "version_number"),)


class RegistryPlaybook(Base):
    __tablename__ = "registry_playbooks"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    owner_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    owner: Mapped["User"] = relationship(back_populates="playbooks")
    versions: Mapped[list["PlaybookVersion"]] = relationship(
        back_populates="playbook", cascade="all, delete-orphan", order_by="PlaybookVersion.version_number.desc()"
    )
    download_events: Mapped[list["DownloadEvent"]] = relationship(
        back_populates="playbook", cascade="all, delete-orphan",
        primaryjoin="RegistryPlaybook.id == DownloadEvent.playbook_id",
    )


class PlaybookVersion(Base):
    __tablename__ = "playbook_versions"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    playbook_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("registry_playbooks.id", ondelete="CASCADE"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    become: Mapped[bool] = mapped_column(Boolean, default=False)
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    search_vector: Mapped[str | None] = mapped_column(TSVECTOR, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())

    playbook: Mapped["RegistryPlaybook"] = relationship(back_populates="versions")
    role_entries: Mapped[list["PlaybookVersionRole"]] = relationship(
        back_populates="playbook_version", cascade="all, delete-orphan",
        order_by="PlaybookVersionRole.position",
    )

    __table_args__ = (UniqueConstraint("playbook_id", "version_number"),)


class PlaybookVersionRole(Base):
    """Normalized join between a playbook version and the roles it uses."""
    __tablename__ = "playbook_version_roles"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    playbook_version_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("playbook_versions.id", ondelete="CASCADE"), nullable=False
    )
    role_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("registry_roles.id", ondelete="RESTRICT"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    vars: Mapped[dict] = mapped_column(JSONB, default=dict)

    playbook_version: Mapped["PlaybookVersion"] = relationship(back_populates="role_entries")
    role: Mapped["RegistryRole"] = relationship()

    __table_args__ = (UniqueConstraint("playbook_version_id", "position"),)


class DownloadEvent(Base):
    """One row per download attempt; confirmed=true after client writes successfully."""
    __tablename__ = "download_events"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    role_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("registry_roles.id", ondelete="CASCADE"), nullable=True
    )
    playbook_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("registry_playbooks.id", ondelete="CASCADE"), nullable=True
    )
    racksmith_version: Mapped[str] = mapped_column(Text, default="")
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())

    role: Mapped["RegistryRole | None"] = relationship(back_populates="download_events", foreign_keys=[role_id])
    playbook: Mapped["RegistryPlaybook | None"] = relationship(back_populates="download_events", foreign_keys=[playbook_id])

    __table_args__ = (
        CheckConstraint(
            "(role_id IS NOT NULL AND playbook_id IS NULL) OR (role_id IS NULL AND playbook_id IS NOT NULL)",
            name="ck_download_events_one_target",
        ),
    )
