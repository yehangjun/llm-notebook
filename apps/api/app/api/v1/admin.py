from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import AdminUpdateUserRequest, AdminUserItem, AdminUserListResponse
from app.services.admin_service import AdminService

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=AdminUserListResponse)
def list_users(
    keyword: str | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    _: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    service = AdminService(db)
    users = service.list_users(keyword=keyword, offset=offset, limit=limit)
    return AdminUserListResponse(users=[AdminUserItem.model_validate(user) for user in users])


@router.patch("/users/{target_user_id}", response_model=AdminUserItem)
def update_user(
    target_user_id: str,
    payload: AdminUpdateUserRequest,
    current_admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    service = AdminService(db)
    user = service.update_user(target_user_id=target_user_id, payload=payload, current_admin=current_admin)
    return AdminUserItem.model_validate(user)
