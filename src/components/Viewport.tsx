import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid, GizmoHelper, GizmoViewcube, PerspectiveCamera, OrthographicCamera } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, DepthOfField, Noise, ChromaticAberration, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import type { SceneObj, Vec3 } from '../types';
import { buildGeometry } from '../three/geometry';
import { buildMaterial } from '../three/materials';
import { loadModel } from '../three/models';
import { registry, runtime } from '../runtime';

export const sceneRefs: { content?: THREE.Group; gl?: THREE.WebGLRenderer; scene?: THREE.Scene; camera?: THREE.Camera; controls?: any } = {};

const D2R = Math.PI / 180;
const rad = (r: Vec3) => [r[0] * D2R, r[1] * D2R, r[2] * D2R] as [number, number, number];

type ChildMap = Map<string | null, SceneObj[]>;

function useChildMap(): ChildMap {
  const objects = useStore((s) => s.objects);
  return useMemo(() => {
    const m: ChildMap = new Map();
    for (const o of objects) {
      const k = o.parentId;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(o);
    }
    return m;
  }, [objects]);
}

function ShapeMesh({ obj }: { obj: SceneObj }) {
  const geo = useMemo(() => buildGeometry(obj.type, obj.params), [obj.type, JSON.stringify(obj.params)]);
  const mat = useMemo(() => buildMaterial(obj.material), [JSON.stringify(obj.material)]);
  useEffect(() => () => geo?.dispose(), [geo]);
  useEffect(() => () => mat.dispose(), [mat]);
  if (!geo) return null;
  return <mesh geometry={geo} material={mat} castShadow={obj.castShadow} receiveShadow={obj.receiveShadow} userData={{ ownerId: obj.id }} />;
}

function ModelMesh({ obj }: { obj: SceneObj }) {
  const [node, setNode] = useState<THREE.Object3D | null>(null);
  const mat = useMemo(() => (obj.material.override ? buildMaterial(obj.material) : null), [JSON.stringify(obj.material)]);
  useEffect(() => {
    let alive = true;
    if (obj.model) loadModel(obj.model.url, obj.model.format).then((n) => alive && setNode(n)).catch((e) => console.error(e));
    return () => { alive = false; };
  }, [obj.model?.url]);
  useEffect(() => {
    node?.traverse((c: any) => {
      if (c.isMesh) {
        c.userData.ownerId = obj.id;
        c.castShadow = obj.castShadow;
        c.receiveShadow = obj.receiveShadow;
        if (mat) { c.userData.origMat ??= c.material; c.material = mat; }
        else if (c.userData.origMat) c.material = c.userData.origMat;
      }
    });
  }, [node, mat, obj.castShadow, obj.receiveShadow]);
  return node ? <primitive object={node} /> : null;
}

function LightNode({ obj, edit }: { obj: SceneObj; edit: boolean }) {
  const l = obj.light!;
  const shadowProps = { 'shadow-mapSize': [2048, 2048] as any, 'shadow-bias': -0.0005, 'shadow-normalBias': 0.02 };
  const scene = useStore((s) => s.scene);
  const helper = (
    <mesh userData={{ helper: true, ownerId: obj.id }} visible={edit}>
      <sphereGeometry args={[0.12, 16, 8]} />
      <meshBasicMaterial color={l.color} wireframe />
    </mesh>
  );
  if (obj.type === 'directionalLight')
    return (
      <>
        <directionalLight color={l.color} intensity={l.intensity} castShadow={l.castShadow && scene.shadows} {...shadowProps}
          shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8} shadow-camera-far={40} shadow-radius={scene.shadowSoftness} />
        {helper}
      </>
    );
  if (obj.type === 'spotLight')
    return (
      <>
        <spotLight color={l.color} intensity={l.intensity} distance={l.distance} angle={l.angle * D2R} penumbra={l.penumbra} decay={2}
          castShadow={l.castShadow && scene.shadows} {...shadowProps} shadow-radius={scene.shadowSoftness} />
        {helper}
      </>
    );
  return (
    <>
      <pointLight color={l.color} intensity={l.intensity} distance={l.distance} decay={2} castShadow={l.castShadow && scene.shadows} {...shadowProps} shadow-radius={scene.shadowSoftness} />
      {helper}
    </>
  );
}

