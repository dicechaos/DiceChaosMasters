import { useEffect, useMemo, useRef, type ComponentRef } from 'react';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Grid, OrbitControls } from '@react-three/drei';
import { AlertTriangle, CheckCircle2, Eye, Focus, Loader2, Maximize2 } from 'lucide-react';
import * as THREE from 'three';
import { computeCreaseNormalsBuffer } from '../engine/meshNormals';
import {
  getDieInstanceLabel,
  getDieInstanceShortTag,
  getProjectDieOrder,
  normalizeSelectedDice,
} from '../engine/presets';
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

function computeTrayGridCols(total: number): number {
  if (total <= 4) return Math.max(1, total);
  if (total <= 10) return 5;
  return Math.min(7, Math.ceil(Math.sqrt(total * 1.4)));
}

function CameraController({
  resetSeq,
  viewportMode,
  trayCount,
  controlsRef,
}: {
  resetSeq: number;
  viewportMode: ViewportMode;
  trayCount: number;
  controlsRef: React.RefObject<ComponentRef<typeof OrbitControls> | null>;
}) {
  const { camera } = useThree();
  const prevSeqRef = useRef(resetSeq);
  const prevModeRef = useRef(viewportMode);
  const prevCountRef = useRef(trayCount);

  useEffect(() => {
    const seqChanged = prevSeqRef.current !== resetSeq;
    const modeSwitchedToTray = prevModeRef.current !== viewportMode && viewportMode === 'tray';
    const modeSwitchedFromTray = prevModeRef.current === 'tray' && viewportMode !== 'tray';
    const trayGrewSignificantly =
      viewportMode === 'tray' && Math.abs(prevCountRef.current - trayCount) >= 2;
    prevSeqRef.current = resetSeq;
    prevModeRef.current = viewportMode;
    prevCountRef.current = trayCount;

    if (!seqChanged && !modeSwitchedToTray && !modeSwitchedFromTray && !trayGrewSignificantly) {
      return;
    }

    if (viewportMode === 'tray') {
      const total = Math.max(1, trayCount);
      const cols = computeTrayGridCols(total);
      const rows = Math.ceil(total / cols);
      const scale = Math.max(1, cols / 5, rows / 2.2);
      camera.position.set(0, 62 * scale, 72 * scale);
    } else {
      camera.position.set(28, 24, 32);
    }
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    } else {
      camera.lookAt(0, 0, 0);
    }
  }, [resetSeq, viewportMode, trayCount, camera, controlsRef]);

  return null;
}

interface DieSceneObjectProps {
  result: GeneratedDieResult;
  mode: 'single' | 'xray' | 'supports';
  resin: ResinMaterialSpec;
  onPickFace?: (faceId: string) => void;
  onContextMenuFace?: (face: FacePreviewInfo, clientX: number, clientY: number) => void;
}

