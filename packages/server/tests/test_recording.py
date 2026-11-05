import json
from concurrent.futures import CancelledError

import numpy as np
import pyarrow.parquet as pq
from fastapi.testclient import TestClient
import pytest

from freemocap_sdk.recording import (
    ChannelSamples, PlaybackManifest, PlaybackMedia, PlaybackRun, RecordingChannel,
    RecordingResources, RecordingTimeline, create_recording_router, write_playback,
)
from freemocap_sdk.server import create_app


def fixture():
    clock = RecordingTimeline(sensor_group='stereo', source='timing:stereo',
                              frame_numbers=(101, 102), timestamps_s=(1.0, 1.04))
    channel = RecordingChannel(sensor_group='stereo', source='fit', reference_frame='world',
                               kind='LANDMARKS_3D', names=('tip',), components={'x': 'mm', 'y': 'mm', 'z': 'mm'})
    media = PlaybackMedia(video_filename='left.mp4', nominal_fps=25,
                          timeline=clock.model_copy(update={'source': 'left'}))
    manifest = PlaybackManifest(recording_id='recording', revision='revision1', selected_run_id=0,
                                runs=(PlaybackRun(run_id=0, channels=(channel,), timelines=(clock,), media=(media,),
                                    reference_frames={'world': {'name': 'world', 'basis': 'blender_x_right_y_forward_z_up', 'units': 'mm'}},
                                    scene_reference_frames={'stereo': 'world'}),))
    sample = ChannelSamples(0, channel, np.array([101, 102]), np.array([1.0, 1.04]),
                            np.array([[[1., 2., 3.]], [[np.nan, np.nan, np.nan]]]))
    return manifest, sample


def test_scene_references_reject_missing_mismatched_and_wrong_unit_definitions():
    manifest, _ = fixture()
    data = manifest.runs[0].model_dump()
    for patch in ({'reference_frames': {}}, {'scene_reference_frames': {'stereo': 'other'}},
                  {'reference_frames': {'world': {'name': 'world', 'basis': 'optical', 'units': 'm'}}}):
        with pytest.raises(ValueError):
            PlaybackRun.model_validate({**data, **patch})
    data['channels'][0]['reference_frame'] = 'other'
    with pytest.raises(ValueError, match='reference frame'):
        PlaybackRun.model_validate(data)


def test_writer_preserves_identity_missing_data_and_failed_publication(tmp_path):
    manifest, sample = fixture()
    path = tmp_path / 'display.parquet'
    write_playback(path=path, manifest=manifest, samples=[sample], provenance={'source': 'fresh'})
    before = path.read_bytes()
    table = pq.read_table(path)
    assert table['frame_number'].to_pylist() == [101]*3 + [102]*3
    assert table['value'].to_pylist() == [1., 2., 3., None, None, None]
    assert json.loads(table.schema.metadata[b'freemocap.playback'])['manifest']['revision'] == 'revision1'
    sample.values[0, 0, 0] = np.inf
    with pytest.raises(ValueError, match='finite or NaN'):
        write_playback(path=path, manifest=manifest, samples=[sample], provenance={})
    assert path.read_bytes() == before
    with pytest.raises(CancelledError):
        write_playback(path=path, manifest=manifest, samples=[sample], provenance={}, cancelled=lambda: True)
    assert path.read_bytes() == before
    assert list(tmp_path.glob('*.tmp')) == []


def test_routes_pin_revision_and_serve_media_ranges(tmp_path):
    manifest, sample = fixture()
    parquet = tmp_path / 'display.parquet'
    write_playback(path=parquet, manifest=manifest, samples=[sample], provenance={})
    video = tmp_path / 'left.mp4'
    video.write_bytes(b'0123456789')
    app = create_app(title='recording test', allowed_origins=['http://localhost:5176'])
    app.include_router(create_recording_router(lambda id: RecordingResources(manifest, parquet, {'left.mp4': video})))
    with TestClient(app) as client:
        bundle = client.get('/freemocap/recordings/recording/playback/bundle').json()
        url = bundle['videos']['sources']['synchronized']['videos'][0]['stream_url']
        response = client.get(url, headers={'Range': 'bytes=2-5'})
        assert response.status_code == 206
        assert response.content == b'2345'
        assert response.headers['content-range'] == 'bytes 2-5/10'
        assert 'immutable' in response.headers['cache-control']
        assert client.get('/freemocap/recordings/recording/parquet?revision=revision1').headers['etag'] == '"revision1"'
        response = client.get('/freemocap/recordings/recording/parquet?revision=revision1',
                              headers={'Origin': 'http://localhost:5176'})
        assert 'ETag' in response.headers['access-control-expose-headers']
        assert client.get('/freemocap/recordings/recording/parquet?revision=old').status_code == 409
        assert client.get(url.replace('revision1', 'old')).status_code == 409
        assert client.get(url.replace('left.mp4', 'absent.mp4')).status_code == 404
        assert client.get('/freemocap/recordings/other/playback/bundle').status_code == 409