const SceneNode = memo(function SceneNode({ obj, childMap }: { obj: SceneObj; childMap: ChildMap }) {
  const mode = useStore((s) => s.mode);
  const select = useStore((s) => s.select);
  const edit = mode === 'edit';
  const isLight = obj.type.endsWith('Light');
  const children = childMap.get(obj.id) ?? [];
  return (
    <group
      ref={(r) => { if (r) registry.set(obj.id, r); else registry.delete(obj.id); }}
      name={obj.name}
      position={obj.position}
      rotation={rad(obj.rotation)}
      scale={obj.scale}
      visible={obj.visible}
      userData={{ objId: obj.id }}
      onClick={(e) => {
        if (!edit) return;
        // Deepest object under the cursor wins; locked objects pass the click through.
        if (obj.locked) return;
        e.stopPropagation();
        select(obj.id, e.nativeEvent.shiftKey);
      }}
      onContextMenu={(e) => {
        if (!edit || obj.locked) return;
        e.stopPropagation();
        e.nativeEvent.preventDefault();
        if (!useStore.getState().selected.includes(obj.id)) select(obj.id);
        useStore.getState().set({ menu: { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY } });
      }}
      onPointerDown={(e) => { if (!edit) { e.stopPropagation(); runtime.handle('mouseDown', obj.id); } }}
      onPointerOver={(e) => { if (!edit) { e.stopPropagation(); runtime.handle('mouseHover', obj.id, true); document.body.style.cursor = obj.events.length ? 'pointer' : ''; } }}
      onPointerOut={(e) => { if (!edit) { e.stopPropagation(); runtime.handle('mouseHover', obj.id, false); document.body.style.cursor = ''; } }}
    >
      {isLight ? <LightNode obj={obj} edit={edit} /> : obj.type === 'model' ? <ModelMesh obj={obj} /> : obj.type !== 'group' ? <ShapeMesh obj={obj} /> : null}
      {children.map((c) => <SceneNode key={c.id} obj={c} childMap={childMap} />)}
    </group>
  );
});

function Content() {
  const childMap = useChildMap();
  const ref = useRef<THREE.Group>(null!);
  useEffect(() => { sceneRefs.content = ref.current; }, []);
  return (
    <group ref={ref} name="Scene">
      {(childMap.get(null) ?? []).map((o) => <SceneNode key={o.id} obj={o} childMap={childMap} />)}
    </group>
  );
}

function Environment() {
  const { gl, scene } = useThree();
  const s = useStore((st) => st.scene);
  useEffect(() => {
    if (s.environment === 'none') { scene.environment = null; return; }
    const pm = new THREE.PMREMGenerator(gl);
    const tex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = tex;
    return () => { tex.dispose(); pm.dispose(); };
  }, [s.environment]);
  useEffect(() => { (scene as any).environmentIntensity = s.envIntensity; }, [s.envIntensity]);
  useEffect(() => {
    scene.background = s.transparentBg ? null : new THREE.Color(s.background);
    gl.toneMapping = s.post.toneMapping ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    scene.fog = s.fog.enabled ? new THREE.Fog(s.fog.color, s.fog.near, s.fog.far) : null;
  }, [s.background, s.transparentBg, s.post.toneMapping, JSON.stringify(s.fog)]);
  return <ambientLight color={s.ambientColor} intensity={s.ambientIntensity} />;
}

