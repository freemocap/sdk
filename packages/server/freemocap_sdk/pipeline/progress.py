from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

class ItemProgressSnapshot(BaseModel):
    """Progress of one independently counted item within an operation, such as one video."""

    model_config = ConfigDict(frozen=True, extra="forbid", allow_inf_nan=False)
    label: str = Field(min_length=1)
    completed: int = Field(ge=0)
    total: int = Field(ge=0)
    unit: str = Field(min_length=1)


class OperationProgressSnapshot(BaseModel):
    """One independently executing operation, described by its producer."""

    model_config = ConfigDict(frozen=True, extra="forbid", allow_inf_nan=False)
    operation_id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    stage: str | None = None
    effects: tuple[Literal["read_record", "read_live", "write_disk", "display"], ...] = ()
    dependencies: tuple[str, ...] = ()
    waiting_for: tuple[str, ...] = ()
    blocked_by: tuple[str, ...] = ()
    files_read: tuple[str, ...] = ()
    files_written: tuple[str, ...] = ()
    status: Literal["waiting", "running", "complete", "failed", "cancelled", "blocked"]
    progress_fraction: float | None = Field(default=None, ge=0, le=1)
    detail: str = ""
    completed: int | None = Field(default=None, ge=0)
    total: int | None = Field(default=None, ge=0)
    unit: str | None = None
    items: tuple[ItemProgressSnapshot, ...] = ()
    elapsed_seconds: float | None = Field(default=None, ge=0)
    seconds_per_motion_frame: float | None = Field(default=None, ge=0)
