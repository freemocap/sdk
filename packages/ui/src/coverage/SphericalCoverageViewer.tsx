import {useEffect,useRef,useState} from 'react';
import {Scene,PerspectiveCamera,WebGLRenderer,Mesh,MeshStandardMaterial,MeshBasicMaterial,AmbientLight,DirectionalLight,DoubleSide,BufferGeometry} from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {STLLoader} from 'three/examples/jsm/loaders/STLLoader.js';
import ButtonSm from '../components/ui-components/ButtonSm';
import AnchoredInfo from '../components/ui-components/AnchoredInfo';
import {coverageGeometry,coverageGridGeometry,colorCoverage,viewRotation} from './coverage-geometry';

export interface SphericalCoverageViewerProps {
    meshUrl:string;
    /** Authored STL units to the units used by meshCenter and radius (metres in SkellyClicker). */
    meshScale:number;
    meshCenter:readonly [number,number,number];
    radius:number;
    azimuthBins:number;
    zBins:number;
    counts:readonly number[];
    onViewRotation?:(rotation:number[])=>void;
}
type Runtime={scene:Scene;camera:PerspectiveCamera;renderer:WebGLRenderer;controls:OrbitControls;
    sphere:Mesh<BufferGeometry,MeshBasicMaterial>;grid:Mesh<BufferGeometry,MeshBasicMaterial>;model:Mesh<BufferGeometry,MeshStandardMaterial>;
    render:()=>void;reset:()=>void};