function DieSceneObject({
  result,
  mode,
  resin,
  onPickFace,
  onContextMenuFace,
}: DieSceneObjectProps) {
  const masterGeo = useThreeGeometry(result.masterMesh);
  const blankGeo = useThreeGeometry(mode === 'xray' ? result.blankMesh : null);
  const supportGeo = useThreeGeometry(mode === 'supports' ? result.supportMesh : null);

  const pickFaceFromEvent = (
    e: ThreeEvent<MouseEvent | PointerEvent>,
  ): FacePreviewInfo | null => {
    if (!e.face) return null;
    const invMatrix = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    const localPoint = e.point.clone().applyMatrix4(invMatrix);
    const localNormal = e.face.normal.clone().normalize();
    return findNearestFace(localPoint, localNormal, result.faces);
  };

  const handleFaceClick = (e: ThreeEvent<MouseEvent>) => {
    if (!onPickFace) return;
    e.stopPropagation();
    const matched = pickFaceFromEvent(e);
    if (matched) onPickFace(matched.id);
  };

  const handleFaceContextMenu = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    e.nativeEvent.preventDefault();
    if (!onContextMenuFace) return;
    const matched = pickFaceFromEvent(e);
    if (matched) {
      onContextMenuFace(matched, e.nativeEvent.clientX, e.nativeEvent.clientY);
    }
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
          <mesh
            geometry={masterGeo}
            onClick={handleFaceClick}
            onContextMenu={handleFaceContextMenu}
          >
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
          onClick={handleFaceClick}
          onContextMenu={handleFaceContextMenu}
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
  dieOrder,
  results,
  activeDie,
  selectedDice,
  resin,
  resolvedTheme,
  onSelectDie,
  onContextMenuDie,
}: {
  dieOrder: string[];
  results: Partial<Record<string, GeneratedDieResult>>;
  activeDie: string;
  selectedDice: string[];
  resin: ResinMaterialSpec;
  resolvedTheme: 'dark' | 'light';
  onSelectDie: (dieId: string, opts: { toggle: boolean; range: boolean }) => void;
  onContextMenuDie: (dieId: string, clientX: number, clientY: number) => void;
}) {
  const entries = dieOrder
    .map((id) => ({ id, res: results[id] }))
    .filter((item): item is { id: string; res: GeneratedDieResult } => Boolean(item.res));
  const selectedSet = new Set<string>(selectedDice);
  const hasGroupSelection = selectedDice.length > 1;
  const total = Math.max(dieOrder.length, entries.length, 1);
  const cols = computeTrayGridCols(total);
  const rows = Math.ceil(total / cols);

  return (
    <group>
      {entries.map(({ id, res }) => {
        const orderIdx = Math.max(0, dieOrder.indexOf(id));
        const col = orderIdx % cols;
        const row = Math.floor(orderIdx / cols);
        const x = (col - (cols - 1) / 2) * 32;
        const z = (row - (rows - 1) / 2) * 34;
        const yLift = -(res.masterMesh.boundsMin[2] ?? -8);
        const isPrimary = id === activeDie;
        const isSelected = selectedSet.has(id);
        return (
          <TrayDieMesh
            key={id}
            result={res}
            position={[x, yLift, z]}
            isPrimary={isPrimary}
            isSelected={isSelected}
            hasGroupSelection={hasGroupSelection}
            resin={resin}
            resolvedTheme={resolvedTheme}
            onClick={(opts) => onSelectDie(id, opts)}
            onContextMenu={(cx, cy) => onContextMenuDie(id, cx, cy)}
          />
        );
      })}
    </group>
  );
}

