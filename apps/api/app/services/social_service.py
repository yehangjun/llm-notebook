from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.aggregate_item import AggregateItem
from app.models.note import Note
from app.models.source_creator import SourceCreator
from app.models.user import User
from app.models.user_bookmark import UserBookmark
from app.models.user_follow import UserFollow
from app.models.user_like import UserLike
from app.schemas.auth import GenericMessageResponse
class SocialService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def follow_user(self, *, user: User, target_user_id: str) -> GenericMessageResponse:
        target = self.db.scalar(
            select(User).where(User.user_id == target_user_id.strip(), User.is_deleted.is_(False))
        )
        if not target:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="创作者不存在")
        if target.id == user.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能关注自己")

        exists = self.db.scalar(
            select(UserFollow).where(
                UserFollow.follower_user_id == user.id,
                UserFollow.target_user_id == target.id,
            )
        )
        if exists:
            return GenericMessageResponse(message="已关注")

        follow = UserFollow(
            follower_user_id=user.id,
            target_user_id=target.id,
            target_source_creator_id=None,
        )
        self.db.add(follow)
        self.db.commit()
        return GenericMessageResponse(message="关注成功")

    def unfollow_user(self, *, user: User, target_user_id: str) -> GenericMessageResponse:
        target = self.db.scalar(select(User).where(User.user_id == target_user_id.strip()))
        if not target:
            return GenericMessageResponse(message="已取消关注")

        stmt = delete(UserFollow).where(
            UserFollow.follower_user_id == user.id,
            UserFollow.target_user_id == target.id,
        )
        self.db.execute(stmt)
        self.db.commit()
        return GenericMessageResponse(message="已取消关注")

    def follow_source(self, *, user: User, source_slug: str) -> GenericMessageResponse:
        source = self.db.scalar(
            select(SourceCreator).where(SourceCreator.slug == source_slug.strip(), SourceCreator.is_active.is_(True))
        )
        if not source:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="信息源不存在")

        exists = self.db.scalar(
            select(UserFollow).where(
                UserFollow.follower_user_id == user.id,
                UserFollow.target_source_creator_id == source.id,
            )
        )
        if exists:
            return GenericMessageResponse(message="已关注")

        follow = UserFollow(
            follower_user_id=user.id,
            target_user_id=None,
            target_source_creator_id=source.id,
        )
        self.db.add(follow)
        self.db.commit()
        return GenericMessageResponse(message="关注成功")

    def unfollow_source(self, *, user: User, source_slug: str) -> GenericMessageResponse:
        source = self.db.scalar(select(SourceCreator).where(SourceCreator.slug == source_slug.strip()))
        if not source:
            return GenericMessageResponse(message="已取消关注")

        stmt = delete(UserFollow).where(
            UserFollow.follower_user_id == user.id,
            UserFollow.target_source_creator_id == source.id,
        )
        self.db.execute(stmt)
        self.db.commit()
        return GenericMessageResponse(message="已取消关注")

    def bookmark_note(self, *, user: User, note_id: UUID) -> GenericMessageResponse:
        note = self.db.scalar(
            select(Note)
            .join(User, User.id == Note.user_id)
            .where(
                Note.id == note_id,
                Note.visibility == "public",
                Note.is_deleted.is_(False),
                User.is_deleted.is_(False),
            )
        )
        if not note:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="笔记不存在")

        return self._set_bookmark(user_id=user.id, note_id=note.id, aggregate_item_id=None)

    def unbookmark_note(self, *, user: User, note_id: UUID) -> GenericMessageResponse:
        return self._unset_bookmark(user_id=user.id, note_id=note_id, aggregate_item_id=None)

    def bookmark_aggregate(self, *, user: User, aggregate_id: UUID) -> GenericMessageResponse:
        aggregate = self.db.scalar(select(AggregateItem).where(AggregateItem.id == aggregate_id))
        if not aggregate:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="聚合条目不存在")

        return self._set_bookmark(user_id=user.id, note_id=None, aggregate_item_id=aggregate.id)

    def unbookmark_aggregate(self, *, user: User, aggregate_id: UUID) -> GenericMessageResponse:
        return self._unset_bookmark(user_id=user.id, note_id=None, aggregate_item_id=aggregate_id)

    def like_note(self, *, user: User, note_id: UUID) -> GenericMessageResponse:
        note = self.db.scalar(
            select(Note)
            .join(User, User.id == Note.user_id)
            .where(
                Note.id == note_id,
                Note.visibility == "public",
                Note.is_deleted.is_(False),
                User.is_deleted.is_(False),
            )
        )
        if not note:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="笔记不存在")
        return self._set_like(user_id=user.id, note_id=note.id, aggregate_item_id=None)

    def unlike_note(self, *, user: User, note_id: UUID) -> GenericMessageResponse:
        return self._unset_like(user_id=user.id, note_id=note_id, aggregate_item_id=None)

    def like_aggregate(self, *, user: User, aggregate_id: UUID) -> GenericMessageResponse:
        aggregate = self.db.scalar(select(AggregateItem).where(AggregateItem.id == aggregate_id))
        if not aggregate:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="聚合条目不存在")
        return self._set_like(user_id=user.id, note_id=None, aggregate_item_id=aggregate.id)

    def unlike_aggregate(self, *, user: User, aggregate_id: UUID) -> GenericMessageResponse:
        return self._unset_like(user_id=user.id, note_id=None, aggregate_item_id=aggregate_id)

    def _set_bookmark(
        self,
        *,
        user_id: UUID,
        note_id: UUID | None,
        aggregate_item_id: UUID | None,
    ) -> GenericMessageResponse:
        exists = self.db.scalar(
            select(UserBookmark).where(
                UserBookmark.user_id == user_id,
                UserBookmark.note_id == note_id,
                UserBookmark.aggregate_item_id == aggregate_item_id,
            )
        )
        if exists:
            return GenericMessageResponse(message="已收藏")

        bookmark = UserBookmark(
            user_id=user_id,
            note_id=note_id,
            aggregate_item_id=aggregate_item_id,
        )
        self.db.add(bookmark)
        self.db.commit()
        return GenericMessageResponse(message="收藏成功")

    def _unset_bookmark(
        self,
        *,
        user_id: UUID,
        note_id: UUID | None,
        aggregate_item_id: UUID | None,
    ) -> GenericMessageResponse:
        stmt = delete(UserBookmark).where(
            UserBookmark.user_id == user_id,
            UserBookmark.note_id == note_id,
            UserBookmark.aggregate_item_id == aggregate_item_id,
        )
        self.db.execute(stmt)
        self.db.commit()
        return GenericMessageResponse(message="已取消收藏")

    def _set_like(
        self,
        *,
        user_id: UUID,
        note_id: UUID | None,
        aggregate_item_id: UUID | None,
    ) -> GenericMessageResponse:
        exists = self.db.scalar(
            select(UserLike).where(
                UserLike.user_id == user_id,
                UserLike.note_id == note_id,
                UserLike.aggregate_item_id == aggregate_item_id,
            )
        )
        if exists:
            return GenericMessageResponse(message="已点赞")

        like = UserLike(
            user_id=user_id,
            note_id=note_id,
            aggregate_item_id=aggregate_item_id,
        )
        self.db.add(like)
        self.db.commit()
        return GenericMessageResponse(message="点赞成功")

    def _unset_like(
        self,
        *,
        user_id: UUID,
        note_id: UUID | None,
        aggregate_item_id: UUID | None,
    ) -> GenericMessageResponse:
        stmt = delete(UserLike).where(
            UserLike.user_id == user_id,
            UserLike.note_id == note_id,
            UserLike.aggregate_item_id == aggregate_item_id,
        )
        self.db.execute(stmt)
        self.db.commit()
        return GenericMessageResponse(message="已取消点赞")
