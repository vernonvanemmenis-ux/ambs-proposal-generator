from fastapi import APIRouter

from ..constants import (
    PRODUCT_LINES,
    STRUCTURE_TYPES,
    UNITS_OF_MEASURE,
    SECTION_KINDS,
    PROPOSAL_STATUS_VALUES,
    DEFAULT_PROJECT_STAGES,
)
from ..schemas import CatalogueOut

router = APIRouter(prefix="/api/catalogue", tags=["catalogue"])


@router.get("", response_model=CatalogueOut)
def catalogue():
    return CatalogueOut(
        product_lines=PRODUCT_LINES,
        structure_types=STRUCTURE_TYPES,
        units_of_measure=UNITS_OF_MEASURE,
        section_kinds=SECTION_KINDS,
        proposal_status_values=PROPOSAL_STATUS_VALUES,
        default_project_stages=DEFAULT_PROJECT_STAGES,
    )