function TrayDieMesh({
  result,
  position,
  isPrimary,
  isSelected,
  hasGroupSelection,
  resin,
  resolvedTheme,
  onClick,
  onContextMenu,
}: {
  result: GeneratedDieResult;
  position: [number, number, number];
  isPrimary: boolean;
  isSelected: boolean;
  hasGroupSelection: boolean;
  resin: ResinMaterialSpec;
  resolvedTheme: 'dark' | 'light';
  onClick: (opts: { toggle: boolean; range: boolean }) => void;
  onContextMenu: (clientX: number, clientY: number) => void;
}) {
  const geo = useThreeGeometry(result.masterMesh);
  if (!geo) return null;

  const highlighted = hasGroupSelection ? isSelected : isPrimary;
  const dimmed = hasGroupSelection && !isSelected;
  const useTransparent = !dimmed && Boolean(resin.transparent);
  const materialOpacity = useTransparent ? (resin.opacity ?? 0.68) : 1;
  const ringInner = Math.max(8, (result.calipers.masterFaceToFaceMm || 16) * 0.62);
  const ringOuter = ringInner + 1.8;
  const ringLocalZ = (result.masterMesh.boundsMin[2] ?? -8) + 0.08;

  return (
    <group position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh
        geometry={geo}
        castShadow
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onClick({
            toggle: Boolean(e.ctrlKey || e.metaKey),
            range: Boolean(e.shiftKey),
          });
        }}
        onContextMenu={(e) => {
          e.stopPropagation();
          e.nativeEvent.preventDefault();
          onContextMenu(e.nativeEvent.clientX, e.nativeEvent.clientY);
        }}
      >
        <meshStandardMaterial
          key={useTransparent ? 'transparent' : 'opaque'}
          color={
            dimmed
              ? resolvedTheme === 'light'
                ? '#cbd5e1'
                : '#36465d'
              : highlighted
                ? isPrimary
                  ? '#f59e0b'
                  : '#fbbf24'
                : resin.color
          }
          emissive={!dimmed && hasGroupSelection && isSelected ? '#b45309' : '#000000'}
          emissiveIntensity={
            !dimmed && hasGroupSelection && isSelected ? (isPrimary ? 0.22 : 0.14) : 0
          }
          roughness={dimmed ? 0.82 : resin.roughness}
          metalness={dimmed ? 0.04 : resin.metalness}
          transparent={useTransparent}
          opacity={materialOpacity}
          depthWrite={true}
        />
      </mesh>
      {hasGroupSelection && isSelected && (
        <mesh position={[0, 0, ringLocalZ]}>
          <ringGeometry args={[ringInner, ringOuter, 48]} />
          <meshBasicMaterial
            color={isPrimary ? '#f59e0b' : '#38bdf8'}
            transparent
            opacity={isPrimary ? 0.92 : 0.78}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
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
  const selectDie = useDiceStore((s) => s.selectDie);
  const selectDiceGroup = useDiceStore((s) => s.selectDiceGroup);
  const setResinPreset = useDiceStore((s) => s.setResinPreset);
  const triggerCameraFit = useDiceStore((s) => s.triggerCameraFit);
  const toggleFocusMode = useDiceStore((s) => s.toggleFocusMode);
  const openDieContextMenu = useDiceStore((s) => s.openDieContextMenu);
  const openFaceContextMenu = useDiceStore((s) => s.openFaceContextMenu);
  const openAllFacesContextMenu = useDiceStore((s) => s.openAllFacesContextMenu);

  const controlsRef = useRef<ComponentRef<typeof OrbitControls> | null>(null);
  const rightPointerDownRef = useRef<{ x: number; y: number } | null>(null);

  const isStationaryRightClick = (clientX: number, clientY: number): boolean => {
    const down = rightPointerDownRef.current;
    if (!down) return true;
    return Math.hypot(clientX - down.x, clientY - down.y) <= 5;
  };
  const resin = RESIN_BY_ID[resinPreset];
  const dieOrder = useMemo(() => getProjectDieOrder(project), [project]);
  const selectedDice = useMemo(
    () => normalizeSelectedDice(project.selectedDice, project.activeDie, dieOrder),
    [project.selectedDice, project.activeDie, dieOrder],
  );
  const isGroupMode = selectedDice.length > 1;
  const selectedTrayResults = useMemo(
    () =>
      selectedDice
        .map((id) => trayResults[id])
        .filter((r): r is GeneratedDieResult => Boolean(r)),
    [selectedDice, trayResults],
  );

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
        {isGroupMode ? (
          <div className="face-strip group-tray-strip" role="group" aria-label="Selected Dice Group">
            <span className="face-strip-label">Group ({selectedDice.length}):</span>
            {selectedDice.map((id) => {
              const d = project.dice[id];
              const chipText = d ? getDieInstanceShortTag(d, project) : id.toUpperCase();
              return (
                <button
                  key={id}
                  type="button"
                  className={`face-chip ${id === project.activeDie ? 'primary-chip' : ''}`}
                  aria-pressed="true"
                  title="Click to focus single die · Right-click for options · Ctrl/Cmd+Click to toggle"
                  onClick={(e) =>
                    selectDie(id, {
                      toggle: e.ctrlKey || e.metaKey,
                      range: e.shiftKey,
                    })
                  }
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openDieContextMenu(id, e.clientX, e.clientY, false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                      e.preventDefault();
                      const r = e.currentTarget.getBoundingClientRect();
                      openDieContextMenu(id, Math.round(r.left), Math.round(r.bottom), true);
                    }
                  }}
                >
                  {chipText}
                </button>
              );
            })}
            <button
              type="button"
              className="face-chip"
              onClick={() => selectDiceGroup('single')}
              title="Exit group selection (Esc)"
            >
              Single
            </button>
          </div>
        ) : project.viewportMode !== 'tray' && numberedFaces.length > 0 ? (
          <div className="face-strip" role="group" aria-label="Select Die Face for Overrides">
            <span className="face-strip-label">Faces:</span>
            <button
              type="button"
              className="face-chip"
              aria-pressed={project.selectedFaceId === null}
              title="Click to select all faces · Right-click for all-faces options"
              onClick={() => setSelectedFaceId(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (activeResult) {
                  openAllFacesContextMenu(
                    activeResult.dieId,
                    numberedFaces.map((f) => f.id),
                    e.clientX,
                    e.clientY,
                    false,
                  );
                }
              }}
              onKeyDown={(e) => {
                if (
                  (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) &&
                  activeResult
                ) {
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  openAllFacesContextMenu(
                    activeResult.dieId,
                    numberedFaces.map((f) => f.id),
                    Math.round(r.left),
                    Math.round(r.bottom),
                    true,
                  );
                }
              }}
            >
              All
            </button>
            {numberedFaces.map((f) => (
              <button
                key={f.id}
                type="button"
                className="face-chip"
                aria-pressed={project.selectedFaceId === f.id}
                title="Click to select face · Right-click for face options"
                onClick={() => setSelectedFaceId(f.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (activeResult) {
                    openFaceContextMenu(
                      activeResult.dieId,
                      f.id,
                      f.label,
                      e.clientX,
                      e.clientY,
                      false,
                    );
                  }
                }}
                onKeyDown={(e) => {
                  if (
                    (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) &&
                    activeResult
                  ) {
                    e.preventDefault();
                    const r = e.currentTarget.getBoundingClientRect();
                    openFaceContextMenu(
                      activeResult.dieId,
                      f.id,
                      f.label,
                      Math.round(r.left),
                      Math.round(r.bottom),
                      true,
                    );
                  }
                }}
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

      <div
        className="viewport-canvas-wrap"
        onPointerDownCapture={(e) => {
          if (e.button === 2) {
            rightPointerDownRef.current = { x: e.clientX, y: e.clientY };
          } else {
            rightPointerDownRef.current = null;
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
        }}
      >
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
            trayCount={dieOrder.length}
            controlsRef={controlsRef}
          />

          {project.viewportMode === 'tray' ? (
            <TrayScene
              results={trayResults}
              dieOrder={dieOrder}
              activeDie={project.activeDie}
              selectedDice={selectedDice}
              resin={resin}
              resolvedTheme={resolvedTheme}
              onSelectDie={(id, opts) => selectDie(id, opts)}
              onContextMenuDie={(id, cx, cy) => {
                if (isStationaryRightClick(cx, cy)) {
                  openDieContextMenu(id, cx, cy, false);
                }
              }}
            />
          ) : activeResult ? (
            <DieSceneObject
              result={activeResult}
              mode={sceneMode}
              resin={resin}
              onPickFace={(faceId) => setSelectedFaceId(faceId)}
              onContextMenuFace={(face, cx, cy) => {
                if (isStationaryRightClick(cx, cy)) {
                  openFaceContextMenu(activeResult.dieId, face.id, face.label, cx, cy, false);
                }
              }}
            />
          ) : null}

          <Grid
            position={[0, floorY, 0]}
            args={[240, 240]}
            cellSize={5}
            cellThickness={0.5}
            cellColor={gridCellColor}
            sectionSize={20}
            sectionThickness={1}
            sectionColor={gridSectionColor}
            fadeDistance={220}
          />
          <ContactShadows
            position={[0, floorY + 0.02, 0]}
            opacity={resolvedTheme === 'light' ? 0.32 : 0.45}
            scale={160}
            blur={1.8}
            far={40}
          />

          <OrbitControls
            ref={controlsRef}
            makeDefault
            enableDamping
            dampingFactor={0.08}
            minDistance={12}
            maxDistance={320}
          />
        </Canvas>
      </div>

      {isGroupMode ? (
        (() => {
          const masterSizes = selectedDice.map((k) => project.dice[k].sizeMm);
          const minMaster = Math.min(...masterSizes);
          const maxMaster = Math.max(...masterSizes);
          const blankSizes = selectedTrayResults.map((r) => r.calipers.blankFaceToFaceMm);
          const minBlank = blankSizes.length ? Math.min(...blankSizes) : null;
          const maxBlank = blankSizes.length ? Math.max(...blankSizes) : null;
          const totalTris = selectedTrayResults.reduce(
            (sum, r) => sum + r.masterMesh.triangleCount,
            0,
          );
          const breachedList = selectedTrayResults.filter((r) => r.breach.hasBreach);
          return (
            <section className="caliper-hud" aria-label="Group Caliper and Mesh Integrity Readout">
              <div className="caliper-grid">
                <div>
                  <span className="hud-metric-label">
                    Group Masters ({selectedDice.length} dice)
                  </span>
                  <span className="hud-metric-value">
                    {Math.abs(maxMaster - minMaster) < 0.01
                      ? `${minMaster.toFixed(2)} mm`
                      : `${minMaster.toFixed(1)}–${maxMaster.toFixed(1)} mm`}
                  </span>
                </div>
                <div>
                  <span className="hud-metric-label">Group Blanks</span>
                  <span className="hud-metric-value" style={{ color: 'var(--brand-cyan)' }}>
                    {minBlank !== null && maxBlank !== null
                      ? Math.abs(maxBlank - minBlank) < 0.01
                        ? `${minBlank.toFixed(2)} mm`
                        : `${minBlank.toFixed(1)}–${maxBlank.toFixed(1)} mm`
                      : 'Building…'}
                  </span>
                </div>
                <div>
                  <span className="hud-metric-label">Group Triangles</span>
                  <span className="hud-metric-value">
                    {totalTris > 0 ? totalTris.toLocaleString() : '—'}
                  </span>
                </div>
              </div>

              <div className="hud-status-row">
                {generationError ? (
                  <span className="status-badge warn">
                    <AlertTriangle size={14} aria-hidden="true" />
                    {generationError}
                  </span>
                ) : breachedList.length > 0 ? (
                  <span className="status-badge warn">
                    <AlertTriangle size={14} aria-hidden="true" />
                    Blank breaches numbers on:{' '}
                    {breachedList
                      .map((r) => {
                        const dieObj = project.dice[r.dieId];
                        return dieObj ? getDieInstanceShortTag(dieObj, project) : r.kind.toUpperCase();
                      })
                      .join(', ')}
                  </span>
                ) : (
                  <span className="status-badge ok">
                    <CheckCircle2 size={14} aria-hidden="true" />
                    {selectedTrayResults.length === selectedDice.length
                      ? `All ${selectedDice.length} selected shells OK · Ctrl/Shift+Click dice in tray`
                      : `Building ${selectedDice.length} selected dice…`}
                  </span>
                )}
              </div>
            </section>
          );
        })()
      ) : (
        activeResult && (
          <section className="caliper-hud" aria-label="Caliper and Mesh Integrity Readout">
            <div className="caliper-grid">
              <div>
                <span className="hud-metric-label">
                  {project.dice[activeResult.dieId]
                    ? `${getDieInstanceLabel(project.dice[activeResult.dieId], project)} Master`
                    : `${activeResult.kind.toUpperCase()} Master`}
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
        )
      )}
    </main>
  );
}
