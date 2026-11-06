"""Bounded display telemetry; applications own durable history and artifact storage."""
from pydantic import BaseModel, ConfigDict, Field, field_validator


class TelemetryModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", allow_inf_nan=False)


class MetricPoint(TelemetryModel):
    step: float = Field(ge=0)
    value: float


class MetricSeries(TelemetryModel):
    operation_id: str
    id: str = Field(min_length=1, max_length=256)
    label: str = Field(min_length=1, max_length=256)
    step_label: str = Field(min_length=1, max_length=64)
    unit: str = Field(min_length=1, max_length=64)
    points: tuple[MetricPoint, ...] = ()
    omitted_points: int = Field(default=0, ge=0)


class SamplePreview(TelemetryModel):
    operation_id: str
    id: str = Field(min_length=1, max_length=256)
    label: str = Field(min_length=1, max_length=256)
    image_url: str = Field(min_length=1, max_length=4096)
    step: float = Field(ge=0)
    step_label: str = Field(min_length=1, max_length=64)
    checkpoint_id: str | None = Field(default=None, max_length=1024)

    @field_validator("image_url")
    @classmethod
    def validate_image_url(cls, value: str) -> str:
        from urllib.parse import urlsplit
        parsed = urlsplit(value)
        if value.startswith("/") and not value.startswith("//") and "\\" not in value:
            return value
        if parsed.scheme in ("http", "https") and parsed.netloc and "\\" not in value:
            return value
        raise ValueError("Preview needs an HTTP(S) or root-relative artifact URL")
