import { useEffect, useMemo, useRef, type ComponentRef } from 'react';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Grid, OrbitControls } from '@react-three/drei';
import { AlertTriangle, CheckCircle2, Eye, Focus, Loader2, Maximize2 } from 'lucide-react';
import * as THREE from 'three';
import { computeCreaseNormalsBuffer } from '../engine/meshNormals';
import { DIE_DISPLAY_NAMES, DIE_ORDER } from '../engine/presets';
import { useDiceStore } from '../store/useDiceStore';
import type {
  FacePreviewInfo,
  GeneratedDieResult,
  MeshBufferData,
  ResinPreviewPreset,
  Vec3,
  ViewportMode,
} from '../types/dice';

interface ResinMaterialSpec {
  id: ResinPreviewPreset;
  label: string;
  swatch: string;
  color: string;
  roughness: number;
  metalness: number;
  transparent?: boolean;
  opacity?: number;
}

const RESIN_PRESET_LIST: ResinMaterialSpec[] = [
  {
    id: 'master_grey',
    label: 'Master Grey',
    swatch: '#64748b',
    color: '#64748b',
    roughness: 0.42,
    metalness: 0.12,
  },
  {
    id: 'arcane_sapphire',
    label: 'Arcane Sapphire',
    swatch: '#2563eb',
    color: '#2563eb',
    roughness: 0.24,
    metalness: 0.18,
  },
  {
    id: 'cure_clear',
    label: 'Cure Clear',
    swatch: '#38bdf8',
    color: '#7dd3fc',
    roughness: 0.12,
    metalness: 0.05,
    transparent: true,
    opacity: 0.68,
  },
  {
    id: 'obsidian_cyan',
    label: 'Obsidian',
    swatch: '#1e293b',
    color: '#1e293b',
    roughness: 0.28,
    metalness: 0.36,
  },
];

const RESIN_BY_ID: Record<ResinPreviewPreset, ResinMaterialSpec> = {
  master_grey: RESIN_PRESET_LIST[0],
  arcane_sapphire: RESIN_PRESET_LIST[1],
  cure_clear: RESIN_PRESET_LIST[2],
  obsidian_cyan: RESIN_PRESET_LIST[3],
};

function useThreeGeometry(mesh: MeshBufferData | null): THREE.BufferGeometry | null {
  const geo = useMemo(() => {
    if (!mesh) return null;
    const { positions, normals } = computeCreaseNormalsBuffer(mesh);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    g.computeBoundingSphere();
    return g;
  }, [mesh]);

  useEffect(() => {
    return () => {
      geo?.dispose();
    };
  }, [geo]);

  return geo;
}

function findNearestFace(
  pointInCadSpace: THREE.Vector3,
  normalInCadSpace: THREE.Vector3,
  faces: FacePreviewInfo[],
): FacePreviewInfo | null {
  let best: FacePreviewInfo | null = null;
  let bestScore = -Infinity;
  const nArr: Vec3 = [normalInCadSpace.x, normalInCadSpace.y, normalInCadSpace.z];
  const pArr: Vec3 = [pointInCadSpace.x, pointInCadSpace.y, pointInCadSpace.z];

  for (const f of faces) {
    if (!f.isNumbered) continue;
    const nDot = f.normal[0] * nArr[0] + f.normal[1] * nArr[1] + f.normal[2] * nArr[2];
    const dist = Math.hypot(
      pArr[0] - f.origin3D[0],
      pArr[1] - f.origin3D[1],
      pArr[2] - f.origin3D[2],
    );
    const score = nDot * 10 - dist * 0.15;
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return best;
}

function CameraController({
  resetSeq,
  viewportMode,
  controlsRef,
}: {
  resetSeq: number;
  viewportMode: ViewportMode;
  controlsRef: React.RefObject<ComponentRef<typeof OrbitControls> | null>;
}) {
  const { camera } = useThree();
  const prevSeqRef = useRef(resetSeq);
  const prevModeRef = useRef(viewportMode);

  useEffect(() => {
    const seqChanged = prevSeqRef.current !== resetSeq;
    const modeSwitchedToTray = prevModeRef.current !== viewportMode && viewportMode === 'tray';
    const modeSwitchedFromTray = prevModeRef.current === 'tray' && viewportMode !== 'tray';
    prevSeqRef.current = resetSeq;
    prevModeRef.current = viewportMode;

    if (!seqChanged && !modeSwitchedToTray && !modeSwitchedFromTray) return;

    if (viewportMode === 'tray') {
      camera.position.set(0, 62, 72);
    } else {
      camera.position.set(28, 24, 32);
    }
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    } else {
      camera.lookAt(0, 0, 0);
    }
  }, [resetSeq, viewportMode, camera, controlsRef]);

  return null;
}

