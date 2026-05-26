from fastapi import APIRouter

from ..db import DB_PATH
from ..schemas import StatusOut
from ..pandadoc import is_online, pandadoc_configured
from ..updater import current_version

router = APIRouter(prefix="/api/status", tags=["status"])


@router.get("", response_model=StatusOut)
def status():
    return StatusOut(
        online=is_online(),
        pandadoc_configured=pandadoc_configured(),
        app_version=current_version(),
        db_path=str(DB_PATH),
    )