/** Renders supplied object-frame coverage; no pose inference, binning, or dataset selection. */
export function SphericalCoverageViewer(props:SphericalCoverageViewerProps) {
    const host=useRef<HTMLDivElement>(null),runtime=useRef<Runtime|null>(null);
    const current=useRef(props);current.current=props;
    const [error,setError]=useState<string|null>(null),[loading,setLoading]=useState(true);
    const [gridError,setGridError]=useState<string|null>(null),[scaleError,setScaleError]=useState<string|null>(null);
    useEffect(()=>{
        const element=host.current;if(!element)return;
        let renderer:WebGLRenderer;
        try{renderer=new WebGLRenderer({antialias:true,alpha:true});}catch(e){setError(String(e));return;}
        renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
        renderer.domElement.setAttribute('aria-label','Object viewpoint coverage');
        renderer.domElement.tabIndex=0;element.appendChild(renderer.domElement);
        const scene=new Scene(),camera=new PerspectiveCamera(42,1,.001,1000);camera.up.set(0,0,1);
        const controls=new OrbitControls(camera,renderer.domElement);controls.enablePan=false;
        // Only the near hemisphere contributes color, avoiding front/back count blending.
        const sphere=new Mesh(new BufferGeometry(),new MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.42,depthWrite:false}));
        sphere.renderOrder=1;
        const grid=new Mesh(new BufferGeometry(),new MeshBasicMaterial({color:'#dce3e8',transparent:true,opacity:.22,depthWrite:false}));grid.renderOrder=2;
        const model=new Mesh(new BufferGeometry(),new MeshStandardMaterial({color:'#dce3e8',roughness:.7,side:DoubleSide}));
        scene.add(model,sphere,grid,new AmbientLight(0xffffff,2));
        const light=new DirectionalLight(0xffffff,3);light.position.set(2,3,4);scene.add(light);
        let frame=0,disposed=false;
        const render=()=>{if(!frame&&!disposed)frame=requestAnimationFrame(()=>{frame=0;renderer.render(scene,camera);});};
        const changed=()=>{camera.updateMatrixWorld();current.current.onViewRotation?.(viewRotation(camera.matrixWorldInverse));render();};
        const reset=()=>{
            const r=current.current.radius;if(!(r>0&&Number.isFinite(r)))return;
            camera.near=r*.01;camera.far=r*100;camera.position.set(r*2.4,r*2.4,r*1.8);
            controls.minDistance=r*1.25;controls.maxDistance=r*15;controls.target.set(0,0,0);
            camera.updateProjectionMatrix();controls.update();changed();
        };
        controls.addEventListener('change',changed);
        const resize=new ResizeObserver(()=>{
            const width=element.clientWidth,height=element.clientHeight;if(!width||!height)return;
            renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();render();
        });resize.observe(element);
        const keyboard=(event:KeyboardEvent)=>{if(event.key.toLowerCase()==='r'){event.preventDefault();reset();}};
        renderer.domElement.addEventListener('keydown',keyboard);
        runtime.current={scene,camera,renderer,controls,sphere,grid,model,render,reset};reset();
        return()=>{
            disposed=true;cancelAnimationFrame(frame);resize.disconnect();controls.removeEventListener('change',changed);controls.dispose();
            renderer.domElement.removeEventListener('keydown',keyboard);
            sphere.geometry.dispose();sphere.material.dispose();model.geometry.dispose();model.material.dispose();
            grid.geometry.dispose();grid.material.dispose();
            renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();runtime.current=null;
        };
    },[]);
    useEffect(()=>{
        const rt=runtime.current;if(!rt)return;
        try {
            const geometry=coverageGeometry(props.azimuthBins,props.zBins);
            rt.grid.geometry.dispose();rt.grid.geometry=coverageGridGeometry(props.azimuthBins,props.zBins);
            rt.sphere.geometry.dispose();rt.sphere.geometry=geometry;rt.render();
        }catch(e){rt.sphere.visible=false;setGridError(String(e));}
    },[props.azimuthBins,props.zBins]);
    useEffect(()=>{
        const rt=runtime.current;if(!rt)return;
        try{colorCoverage(rt.sphere.geometry,props.counts);rt.sphere.visible=true;setGridError(null);rt.render();}catch(e){rt.sphere.visible=false;setGridError(String(e));rt.render();}
    },[props.counts,props.azimuthBins,props.zBins]);
    useEffect(()=>{
        const rt=runtime.current;if(!rt)return;
        if(!(props.radius>0&&Number.isFinite(props.radius)&&props.meshScale>0&&Number.isFinite(props.meshScale))||props.meshCenter.some(v=>!Number.isFinite(v))){setScaleError('Invalid coverage mesh scale, center, or radius');return;}
        setScaleError(null);
        rt.sphere.scale.setScalar(props.radius);rt.grid.scale.setScalar(props.radius*1.002);rt.model.scale.setScalar(props.meshScale);
        rt.model.position.set(-props.meshCenter[0],-props.meshCenter[1],-props.meshCenter[2]);rt.render();
    },[props.radius,props.meshScale,...props.meshCenter]);
    useEffect(()=>{runtime.current?.reset();},[props.radius]);
    useEffect(()=>{
        const rt=runtime.current;if(!rt)return;
        const abort=new AbortController();setLoading(true);setError(null);rt.model.visible=false;rt.render();
        void fetch(props.meshUrl,{signal:abort.signal}).then(response=>{
            if(!response.ok)throw new Error(`STL request failed (${response.status})`);return response.arrayBuffer();
        }).then(data=>{
            if(abort.signal.aborted)return;
            const geometry=new STLLoader().parse(data);geometry.computeBoundingBox();
            const box=geometry.boundingBox;
            if(!box||box.isEmpty()||![...box.min.toArray(),...box.max.toArray()].every(Number.isFinite)){geometry.dispose();throw new Error('STL has no finite geometry');}
            geometry.computeVertexNormals();rt.model.geometry.dispose();rt.model.geometry=geometry;rt.model.visible=true;setLoading(false);rt.render();
        }).catch(e=>{if(!abort.signal.aborted){setError(String(e));setLoading(false);}});
        return()=>abort.abort();
    },[props.meshUrl]);
    return <section className="sdk-spherical-coverage" aria-label="Spherical viewpoint coverage">
        <div className="sdk-coverage-actions"><ButtonSm text="Reset view" textColor="" onClick={()=>runtime.current?.reset()}/>
            <AnchoredInfo title="Coverage viewer controls" text="Drag to orbit; scroll to zoom. Reset view or press R on the viewer to restore the initial view. Orbit changes the view, not the supplied coverage bins. The near hemisphere is shown to avoid mixing front and back counts. Gray cells contain no supplied examples; colored cells show counts."/>
            {loading&&<span role="status">Loading STL…</span>}</div>
        <div ref={host} className="sdk-coverage-canvas"/>
        {(error||gridError||scaleError)&&<div role="alert" className="sdk-image-save-error">{error||gridError||scaleError}</div>}
    </section>;
}
