import uuid
from datetime import datetime, timezone

from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session, joinedload

from app.models.note import Note
from app.models.note_ai_summary import NoteAISummary
from app.models.user import User


class NoteRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(
        self,
        *,
        user_id: uuid.UUID,
        source_url: str,
        source_url_normalized: str,
        source_domain: str,
        source_title: str | None,
        note_body_md: str,
        visibility: str,
    ) -> Note:
        note = Note(
            user_id=user_id,
            source_url=source_url,
            source_url_normalized=source_url_normalized,
            source_domain=source_domain,
            source_title=source_title,
            note_body_md=note_body_md,
            visibility=visibility,
            analysis_status="pending",
        )
        self.db.add(note)
        self.db.flush()
        return note

    def get_by_user_and_normalized_url(self, *, user_id: uuid.UUID, normalized_url: str) -> Note | None:
        stmt = select(Note).where(
            Note.user_id == user_id,
            Note.source_url_normalized == normalized_url,
            Note.is_deleted.is_(False),
        )
        return self.db.scalar(stmt)

    def get_by_id_for_user(self, *, note_id: uuid.UUID, user_id: uuid.UUID) -> Note | None:
        stmt = select(Note).where(Note.id == note_id, Note.user_id == user_id, Note.is_deleted.is_(False))
        return self.db.scalar(stmt)

    def get_public_by_id(self, note_id: uuid.UUID) -> Note | None:
        stmt = (
            select(Note)
            .join(User, Note.user_id == User.id)
            .where(
                Note.id == note_id,
                Note.visibility == "public",
                Note.is_deleted.is_(False),
                User.is_deleted.is_(False),
            )
            .options(joinedload(Note.user))
        )
        return self.db.scalar(stmt)

    def get_by_id_for_admin(self, note_id: uuid.UUID, *, include_deleted: bool = True) -> Note | None:
        stmt = (
            select(Note)
            .join(User, Note.user_id == User.id)
            .where(Note.id == note_id)
            .options(joinedload(Note.user))
        )
        if not include_deleted:
            stmt = stmt.where(Note.is_deleted.is_(False))
        return self.db.scalar(stmt)

    def list_for_user(
        self,
        *,
        user_id: uuid.UUID,
        status: str | None,
        visibility: str | None,
        keyword: str | None,
        offset: int,
        limit: int,
    ) -> list[Note]:
        stmt = select(Note).where(Note.user_id == user_id, Note.is_deleted.is_(False))

        if status:
            stmt = stmt.where(Note.analysis_status == status)
        if visibility:
            stmt = stmt.where(Note.visibility == visibility)
        if keyword:
            like = f"%{keyword}%"
            stmt = stmt.where(
                or_(
                    Note.source_title.ilike(like),
                    Note.source_url.ilike(like),
                    Note.source_url_normalized.ilike(like),
                    Note.note_body_md.ilike(like),
                )
            )

        stmt = stmt.order_by(Note.updated_at.desc()).offset(offset).limit(limit)
        return list(self.db.scalars(stmt))

    def list_for_admin(
        self,
        *,
        status: str | None,
        visibility: str | None,
        deleted: bool | None,
        owner_user_id: str | None,
        keyword: str | None,
        offset: int,
        limit: int,
    ) -> list[Note]:
        stmt = select(Note).join(User, Note.user_id == User.id).options(joinedload(Note.user))

        if status:
            stmt = stmt.where(Note.analysis_status == status)
        if visibility:
            stmt = stmt.where(Note.visibility == visibility)
        if deleted is not None:
            stmt = stmt.where(Note.is_deleted.is_(deleted))
        if owner_user_id:
            stmt = stmt.where(User.user_id == owner_user_id)

        if keyword:
            like = f"%{keyword}%"
            stmt = stmt.where(
                or_(
                    User.user_id.ilike(like),
                    User.email.ilike(like),
                    Note.source_title.ilike(like),
                    Note.source_url.ilike(like),
                    Note.source_url_normalized.ilike(like),
                    Note.note_body_md.ilike(like),
                )
            )

        stmt = stmt.order_by(Note.updated_at.desc()).offset(offset).limit(limit)
        return list(self.db.scalars(stmt))

    def save(self, note: Note) -> Note:
        self.db.add(note)
        self.db.flush()
        return note

    def soft_delete(self, note: Note) -> Note:
        now = datetime.now(timezone.utc)
        note.is_deleted = True
        note.deleted_at = now
        note.updated_at = now
        self.db.add(note)
        self.db.flush()
        return note

    def restore(self, note: Note) -> Note:
        now = datetime.now(timezone.utc)
        note.is_deleted = False
        note.deleted_at = None
        note.updated_at = now
        self.db.add(note)
        self.db.flush()
        return note

    def soft_delete_for_user(self, user_id: uuid.UUID) -> None:
        now = datetime.now(timezone.utc)
        stmt = (
            update(Note)
            .where(Note.user_id == user_id, Note.is_deleted.is_(False))
            .values(is_deleted=True, deleted_at=now, updated_at=now)
        )
        self.db.execute(stmt)

    def create_summary(
        self,
        *,
        note_id: uuid.UUID,
        status: str,
        summary_text: str | None,
        key_points: list[str] | None,
        model_provider: str | None,
        model_name: str | None,
        model_version: str | None,
        error_message: str | None,
    ) -> NoteAISummary:
        summary = NoteAISummary(
            note_id=note_id,
            status=status,
            summary_text=summary_text,
            key_points_json=key_points,
            model_provider=model_provider,
            model_name=model_name,
            model_version=model_version,
            error_message=error_message,
        )
        self.db.add(summary)
        self.db.flush()
        return summary

    def get_latest_summary(self, note_id: uuid.UUID) -> NoteAISummary | None:
        stmt = (
            select(NoteAISummary)
            .where(NoteAISummary.note_id == note_id)
            .order_by(NoteAISummary.analyzed_at.desc(), NoteAISummary.created_at.desc())
            .limit(1)
        )
        return self.db.scalar(stmt)