function SelectionBoxes() {
  const selected = useStore((s) => s.selected);
  const mode = useStore((s) => s.mode);
  const helpers = useMemo(() => selected.map(() => new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#2f80ff'))), [selected.join()]);
  useFrame(() => {
    selected.forEach((id, i) => {
      const o = registry.get(id);
      const h = helpers[i];
      if (!o || !h) return;
      h.box.setFromObject(o, true);
      if (h.box.isEmpty()) h.box.setFromCenterAndSize(o.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(0.3, 0.3, 0.3));
    });
  });
  if (mode !== 'edit') return null;
  return <>{helpers.map((h, i) => <primitive key={i} object={h} />)}</>;
}

function Gizmo() {
  const selected = useStore((s) => s.selected);
  const objects = useStore((s) => s.objects);
  const gizmo = useStore((s) => s.gizmo);
  const space = useStore((s) => s.space);
  const snap = useStore((s) => s.snap);
  const update = useStore((s) => s.update);
  const [target, setTarget] = useState<THREE.Object3D | undefined>();
  const id = selected[0];
  const obj = objects.find((o) => o.id === id);
  useEffect(() => { setTarget(id ? registry.get(id) : undefined); }, [id, objects]);
  if (!target || !obj || obj.locked) return null;
  return (
    <TransformControls
      object={target}
      mode={gizmo}
      space={space}
      size={0.8}
      translationSnap={snap ? 0.25 : null}
      rotationSnap={snap ? 15 * D2R : null}
      scaleSnap={snap ? 0.1 : null}
      onMouseUp={() => {
        const r = target.rotation;
        const round = (v: number) => Math.round(v * 1000) / 1000;
        update(obj.id, {
          position: target.position.toArray().map(round) as Vec3,
          rotation: [r.x / D2R, r.y / D2R, r.z / D2R].map((v) => Math.round(v * 100) / 100) as Vec3,
          scale: target.scale.toArray().map(round) as Vec3,
        }, `gizmo:${Date.now()}`);
      }}
    />
  );
}

function Effects() {
  const p = useStore((s) => s.scene.post);
  const any = p.bloom.enabled || p.vignette.enabled || p.dof.enabled || p.noise.enabled || p.chromatic.enabled;
  if (!any) return null;
  const fx: any[] = [];
  if (p.bloom.enabled) fx.push(<Bloom key="b" intensity={p.bloom.intensity} luminanceThreshold={p.bloom.threshold} mipmapBlur />);
  if (p.dof.enabled) fx.push(<DepthOfField key="d" focusDistance={p.dof.focus} focalLength={0.05} bokehScale={p.dof.blur} />);
  if (p.chromatic.enabled) fx.push(<ChromaticAberration key="c" offset={new THREE.Vector2(p.chromatic.offset, p.chromatic.offset)} />);
  if (p.noise.enabled) fx.push(<Noise key="n" opacity={p.noise.opacity} />);
  if (p.vignette.enabled) fx.push(<Vignette key="v" darkness={p.vignette.darkness} offset={0.3} />);
  // The composer renders in linear space, so tone mapping has to be its own pass.
  if (p.toneMapping) fx.push(<ToneMapping key="t" mode={ToneMappingMode.ACES_FILMIC} />);
  return <EffectComposer multisampling={4}>{fx}</EffectComposer>;
}

function Bridge() {
  const { gl, scene, camera, controls } = useThree();
  useEffect(() => { sceneRefs.gl = gl; sceneRefs.scene = scene; }, [gl, scene]);
  useEffect(() => { sceneRefs.camera = camera; sceneRefs.controls = controls; }, [camera, controls]);
  useFrame(() => runtime.tick(performance.now()));
  return null;
}

function Cameras() {
  const s = useStore((st) => st.scene);
  return s.camera === 'orthographic'
    ? <OrthographicCamera makeDefault position={[5, 4, 6]} zoom={110} near={-100} far={200} />
    : <PerspectiveCamera makeDefault position={[4.5, 3.5, 6]} fov={s.fov} near={0.05} far={500} />;
}

export function Viewport() {
  const mode = useStore((s) => s.mode);
  const scene = useStore((s) => s.scene);
  const select = useStore((s) => s.select);
  const edit = mode === 'edit';
  return (
    <Canvas
      shadows={scene.shadows ? 'soft' : false}
      dpr={[1, 2]}
      gl={{ preserveDrawingBuffer: true, antialias: true, alpha: true }}
      onPointerMissed={() => edit && select(null)}
      onPointerMove={(e) => {
        const r = (e.target as HTMLElement).getBoundingClientRect();
        runtime.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      }}
      onWheel={(e) => !edit && runtime.onScroll(e.deltaY)}
    >
      <Cameras />
      <Bridge />
      <Environment />
      <Content />
      {edit && <SelectionBoxes />}
      {edit && <Gizmo />}
      {edit && scene.grid && (
        <Grid infiniteGrid cellSize={0.5} sectionSize={2.5} cellColor="#c9c9d6" sectionColor="#a5a5b8" fadeDistance={40} cellThickness={0.6} sectionThickness={1} position={[0, -0.001, 0]} />
      )}
      <OrbitControls
        makeDefault
        enableDamping
        enabled={edit || scene.play.orbit}
        enableZoom={edit || scene.play.zoom}
        enablePan={edit || scene.play.pan}
        autoRotate={!edit && scene.play.autoRotate}
      />
      {edit && (
        <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
          <GizmoViewcube color="#ffffff" textColor="#333" strokeColor="#999" opacity={0.95} />
        </GizmoHelper>
      )}
      <Effects />
    </Canvas>
  );
}
