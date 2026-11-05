import csv
import json
import math
import tomllib

import numpy as np
import pytest

from freemocap_sdk.recording_inputs import write_recording_inputs
from freemocap_sdk.recording_structure import RecordingStructure


def fixture(tmp_path):
    structure = RecordingStructure(tmp_path, 'recording')
    structure.videos_synchronized_dir.mkdir(parents=True)
    (structure.videos_synchronized_dir / 'left.mp4').write_bytes(b'media fixture; decoding is caller-owned')
    camera = dict(id='left', index=0, image_size=[1280, 720],
        intrinsics=dict(fx=500., fy=501., cx=640., cy=360., k1=0., k2=0., p1=0., p2=0.),
        extrinsics=dict(quaternion_wxyz=[math.sqrt(.5), 0., 0., math.sqrt(.5)], translation=[20., -10., -30.]),
        world_orientation=[[0., 1., 0.], [-1., 0., 0.], [0., 0., 1.]], world_position=[10., 20., 30.])
    return dict(structure=structure, videos={'left': 'left.mp4'}, cameras=[camera],
        rotation_vectors={'left': [0., 0., math.pi / 2]},
        timestamps_ns=np.array([1_700_000_000_000_000_001, 1_700_000_000_033_400_001], dtype=np.int64),
        source_frame_indices=np.array([101, 102], dtype=np.int64),
        source_clock_origin_ns=1_700_000_000_000_000_000,
        recording_uuid='capture-uuid', provenance={'source': 'linked', 'coverage': 'clip'})


def test_input_publication_preserves_clock_camera_and_relative_associations(tmp_path):
    request = fixture(tmp_path)
    info = write_recording_inputs(**request)
    structure = request['structure']
    assert info['videos'] == {'left': 'left.mp4'}
    assert info['recording_uuid'] == 'capture-uuid'
    rows = list(csv.DictReader(structure.camera_timing_path('left').open()))
    assert [int(row['recording_frame_number']) for row in rows] == [0, 1]
    assert [float(row['timestamp.from_recording_start.sec']) for row in rows] == [1e-9, .033400001]
    exact = json.loads(structure.source_timing_path.read_text())
    assert exact['timestamps_ns'] == request['timestamps_ns'].tolist()
    assert exact['source_frame_indices'] == [101, 102]
    assert (structure.full_path / info['camera_timing']['left']).is_file()
    assert (structure.full_path / info['multiframe_timing']).is_file()
    cal = tomllib.loads(structure.calibration_toml_path.read_text())
    assert 'metadata' not in cal  # imported calibration must not invent a board solve
    assert cal['left']['rotation'] == [0., 0., math.pi / 2]
    assert cal['left']['translation'] == [20., -10., -30.]
    assert cal['left']['world_position'] == [10., 20., 30.]
    assert cal['left']['matrix'][1] == [0., 501., 360.]
    assert not structure.data_parquet_path.exists()
    assert not structure.exports_dir.exists()
    with pytest.raises(FileExistsError):
        write_recording_inputs(**request)


@pytest.mark.parametrize('failure', ['timing', 'identity', 'pose', 'video'])
def test_invalid_input_does_not_publish_metadata(tmp_path, failure):
    request = fixture(tmp_path)
    if failure == 'timing':
        request['timestamps_ns'][1] = request['timestamps_ns'][0]
    elif failure == 'identity':
        request['videos'] = {'other': 'left.mp4'}
    elif failure == 'pose':
        request['cameras'][0]['world_position'] = [0, 0, 0]
    else:
        request['videos'] = {'left': '../outside.mp4'}
    with pytest.raises(ValueError):
        write_recording_inputs(**request)
    assert not request['structure'].recording_info_path.exists()
    assert not request['structure'].camera_timestamps_dir.exists()
