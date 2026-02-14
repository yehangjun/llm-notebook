import uuid

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.note import Note
from app.models.note_ai_summary import NoteAISummary


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
        )
        return self.db.scalar(stmt)

    def get_by_id_for_user(self, *, note_id: uuid.UUID, user_id: uuid.UUID) -> Note | None:
        stmt = select(Note).where(Note.id == note_id, Note.user_id == user_id)
        return self.db.scalar(stmt)

    def get_public_by_id(self, note_id: uuid.UUID) -> Note | None:
        stmt = select(Note).where(Note.id == note_id, Note.visibility == "public")
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
        stmt = select(Note).where(Note.user_id == user_id)

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
                    Note.note_body_md.ilike(like),
                )
            )

        stmt = stmt.order_by(Note.updated_at.desc()).offset(offset).limit(limit)
        return list(self.db.scalars(stmt))

    def save(self, note: Note) -> Note:
        self.db.add(note)
        self.db.flush()
        return note

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
