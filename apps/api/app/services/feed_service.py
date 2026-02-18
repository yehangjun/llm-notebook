from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session, joinedload

from app.models.aggregate_item import AggregateItem
from app.models.note import Note
from app.models.source_creator import SourceCreator
from app.models.user import User
from app.models.user_bookmark import UserBookmark
from app.models.user_follow import UserFollow
from app.models.user_like import UserLike
from app.repositories.note_repo import NoteRepository
from app.schemas.feed import FeedDetailResponse, FeedItem, FeedListResponse

FEED_SCOPE_ALL = "all"
FEED_SCOPE_FOLLOWING = "following"
FEED_SCOPE_UNFOLLOWED = "unfollowed"
ALLOWED_FEED_SCOPES = {FEED_SCOPE_ALL, FEED_SCOPE_FOLLOWING, FEED_SCOPE_UNFOLLOWED}


@dataclass
class InteractionStats:
    like_count: int
    bookmark_count: int
    liked: bool
    bookmarked: bool


class FeedService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.note_repo = NoteRepository(db)

    def list_feed(
        self,
        *,
        user: User,
        scope: str | None,
        tag: str | None,
        keyword: str | None,
        offset: int,
        limit: int,
    ) -> FeedListResponse:
        scope_value = self._normalize_scope(scope)
        tag_value = self._normalize_tag(tag)
        keyword_value = self._normalize_keyword(keyword)

        followed_user_ids, followed_source_ids = self._load_following_sets(user.id)
        prefer_zh = self._prefer_zh_ui(user.ui_language)

        fetch_limit = max(limit + offset + 120, 240)
        notes = self._load_public_notes(fetch_limit=fetch_limit)
        aggregates = self._load_aggregate_items(fetch_limit=fetch_limit)

        mixed: list[tuple[str, Note | AggregateItem]] = []
        for note in notes:
            if note.user_id == user.id:
                continue
            if tag_value and tag_value not in (note.tags_json or []):
                continue
            creator_name = self._creator_name_for_note(note)
            if keyword_value and not self._match_keyword(
                keyword=keyword_value,
                source_title=note.source_title,
                source_url=note.source_url_normalized,
                source_domain=note.source_domain,
                creator_name=creator_name,
                summary_text=note.note_body_md,
            ):
                continue
            if not self._match_scope(
                scope=scope_value,
                target_id=note.user_id,
                followed_ids=followed_user_ids,
            ):
                continue
            mixed.append(("note", note))

        for aggregate in aggregates:
            if tag_value and tag_value not in (aggregate.tags_json or []):
                continue
            creator_name = aggregate.source_creator.display_name if aggregate.source_creator else None
            if keyword_value and not self._match_keyword(
                keyword=keyword_value,
                source_title=self._combine_for_search(aggregate.source_title, aggregate.source_title_zh),
                source_url=aggregate.source_url_normalized,
                source_domain=aggregate.source_domain,
                creator_name=creator_name,
                summary_text=self._combine_for_search(aggregate.summary_text, aggregate.summary_text_zh),
            ):
                continue
            if not self._match_scope(
                scope=scope_value,
                target_id=aggregate.source_creator_id,
                followed_ids=followed_source_ids,
            ):
                continue
            mixed.append(("aggregate", aggregate))

        mixed.sort(key=lambda item: item[1].updated_at, reverse=True)
        picked = mixed[offset : offset + limit]
        return FeedListResponse(
            items=self._build_items_for_records(
                user=user,
                records=picked,
                followed_user_ids=followed_user_ids,
                followed_source_ids=followed_source_ids,
                prefer_zh=prefer_zh,
            )
        )

    def list_bookmarks(self, *, user: User, offset: int, limit: int) -> FeedListResponse:
        bookmarks = list(
            self.db.scalars(
                select(UserBookmark)
                .where(UserBookmark.user_id == user.id)
                .order_by(UserBookmark.created_at.desc())
                .offset(offset)
                .limit(limit)
            )
        )
        if not bookmarks:
            return FeedListResponse(items=[])

        note_ids = [bookmark.note_id for bookmark in bookmarks if bookmark.note_id]
        aggregate_ids = [bookmark.aggregate_item_id for bookmark in bookmarks if bookmark.aggregate_item_id]

        note_map: dict[UUID, Note] = {}
        if note_ids:
            for note in self.db.scalars(
                select(Note)
                .join(User, User.id == Note.user_id)
                .options(joinedload(Note.user))
                .where(
                    Note.id.in_(note_ids),
                    Note.visibility == "public",
                    Note.is_deleted.is_(False),
                    User.is_deleted.is_(False),
                )
            ):
                note_map[note.id] = note

        aggregate_map: dict[UUID, AggregateItem] = {}
        if aggregate_ids:
            for aggregate in self.db.scalars(
                select(AggregateItem)
                .join(SourceCreator, SourceCreator.id == AggregateItem.source_creator_id)
                .options(joinedload(AggregateItem.source_creator))
                .where(
                    AggregateItem.id.in_(aggregate_ids),
                    AggregateItem.analysis_status == "succeeded",
                    SourceCreator.is_active.is_(True),
                    SourceCreator.is_deleted.is_(False),
                )
            ):
                aggregate_map[aggregate.id] = aggregate

        records: list[tuple[str, Note | AggregateItem]] = []
        for bookmark in bookmarks:
            if bookmark.note_id:
                note = note_map.get(bookmark.note_id)
                if note:
                    records.append(("note", note))
                continue
            if bookmark.aggregate_item_id:
                aggregate = aggregate_map.get(bookmark.aggregate_item_id)
                if aggregate:
                    records.append(("aggregate", aggregate))

        followed_user_ids, followed_source_ids = self._load_following_sets(user.id)
        prefer_zh = self._prefer_zh_ui(user.ui_language)
        return FeedListResponse(
            items=self._build_items_for_records(
                user=user,
                records=records,
                followed_user_ids=followed_user_ids,
                followed_source_ids=followed_source_ids,
                prefer_zh=prefer_zh,
            )
        )

    def get_item_detail(self, *, user: User, item_type: str, item_id: UUID) -> FeedDetailResponse:
        kind = item_type.strip().lower()
        followed_user_ids, followed_source_ids = self._load_following_sets(user.id)
        prefer_zh = self._prefer_zh_ui(user.ui_language)

        if kind == "note":
            note = self.db.scalar(
                select(Note)
                .join(User, User.id == Note.user_id)
                .options(joinedload(Note.user))
                .where(
                    Note.id == item_id,
                    Note.visibility == "public",
                    Note.is_deleted.is_(False),
                    User.is_deleted.is_(False),
                )
            )
            if not note:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="内容不存在")

            item = self._build_items_for_records(
                user=user,
                records=[("note", note)],
                followed_user_ids=followed_user_ids,
                followed_source_ids=followed_source_ids,
                prefer_zh=prefer_zh,
            )[0]
            latest_summary = self.note_repo.get_latest_summary(note.id)
            if latest_summary and latest_summary.source_language == "zh":
                summary_zh = (
                    latest_summary.output_summary_zh
                    or latest_summary.output_summary
                    or latest_summary.summary_text
                )
            else:
                summary_zh = latest_summary.output_summary_zh if latest_summary else None
            return FeedDetailResponse(
                item=item,
                summary_text=self._pick_display_text(
                    prefer_zh=prefer_zh,
                    original=(latest_summary.output_summary or latest_summary.summary_text) if latest_summary else None,
                    zh=summary_zh,
                ),
                key_points=(
                    (latest_summary.output_tags_json or latest_summary.key_points_json or [])
                    if latest_summary
                    else []
                ),
                note_body_md=note.note_body_md,
                analysis_error=(latest_summary.error_message if latest_summary else None) or note.analysis_error,
                model_provider=latest_summary.model_provider if latest_summary else None,
                model_name=latest_summary.model_name if latest_summary else None,
                model_version=latest_summary.model_version if latest_summary else None,
                analyzed_at=latest_summary.analyzed_at if latest_summary else None,
            )

        if kind == "aggregate":
            aggregate = self.db.scalar(
                select(AggregateItem)
                .join(SourceCreator, SourceCreator.id == AggregateItem.source_creator_id)
                .options(joinedload(AggregateItem.source_creator))
                .where(
                    AggregateItem.id == item_id,
                    AggregateItem.analysis_status == "succeeded",
                    SourceCreator.is_active.is_(True),
                    SourceCreator.is_deleted.is_(False),
                )
            )
            if not aggregate:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="内容不存在")

            item = self._build_items_for_records(
                user=user,
                records=[("aggregate", aggregate)],
                followed_user_ids=followed_user_ids,
                followed_source_ids=followed_source_ids,
                prefer_zh=prefer_zh,
            )[0]
            return FeedDetailResponse(
                item=item,
                summary_text=self._pick_display_text(
                    prefer_zh=prefer_zh,
                    original=aggregate.summary_text,
                    zh=aggregate.summary_text_zh,
                ),
                key_points=aggregate.key_points_json or [],
                note_body_md=None,
                analysis_error=aggregate.analysis_error,
                model_provider=aggregate.model_provider,
                model_name=aggregate.model_name,
                model_version=aggregate.model_version,
                analyzed_at=aggregate.updated_at,
            )

        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不支持的内容类型")

    def _build_items_for_records(
        self,
        *,
        user: User,
        records: list[tuple[str, Note | AggregateItem]],
        followed_user_ids: set[UUID],
        followed_source_ids: set[UUID],
        prefer_zh: bool,
    ) -> list[FeedItem]:
        if not records:
            return []

        note_ids = [item.id for kind, item in records if kind == "note"]
        aggregate_ids = [item.id for kind, item in records if kind == "aggregate"]

        note_stats = self._load_note_interaction_stats(user_id=user.id, note_ids=note_ids)
        aggregate_stats = self._load_aggregate_interaction_stats(user_id=user.id, aggregate_ids=aggregate_ids)

        items: list[FeedItem] = []
        for kind, raw in records:
            if kind == "note":
                note = raw  # type: ignore[assignment]
                latest_summary = self.note_repo.get_latest_summary(note.id)
                if latest_summary and latest_summary.source_language == "zh":
                    excerpt_zh = (
                        latest_summary.output_summary_zh
                        or latest_summary.output_summary
                        or latest_summary.summary_text
                    )
                    title_zh = latest_summary.output_title_zh or latest_summary.output_title
                else:
                    excerpt_zh = latest_summary.output_summary_zh if latest_summary else None
                    title_zh = latest_summary.output_title_zh if latest_summary else None
                excerpt_original = (
                    (latest_summary.output_summary or latest_summary.summary_text) if latest_summary else None
                )
                display_title = self._pick_display_text(
                    prefer_zh=prefer_zh,
                    original=(latest_summary.output_title if latest_summary else None) or note.source_title,
                    zh=title_zh,
                )
                stats = note_stats.get(
                    note.id,
                    InteractionStats(like_count=0, bookmark_count=0, liked=False, bookmarked=False),
                )
                items.append(
                    FeedItem(
                        id=note.id,
                        item_type="note",
                        creator_kind="user",
                        creator_id=note.user.user_id if note.user else "",
                        creator_name=self._creator_name_for_note(note),
                        source_url=note.source_url_normalized,
                        source_domain=note.source_domain,
                        source_title=display_title,
                        tags=note.tags_json or [],
                        analysis_status=note.analysis_status,
                        summary_excerpt=self._shorten(
                            self._pick_display_text(prefer_zh=prefer_zh, original=excerpt_original, zh=excerpt_zh)
                        ),
                        published_at=latest_summary.published_at if latest_summary else None,
                        updated_at=note.updated_at,
                        like_count=stats.like_count,
                        bookmark_count=stats.bookmark_count,
                        liked=stats.liked,
                        bookmarked=stats.bookmarked,
                        following=note.user_id in followed_user_ids,
                    )
                )
                continue

            aggregate = raw  # type: ignore[assignment]
            stats = aggregate_stats.get(
                aggregate.id,
                InteractionStats(like_count=0, bookmark_count=0, liked=False, bookmarked=False),
            )
            creator = aggregate.source_creator
            items.append(
                FeedItem(
                    id=aggregate.id,
                    item_type="aggregate",
                    creator_kind="source",
                    creator_id=creator.slug if creator else "",
                    creator_name=creator.display_name if creator else "",
                    source_url=aggregate.source_url_normalized,
                    source_domain=aggregate.source_domain,
                    source_title=self._pick_display_text(
                        prefer_zh=prefer_zh,
                        original=aggregate.source_title,
                        zh=aggregate.source_title_zh,
                    ),
                    tags=aggregate.tags_json or [],
                    analysis_status=aggregate.analysis_status,
                    summary_excerpt=self._shorten(
                        self._pick_display_text(
                            prefer_zh=prefer_zh,
                            original=aggregate.summary_text,
                            zh=aggregate.summary_text_zh,
                        )
                    ),
                    published_at=aggregate.published_at,
                    updated_at=aggregate.updated_at,
                    like_count=stats.like_count,
                    bookmark_count=stats.bookmark_count,
                    liked=stats.liked,
                    bookmarked=stats.bookmarked,
                    following=aggregate.source_creator_id in followed_source_ids,
                )
            )
        return items

    def _load_public_notes(self, *, fetch_limit: int) -> list[Note]:
        stmt = (
            select(Note)
            .join(User, User.id == Note.user_id)
            .options(joinedload(Note.user))
            .where(
                Note.visibility == "public",
                Note.is_deleted.is_(False),
                User.is_deleted.is_(False),
            )
            .order_by(desc(Note.updated_at))
            .limit(fetch_limit)
        )
        return list(self.db.scalars(stmt))

    def _load_aggregate_items(self, *, fetch_limit: int) -> list[AggregateItem]:
        stmt = (
            select(AggregateItem)
            .join(SourceCreator, SourceCreator.id == AggregateItem.source_creator_id)
            .options(joinedload(AggregateItem.source_creator))
            .where(
                AggregateItem.analysis_status == "succeeded",
                SourceCreator.is_active.is_(True),
                SourceCreator.is_deleted.is_(False),
            )
            .order_by(desc(AggregateItem.updated_at))
            .limit(fetch_limit)
        )
        return list(self.db.scalars(stmt))

    def _load_following_sets(self, user_id: UUID) -> tuple[set[UUID], set[UUID]]:
        follows = list(
            self.db.scalars(select(UserFollow).where(UserFollow.follower_user_id == user_id))
        )
        followed_users = {item.target_user_id for item in follows if item.target_user_id}
        followed_sources = {item.target_source_creator_id for item in follows if item.target_source_creator_id}
        return followed_users, followed_sources

    def _load_note_interaction_stats(self, *, user_id: UUID, note_ids: list[UUID]) -> dict[UUID, InteractionStats]:
        if not note_ids:
            return {}
        like_users: dict[UUID, set[UUID]] = defaultdict(set)
        bookmark_users: dict[UUID, set[UUID]] = defaultdict(set)

        for record in self.db.execute(select(UserLike.user_id, UserLike.note_id).where(UserLike.note_id.in_(note_ids))):
            actor, note_id = record
            like_users[note_id].add(actor)
        for record in self.db.execute(
            select(UserBookmark.user_id, UserBookmark.note_id).where(UserBookmark.note_id.in_(note_ids))
        ):
            actor, note_id = record
            bookmark_users[note_id].add(actor)

        result: dict[UUID, InteractionStats] = {}
        for note_id in note_ids:
            likes = like_users.get(note_id, set())
            bookmarks = bookmark_users.get(note_id, set())
            result[note_id] = InteractionStats(
                like_count=len(likes),
                bookmark_count=len(bookmarks),
                liked=user_id in likes,
                bookmarked=user_id in bookmarks,
            )
        return result

    def _load_aggregate_interaction_stats(
        self,
        *,
        user_id: UUID,
        aggregate_ids: list[UUID],
    ) -> dict[UUID, InteractionStats]:
        if not aggregate_ids:
            return {}

        aggregates = {
            item.id: item
            for item in self.db.scalars(select(AggregateItem).where(AggregateItem.id.in_(aggregate_ids)))
        }
        normalized_urls = {item.source_url_normalized for item in aggregates.values()}
        related_notes = list(
            self.db.execute(
                select(Note.id, Note.source_url_normalized)
                .join(User, User.id == Note.user_id)
                .where(
                    Note.visibility == "public",
                    Note.is_deleted.is_(False),
                    User.is_deleted.is_(False),
                    Note.source_url_normalized.in_(normalized_urls),
                )
            )
        )
        related_note_ids = [note_id for note_id, _ in related_notes]
        notes_by_normalized: dict[str, list[UUID]] = defaultdict(list)
        for note_id, normalized in related_notes:
            notes_by_normalized[normalized].append(note_id)

        direct_like_users: dict[UUID, set[UUID]] = defaultdict(set)
        direct_bookmark_users: dict[UUID, set[UUID]] = defaultdict(set)
        for actor, aggregate_id in self.db.execute(
            select(UserLike.user_id, UserLike.aggregate_item_id).where(UserLike.aggregate_item_id.in_(aggregate_ids))
        ):
            direct_like_users[aggregate_id].add(actor)
        for actor, aggregate_id in self.db.execute(
            select(UserBookmark.user_id, UserBookmark.aggregate_item_id).where(UserBookmark.aggregate_item_id.in_(aggregate_ids))
        ):
            direct_bookmark_users[aggregate_id].add(actor)

        note_like_users: dict[UUID, set[UUID]] = defaultdict(set)
        note_bookmark_users: dict[UUID, set[UUID]] = defaultdict(set)
        if related_note_ids:
            for actor, note_id in self.db.execute(
                select(UserLike.user_id, UserLike.note_id).where(UserLike.note_id.in_(related_note_ids))
            ):
                note_like_users[note_id].add(actor)
            for actor, note_id in self.db.execute(
                select(UserBookmark.user_id, UserBookmark.note_id).where(UserBookmark.note_id.in_(related_note_ids))
            ):
                note_bookmark_users[note_id].add(actor)

        result: dict[UUID, InteractionStats] = {}
        for aggregate_id in aggregate_ids:
            aggregate = aggregates.get(aggregate_id)
            if not aggregate:
                continue
            like_users = set(direct_like_users.get(aggregate_id, set()))
            bookmark_users = set(direct_bookmark_users.get(aggregate_id, set()))
            for note_id in notes_by_normalized.get(aggregate.source_url_normalized, []):
                like_users |= note_like_users.get(note_id, set())
                bookmark_users |= note_bookmark_users.get(note_id, set())
            result[aggregate_id] = InteractionStats(
                like_count=len(like_users),
                bookmark_count=len(bookmark_users),
                liked=user_id in like_users,
                bookmarked=user_id in bookmark_users,
            )
        return result

    def _normalize_scope(self, value: str | None) -> str:
        raw = (value or FEED_SCOPE_ALL).strip().lower()
        if raw not in ALLOWED_FEED_SCOPES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不支持的信息流筛选范围")
        return raw

    def _normalize_tag(self, value: str | None) -> str | None:
        if value is None:
            return None
        tag = value.strip().lower()
        return tag or None

    def _normalize_keyword(self, value: str | None) -> str | None:
        if value is None:
            return None
        keyword = value.strip().lower()
        return keyword or None

    def _match_scope(self, *, scope: str, target_id: UUID, followed_ids: set[UUID]) -> bool:
        if scope == FEED_SCOPE_ALL:
            return True
        if scope == FEED_SCOPE_FOLLOWING:
            return target_id in followed_ids
        return target_id not in followed_ids

    def _shorten(self, text: str | None, *, max_len: int = 180) -> str | None:
        if not text:
            return None
        clean = text.strip()
        if len(clean) <= max_len:
            return clean
        return f"{clean[:max_len].rstrip()}..."

    def _prefer_zh_ui(self, ui_language: str | None) -> bool:
        normalized = (ui_language or "").strip().lower()
        return normalized.startswith("zh")

    def _pick_display_text(self, *, prefer_zh: bool, original: str | None, zh: str | None) -> str | None:
        primary = zh if prefer_zh else original
        fallback = original if prefer_zh else zh
        if primary and primary.strip():
            return primary
        if fallback and fallback.strip():
            return fallback
        return None

    def _combine_for_search(self, first: str | None, second: str | None) -> str:
        chunks = [part.strip() for part in (first, second) if part and part.strip()]
        return " ".join(chunks)

    def _match_keyword(
        self,
        *,
        keyword: str,
        source_title: str | None,
        source_url: str | None,
        source_domain: str | None,
        creator_name: str | None,
        summary_text: str | None,
    ) -> bool:
        fields = (
            source_title or "",
            source_url or "",
            source_domain or "",
            creator_name or "",
            summary_text or "",
        )
        for field in fields:
            if keyword in field.lower():
                return True
        return False

    def _creator_name_for_note(self, note: Note) -> str:
        if not note.user:
            return ""
        return note.user.nickname or note.user.user_id
