import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4, Quaternion, Euler, Vector3} from 'three';
import {CameraScene, computePose} from './MocapCameraRenderer';
import type {ReactElement} from 'react';
import {CalibrationSceneSchema} from '@/calibration';
import {CalibrationCameraDataSchema, PlaybackRunSchema} from '@freemocap/client/recording';

// Optical camera turned 90 degrees about its Y before optical -> Blender conversion.
// Independent expectation: optical forward is world +X, image up is world +Z.
const camera = CalibrationCameraDataSchema.parse({id:'turned',index:0,image_size:[1280,720],
    world_position:[120,30,-20],world_orientation:[[0,0,1],[-1,0,0],[0,-1,0]],
    intrinsics:{fx:500,fy:500,cx:640,cy:360,k1:0,k2:0,p1:0,p2:0},
    extrinsics:{quaternion_wxyz:[.5,.5,-.5,.5],translation:[30,-20,-120]}});
test('camera frustum uses the declared nonidentity optical-to-world pose without a basis offset',()=>{
    const pose=computePose(camera)!;
    const forward=new Vector3(0,0,500).applyQuaternion(pose.quaternion).add(pose.position);
    assert.ok(forward.distanceTo(new Vector3(620,30,-20))<1e-10);
    assert.ok(new Vector3(0,-1,0).applyQuaternion(pose.quaternion).distanceTo(new Vector3(0,0,1))<1e-10);
    assert.deepEqual(pose.position.toArray(),[120,30,-20]);
    // Traverse the real scene's group hierarchy as well: the former extra group
    // left computePose correct but rotated both the camera center and direction.
    function renderedCenterRay(element: ReactElement, parent = new Matrix4()): Vector3 {
        const props = element.props as {cam?: typeof camera; matrix?: Matrix4; rotation?: [number,number,number]; children?: ReactElement | ReactElement[]};
        if (props.cam) {
            const declared=computePose(props.cam)!;
            return new Vector3(0,0,500).applyQuaternion(declared.quaternion).add(declared.position).applyMatrix4(parent);
        }
        const local=props.matrix ?? new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromEuler(new Euler(...(props.rotation ?? [0,0,0]))));
        const child=Array.isArray(props.children) ? props.children[0] : props.children;
        assert.ok(child);
        return renderedCenterRay(child,parent.clone().multiply(local));
    }
    assert.ok(renderedCenterRay(CameraScene({cameras:[camera],referenceTransform:null})).distanceTo(new Vector3(620,30,-20))<1e-10);
    const reference=new Matrix4().makeTranslation(10,20,30);
    assert.ok(renderedCenterRay(CameraScene({cameras:[camera],referenceTransform:reference})).distanceTo(new Vector3(630,50,10))<1e-10);
});
test('playback frame definition survives the validated worker boundary and mismatches fail',()=>{
    const definition={name:'capture',basis:'blender_x_right_y_forward_z_up',units:'mm',alignment:null,additional_transform:null};
    const input={run_id:0,models:[],model_sources:{},channels:[{sensor_group:'stereo',source:'mesh',reference_frame:'capture',
        kind:'SEGMENT_ORIGINS',names:['body'],components:{x:'mm',y:'mm',z:'mm'}}],static_channels:[],timelines:[],media:[],
        camera_geometry:{stereo:[camera]},reference_frames:{capture:definition},scene_reference_frames:{stereo:'capture'}};
    const run=PlaybackRunSchema.parse(input);
    const scene=CalibrationSceneSchema.parse({calibration:{cameras:run.camera_geometry!.stereo,
        referenceFrame:run.reference_frames[run.scene_reference_frames.stereo]},referenceTransform:null});
    assert.deepEqual(scene.calibration!.referenceFrame,definition);
    assert.equal(PlaybackRunSchema.safeParse({...input,scene_reference_frames:{stereo:'other'}}).success,false);
    assert.equal(PlaybackRunSchema.safeParse({...input,reference_frames:{}}).success,false);
    assert.equal(PlaybackRunSchema.safeParse({...input,reference_frames:{capture:{...definition,units:'m'}}}).success,false);
});
