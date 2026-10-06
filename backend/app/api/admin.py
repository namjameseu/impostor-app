import secrets
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel

from app.core import config

router = APIRouter(prefix="/admin", tags=["admin"])


def passcode_ok(passcode: str | None) -> bool:
    if config.ADMIN_PASSCODE is None:
        return True
    return secrets.compare_digest((passcode or "").encode(), config.ADMIN_PASSCODE.encode())


def require_admin(x_admin_passcode: Annotated[str | None, Header()] = None) -> None:
    """Dependency for word-library changes when ADMIN_PASSCODE is configured."""
    if not passcode_ok(x_admin_passcode):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Admin passcode required.")


class AdminStatus(BaseModel):
    passcode_required: bool


class PasscodeCheck(BaseModel):
    passcode: str


@router.get("/status", response_model=AdminStatus)
def admin_status():
    return AdminStatus(passcode_required=config.ADMIN_PASSCODE is not None)


@router.post("/verify", status_code=status.HTTP_204_NO_CONTENT)
def verify_passcode(data: PasscodeCheck):
    if not passcode_ok(data.passcode):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong passcode.")