interface DieSceneObjectProps {
  result: GeneratedDieResult;
  mode: 'single' | 'xray' | 'supports';
  resin: ResinMaterialSpec;
  onPickFace?: (faceId: string) => void;
}

function DieSceneObject({ result, mode, resin, onPickFace }: DieSceneObjectProps) {
  const masterGeo = useThreeGeometry(result.masterMesh);
  const blankGeo = useThreeGeometry(mode === 'xray' ? result.blankMesh : null);
  const supportGeo = useThreeGeometry(mode === 'supports' ? result.supportMesh : null);

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (!onPickFace || !e.face) return;
    e.stopPropagation();
    const invMatrix = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    const localPoint = e.point.clone().applyMatrix4(invMatrix);
    const localNormal = e.face.normal.clone().normalize();
    const matched = findNearestFace(localPoint, localNormal, result.faces);
    if (matched) onPickFace(matched.id);
  };

  if (!masterGeo) return null;

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {mode === 'xray' ? (
        <>
          {blankGeo && (
            <mesh geometry={blankGeo} castShadow receiveShadow>
              <meshStandardMaterial
                color={result.breach.hasBreach ? '#ef4444' : '#f59e0b'}
                roughness={0.35}
                metalness={0.18}
              />
            </mesh>
          )}
          <mesh geometry={masterGeo}>
            <meshPhysicalMaterial
              color="#7dd3fc"
              transparent
              opacity={0.32}
              roughness={0.15}
              metalness={0.05}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        </>
      ) : (
        <mesh
          geometry={masterGeo}
          castShadow
          receiveShadow
          onClick={handlePointerDown}
        >
          {resin.transparent ? (
            <meshPhysicalMaterial
              color={resin.color}
              roughness={resin.roughness}
              metalness={resin.metalness}
              transparent
              opacity={resin.opacity ?? 0.68}
              depthWrite
            />
          ) : (
            <meshStandardMaterial
              color={resin.color}
              roughness={resin.roughness}
              metalness={resin.metalness}
            />
          )}
        </mesh>
      )}

      {mode === 'supports' && supportGeo && (
        <mesh geometry={supportGeo} castShadow receiveShadow>
          <meshStandardMaterial color="#38bdf8" roughness={0.38} metalness={0.15} />
        </mesh>
      )}
    </group>
  );
}

function TrayScene({
  results,
  activeDie,
  resin,
  onSelectDie,
}: {
  results: Partial<Record<string, GeneratedDieResult>>;
  activeDie: string;
  resin: ResinMaterialSpec;
  onSelectDie: (kind: string) => void;
}) {
  const entries = DIE_ORDER.map((k) => results[k]).filter((r): r is GeneratedDieResult => Boolean(r));

  return (
    <group>
      {entries.map((res, idx) => {
        const col = (idx % 5) - 2;
        const row = Math.floor(idx / 5) - 0.5;
        const x = col * 32;
        const z = row * 34;
        const yLift = -(res.masterMesh.boundsMin[2] ?? -8);
        const isCurrent = res.kind === activeDie;
        return (
          <TrayDieMesh
            key={res.kind}
            result={res}
            position={[x, yLift, z]}
            highlighted={isCurrent}
            resin={resin}
            onClick={() => onSelectDie(res.kind)}
          />
        );
      })}
    </group>
  );
}

