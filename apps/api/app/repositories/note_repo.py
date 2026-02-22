import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session, joinedload

from app.models.note import Note
from app.models.note_ai_summary import NoteAISummary
from app.models.user import User
from app.models.user_bookmark import UserBookmark
from app.models.user_like import UserLike


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
        tags: list[str],
        note_body_md: str,
        visibility: str,
    ) -> Note:
        note = Note(
            user_id=user_id,
            source_url=source_url,
            source_url_normalized=source_url_normalized,
            source_domain=source_domain,
            source_title=source_title,
            tags_json=tags,
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

    def get_by_id(self, note_id: uuid.UUID) -> Note | None:
        stmt = select(Note).where(Note.id == note_id, Note.is_deleted.is_(False))
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

    def get_note_interaction_stats(self, note_ids: list[uuid.UUID]) -> dict[uuid.UUID, dict[str, int]]:
        if not note_ids:
            return {}

        stats: dict[uuid.UUID, dict[str, int]] = {
            note_id: {"like_count": 0, "bookmark_count": 0}
            for note_id in note_ids
        }

        like_stmt = (
            select(UserLike.note_id, func.count(UserLike.id))
            .where(UserLike.note_id.in_(note_ids))
            .group_by(UserLike.note_id)
        )
        for note_id, count in self.db.execute(like_stmt):
            if note_id is not None:
                stats[note_id]["like_count"] = int(count)

        bookmark_stmt = (
            select(UserBookmark.note_id, func.count(UserBookmark.id))
            .where(UserBookmark.note_id.in_(note_ids))
            .group_by(UserBookmark.note_id)
        )
        for note_id, count in self.db.execute(bookmark_stmt):
            if note_id is not None:
                stats[note_id]["bookmark_count"] = int(count)

        return stats

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
        source_language: str | None,
        output_title: str | None,
        output_title_zh: str | None,
        published_at: datetime | None,
        output_summary: str | None,
        output_summary_zh: str | None,
        output_tags: list[str] | None,
        output_tags_zh: list[str] | None,
        summary_text: str | None,
        summary_text_zh: str | None,
        model_provider: str | None,
        model_name: str | None,
        model_version: str | None,
        prompt_version: str | None,
        input_tokens: int | None,
        output_tokens: int | None,
        estimated_cost_usd: Decimal | None,
        raw_response_json: dict | None,
        error_code: str | None,
        error_message: str | None,
        error_stage: str | None,
        error_class: str | None,
        retryable: bool | None,
        elapsed_ms: int | None,
    ) -> NoteAISummary:
        summary = NoteAISummary(
            note_id=note_id,
            status=status,
            source_language=source_language,
            output_title=output_title,
            output_title_zh=output_title_zh,
            published_at=published_at,
            output_summary=output_summary,
            output_summary_zh=output_summary_zh,
            output_tags_json=output_tags,
            output_tags_zh_json=output_tags_zh,
            summary_text=summary_text,
            summary_text_zh=summary_text_zh,
            model_provider=model_provider,
            model_name=model_name,
            model_version=model_version,
            prompt_version=prompt_version,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            estimated_cost_usd=estimated_cost_usd,
            raw_response_json=raw_response_json,
            error_code=error_code,
            error_message=error_message,
            error_stage=error_stage,
            error_class=error_class,
            retryable=retryable,
            elapsed_ms=elapsed_ms,
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
