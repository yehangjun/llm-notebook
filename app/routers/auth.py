from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import LoginRequest, TokenResponse, UserOut
from app.services.security import create_access_token

router = APIRouter(prefix='/auth', tags=['auth'])


@router.post('/dev-login', response_model=TokenResponse)
def dev_login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.phone == payload.phone).first()
    if not user:
        user = User(phone=payload.phone, display_name=f'user_{payload.phone[-4:]}')
        db.add(user)
        db.commit()
        db.refresh(user)

    token = create_access_token(user.id)
    return TokenResponse(access_token=token)


@router.get('/me', response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return UserOut(id=current_user.id, phone=current_user.phone, display_name=current_user.display_name)