function TrayDieMesh({
  result,
  position,
  highlighted,
  resin,
  onClick,
}: {
  result: GeneratedDieResult;
  position: [number, number, number];
  highlighted: boolean;
  resin: ResinMaterialSpec;
  onClick: () => void;
}) {
  const geo = useThreeGeometry(result.masterMesh);
  if (!geo) return null;
  return (
    <group position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh
        geometry={geo}
        castShadow
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <meshStandardMaterial
          color={highlighted ? '#f59e0b' : resin.color}
          roughness={resin.roughness}
          metalness={resin.metalness}
        />
      </mesh>
    </group>
  );
}

export function Viewport3D() {
  const project = useDiceStore((s) => s.project);
  const activeResult = useDiceStore((s) => s.activeResult);
  const trayResults = useDiceStore((s) => s.trayResults);
  const isGenerating = useDiceStore((s) => s.isGenerating);
  const generationError = useDiceStore((s) => s.generationError);
  const resinPreset = useDiceStore((s) => s.resinPreset);
  const resolvedTheme = useDiceStore((s) => s.resolvedTheme);
  const isFocusMode = useDiceStore((s) => s.isFocusMode);
  const cameraResetSeq = useDiceStore((s) => s.cameraResetSeq);

  const setSelectedFaceId = useDiceStore((s) => s.setSelectedFaceId);
  const setActiveDie = useDiceStore((s) => s.setActiveDie);
  const setResinPreset = useDiceStore((s) => s.setResinPreset);
  const triggerCameraFit = useDiceStore((s) => s.triggerCameraFit);
  const toggleFocusMode = useDiceStore((s) => s.toggleFocusMode);

  const controlsRef = useRef<ComponentRef<typeof OrbitControls> | null>(null);
  const resin = RESIN_BY_ID[resinPreset];

  const numberedFaces = useMemo(
    () => (activeResult?.faces ?? []).filter((f) => f.isNumbered),
    [activeResult],
  );

  const sceneMode =
    project.viewportMode === 'xray'
      ? 'xray'
      : project.viewportMode === 'supports'
        ? 'supports'
        : 'single';

  const floorY =
    project.viewportMode === 'supports'
      ? 0
      : project.viewportMode === 'tray'
        ? 0
        : (activeResult?.masterMesh.boundsMin[2] ?? -10) - 0.5;

  const canvasBg = resolvedTheme === 'light' ? '#e6edf8' : '#090d1a';
  const gridCellColor = resolvedTheme === 'light' ? '#cbd5e1' : '#1e293b';
  const gridSectionColor = resolvedTheme === 'light' ? '#94a3b8' : '#334155';

  return (
    <main className="viewport-pane" aria-label="Interactive 3D Die Viewport">
      <div className="viewport-top-overlay">
        {project.viewportMode !== 'tray' && numberedFaces.length > 0 ? (
          <div className="face-strip" role="group" aria-label="Select Die Face for Overrides">
            <span className="face-strip-label">Faces:</span>
            <button
              type="button"
              className="face-chip"
              aria-pressed={project.selectedFaceId === null}
              onClick={() => setSelectedFaceId(null)}
            >
              All
            </button>
            {numberedFaces.map((f) => (
              <button
                key={f.id}
                type="button"
                className="face-chip"
                aria-pressed={project.selectedFaceId === f.id}
                onClick={() => setSelectedFaceId(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ flex: 1 }} />
        )}

        <div className="viewport-quick-tools">
          {isGenerating && (
            <div className="generating-pill" aria-live="polite">
              <Loader2 size={12} className="spin" aria-hidden="true" />
              Building mesh…
            </div>
          )}

          <div
            role="toolbar"
            aria-label="Viewport shader and camera controls"
            className="header-group"
          >
            <div className="resin-preset-bar" role="group" aria-label="Resin material presets">
              {RESIN_PRESET_LIST.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="resin-chip"
                  aria-pressed={resinPreset === preset.id}
                  title={`Preview ${preset.label} resin`}
                  onClick={() => setResinPreset(preset.id)}
                >
                  <span
                    className="resin-swatch"
                    style={{ background: preset.swatch }}
                    aria-hidden="true"
                  />
                  {preset.label}
                </button>
              ))}
            </div>

            <span role="separator" aria-orientation="vertical" className="toolbar-sep" />

            <button
              type="button"
              className="btn btn-compact"
              title="Fit & Reset Camera (F)"
              onClick={triggerCameraFit}
            >
              <Maximize2 size={12} aria-hidden="true" />
              Fit
            </button>

            <button
              type="button"
              className="btn btn-compact"
              aria-pressed={isFocusMode}
              title="Toggle Focus Mode (\)"
              onClick={toggleFocusMode}
            >
              {isFocusMode ? (
                <Eye size={12} aria-hidden="true" />
              ) : (
                <Focus size={12} aria-hidden="true" />
              )}
              Focus
            </button>
          </div>
        </div>
      </div>

      <div className="viewport-canvas-wrap">
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [28, 24, 32], fov: 40, near: 0.1, far: 1000 }}
        >
          <color attach="background" args={[canvasBg]} />
          <ambientLight intensity={resolvedTheme === 'light' ? 0.78 : 0.62} />
          <directionalLight position={[32, 46, 30]} intensity={1.75} castShadow />
          <directionalLight position={[-30, 18, -28]} intensity={0.75} color="#93c5fd" />
          <directionalLight position={[0, -25, 18]} intensity={0.45} color="#fde68a" />

          <CameraController
            resetSeq={cameraResetSeq}
            viewportMode={project.viewportMode}
            controlsRef={controlsRef}
          />

          {project.viewportMode === 'tray' ? (
            <TrayScene
              results={trayResults}
              activeDie={project.activeDie}
              resin={resin}
              onSelectDie={(k) => setActiveDie(k as typeof project.activeDie)}
            />
          ) : activeResult ? (
            <DieSceneObject
              result={activeResult}
              mode={sceneMode}
              resin={resin}
              onPickFace={(faceId) => setSelectedFaceId(faceId)}
            />
          ) : null}

          <Grid
            position={[0, floorY, 0]}
            args={[180, 180]}
            cellSize={5}
            cellThickness={0.5}
            cellColor={gridCellColor}
            sectionSize={20}
            sectionThickness={1}
            sectionColor={gridSectionColor}
            fadeDistance={160}
          />
          <ContactShadows
            position={[0, floorY + 0.02, 0]}
            opacity={resolvedTheme === 'light' ? 0.32 : 0.45}
            scale={110}
            blur={1.8}
            far={40}
          />

          <OrbitControls
            ref={controlsRef}
            makeDefault
            enableDamping
            dampingFactor={0.08}
            minDistance={12}
            maxDistance={220}
          />
        </Canvas>
      </div>

      {activeResult && (
        <section className="caliper-hud" aria-label="Caliper and Mesh Integrity Readout">
          <div className="caliper-grid">
            <div>
              <span className="hud-metric-label">
                {DIE_DISPLAY_NAMES[activeResult.kind]} Master
              </span>
              <span className="hud-metric-value">
                {activeResult.calipers.masterFaceToFaceMm.toFixed(2)} mm
              </span>
            </div>
            <div>
              <span className="hud-metric-label">Matched Blank</span>
              <span className="hud-metric-value" style={{ color: 'var(--brand-cyan)' }}>
                {activeResult.calipers.blankFaceToFaceMm.toFixed(2)} mm
              </span>
            </div>
            <div>
              <span className="hud-metric-label">Triangles</span>
              <span className="hud-metric-value">
                {activeResult.masterMesh.triangleCount.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="hud-status-row">
            {generationError ? (
              <span className="status-badge warn">
                <AlertTriangle size={14} aria-hidden="true" />
                {generationError}
              </span>
            ) : activeResult.breach.hasBreach ? (
              <span className="status-badge warn">
                <AlertTriangle size={14} aria-hidden="true" />
                Blank breaches engraving ({activeResult.breach.breachVolumeMm3.toFixed(2)} mm³)
              </span>
            ) : activeResult.masterMesh.manifoldStatus === 'NoError' ? (
              <span className="status-badge ok">
                <CheckCircle2 size={14} aria-hidden="true" />
                Watertight Manifold · Shell OK ({activeResult.calipers.effectiveClearanceMm.toFixed(2)} mm clear)
              </span>
            ) : (
              <span className="status-badge warn">
                <AlertTriangle size={14} aria-hidden="true" />
                Mesh status: {activeResult.masterMesh.manifoldStatus}
              </span>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
