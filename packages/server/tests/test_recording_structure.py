from pathlib import Path
import pytest
from freemocap_sdk.recording_structure import RecordingStructure, RecordingPaths


def test_canonical_paths_are_portable_and_read_only(tmp_path):
    recording = RecordingStructure(tmp_path / 'not-created', 'capture-123')
    expected = {
        'videos_synchronized_dir': 'videos/synchronized',
        'videos_annotated_dir': 'videos/annotated',
        'videos_stereo_dir': 'videos/stereo',
        'stereo_manifest_path': 'videos/stereo/capture-123_stereo_sources.json',
        'calibration_toml_path': 'capture-123_calibration.toml',
        'recording_info_path': 'capture-123_recording_info.json',
        'data_parquet_path': 'capture-123_data.parquet',
    }
    for name, relative in expected.items():
        assert recording.relative(getattr(recording, name)) == relative
    assert recording.relative(recording.application_dir('skellyclicker')) == 'skellyclicker'
    assert recording.relative(recording.camera_timing_path('left')) == 'videos/synchronized/timestamps/camera_timestamps/capture-123.cameraleft.timestamps.csv'
    assert RecordingPaths.from_root(recording.full_path) == recording
    assert not recording.base_directory.exists()


@pytest.mark.parametrize('name', ['..', '../outside', 'x/y', 'x\\y', 'C:evil', 'NUL', 'x.', 'x ', ''])
def test_recording_identity_cannot_escape_or_use_nonportable_names(tmp_path, name):
    with pytest.raises(ValueError):
        RecordingStructure(tmp_path, name)
    recording = RecordingStructure(tmp_path, 'valid')
    with pytest.raises(ValueError):
        recording.application_dir(name)
    with pytest.raises(ValueError):
        recording.camera_timing_path(name)
