from fastapi import APIRouter, HTTPException
from ..updater import check_for_update, apply_update

router = APIRouter(prefix="/api/update", tags=["update"])


@router.get("/check")
def check():
    return check_for_update()


@router.post("/apply")
def apply():
    try:
        return apply_update()
    except Exception as e:
        raise HTTPException(500, str(e))
