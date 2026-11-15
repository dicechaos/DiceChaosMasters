import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { hasDieCustomOverrides } from '../engine/generator';
import {
  getDieInstanceLabel,
  getProjectDieOrder,
  normalizeSelectedDice,
} from '../engine/presets';
import {
  normalizeRotationDeg,
  useDiceStore,
  type StudioContextMenuTarget,
} from '../store/useDiceStore';
import type { DieSettings } from '../types/dice';

type PopoverEl = HTMLDivElement & {
  showPopover?: (opts?: { source?: HTMLElement }) => void;
  hidePopover?: () => void;
};

type SubmenuId = 'emblem' | 'face-svg';

function showPopoverWithSource(pop: PopoverEl | null, source: HTMLElement | null): void {
  if (!pop || typeof pop.showPopover !== 'function') return;
  try {
    if (source) {
      pop.showPopover({ source });
    } else {
      pop.showPopover();
    }
  } catch {
    try {
      pop.showPopover();
    } catch {
      // Ignore invalid popover state transitions
    }
  }
}

function hidePopoverSafe(pop: PopoverEl | null): void {
  if (!pop || typeof pop.hidePopover !== 'function') return;
  try {
    if (pop.matches(':popover-open')) {
      pop.hidePopover();
    }
  } catch {
    // Ignore when already closed or polyfill-managed
  }
}

function positionFixedAtPoint(pop: HTMLElement, clientX: number, clientY: number): void {
  const pad = 8;
  const rect = pop.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = clientX;
  let top = clientY;

  if (left + rect.width > vw - pad) {
    left = Math.max(pad, clientX - rect.width);
  }
  if (top + rect.height > vh - pad) {
    top = Math.max(pad, clientY - rect.height);
  }
  left = Math.max(pad, Math.min(left, Math.max(pad, vw - rect.width - pad)));
  top = Math.max(pad, Math.min(top, Math.max(pad, vh - rect.height - pad)));

  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
}

function positionSubmenuBesideTrigger(subPop: HTMLElement, trigger: HTMLElement): void {
  const pad = 8;
  const trigRect = trigger.getBoundingClientRect();
  const subRect = subPop.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = trigRect.right + 4;
  if (left + subRect.width > vw - pad) {
    left = Math.max(pad, trigRect.left - subRect.width - 4);
  }
  let top = trigRect.top - 4;
  if (top + subRect.height > vh - pad) {
    top = Math.max(pad, vh - subRect.height - pad);
  }
  top = Math.max(pad, top);

  subPop.style.left = `${Math.round(left)}px`;
  subPop.style.top = `${Math.round(top)}px`;
}

function getOwnMenuButtons(groupEl: HTMLElement): HTMLButtonElement[] {
  return Array.from(groupEl.querySelectorAll<HTMLButtonElement>('button')).filter(
    (btn) =>
      btn.closest('[focusgroup]') === groupEl &&
      !btn.disabled &&
      btn.getAttribute('aria-disabled') !== 'true',
  );
}

function startSafeTriangleBridge(submenu: HTMLElement, clientX: number, clientY: number): void {
  if (typeof window === 'undefined' || !window.matchMedia?.('(hover: hover)').matches) return;
  const rect = submenu.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const left = clientX < rect.left;
  if (!left && clientX <= rect.right) return;

  submenu.style.setProperty('--pointer-x', `${clientX - rect.left}px`);
  submenu.style.setProperty('--pointer-y', `${clientY - rect.top}px`);
  submenu.dataset.bridge = '';

  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastX = clientX;

  const stop = () => {
    if (timer !== undefined) clearTimeout(timer);
    submenu.removeEventListener('pointermove', extend);
    submenu.removeEventListener('toggle', stop);
    submenu.removeAttribute('data-bridge');
  };

  const extend = (ev: PointerEvent) => {
    if (ev.target !== submenu || (left ? ev.clientX < lastX : ev.clientX > lastX)) {
      stop();
      return;
    }
    lastX = ev.clientX;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(stop, 300);
  };

  timer = setTimeout(stop, 300);
  submenu.addEventListener('pointermove', extend);
  submenu.addEventListener('toggle', stop, { once: true });
}

export function StudioContextMenu() {
  const project = useDiceStore((s) => s.project);
  const contextMenu = useDiceStore((s) => s.contextMenu);
  const selectDie = useDiceStore((s) => s.selectDie);
  const setViewportMode = useDiceStore((s) => s.setViewportMode);
  const updateDiceSettings = useDiceStore((s) => s.updateDiceSettings);
  const duplicateDieInstance = useDiceStore((s) => s.duplicateDieInstance);
  const resetDiceOverrides = useDiceStore((s) => s.resetDiceOverrides);
  const requestRemoveDice = useDiceStore((s) => s.requestRemoveDice);
  const updateFaceOverride = useDiceStore((s) => s.updateFaceOverride);
  const batchUpdateAllFaces = useDiceStore((s) => s.batchUpdateAllFaces);
  const openExportModalWithScope = useDiceStore((s) => s.openExportModalWithScope);
  const requestInspectorFocus = useDiceStore((s) => s.requestInspectorFocus);
  const closeContextMenu = useDiceStore((s) => s.closeContextMenu);

  const [fallbackRootOpen, setFallbackRootOpen] = useState(false);
  const [openSubmenu, setOpenSubmenu] = useState<SubmenuId | null>(null);

  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const rootPopoverRef = useRef<PopoverEl | null>(null);
  const rootMenuRef = useRef<HTMLDivElement | null>(null);
  const emblemTriggerRef = useRef<HTMLButtonElement | null>(null);
  const emblemSubmenuRef = useRef<PopoverEl | null>(null);
  const emblemMenuRef = useRef<HTMLDivElement | null>(null);
  const faceSvgTriggerRef = useRef<HTMLButtonElement | null>(null);
  const faceSvgSubmenuRef = useRef<PopoverEl | null>(null);
  const faceSvgMenuRef = useRef<HTMLDivElement | null>(null);

  const invokerRef = useRef<HTMLElement | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const supportsNativePopover =
    typeof HTMLElement !== 'undefined' && Object.hasOwn(HTMLElement.prototype, 'popover');
  const supportsCommandInvoker =
    typeof HTMLButtonElement !== 'undefined' &&
    'commandForElement' in HTMLButtonElement.prototype;
  const supportsAnchorArea =
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('position-area: block-end');
  const supportsImplicitSource =
    typeof ToggleEvent !== 'undefined' && 'source' in ToggleEvent.prototype;
  const hasNativeFocusgroup =
    typeof HTMLElement !== 'undefined' && 'focusGroup' in HTMLElement.prototype;

  const clearPreviewTimer = useCallback(() => {
    if (previewTimerRef.current !== null) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
  }, []);

  const hideSubmenu = useCallback(
    (which?: SubmenuId) => {
      clearPreviewTimer();
      if (!which || which === 'emblem') {
        hidePopoverSafe(emblemSubmenuRef.current);
      }
      if (!which || which === 'face-svg') {
        hidePopoverSafe(faceSvgSubmenuRef.current);
      }
      setOpenSubmenu((cur) => (!which || cur === which ? null : cur));
    },
    [clearPreviewTimer],
  );

  const openSubmenuFor = useCallback(
    (which: SubmenuId, focusFirstItem: boolean) => {
      clearPreviewTimer();
      const trigger = which === 'emblem' ? emblemTriggerRef.current : faceSvgTriggerRef.current;
      const subPop = which === 'emblem' ? emblemSubmenuRef.current : faceSvgSubmenuRef.current;
      const subMenu = which === 'emblem' ? emblemMenuRef.current : faceSvgMenuRef.current;
      if (!trigger || !subPop) return;

      hidePopoverSafe(which === 'emblem' ? faceSvgSubmenuRef.current : emblemSubmenuRef.current);

      if (supportsAnchorArea && !supportsImplicitSource) {
        const anchorToken = `--dcm-ctx-sub-${which}`;
        trigger.style.setProperty('anchor-name', anchorToken);
        subPop.style.setProperty('position-anchor', anchorToken);
      }

      if (supportsNativePopover) {
        showPopoverWithSource(subPop, trigger);
      }
      setOpenSubmenu(which);

      if (!supportsAnchorArea) {
        requestAnimationFrame(() => {
          positionSubmenuBesideTrigger(subPop, trigger);
        });
      }

      if (focusFirstItem && subMenu) {
        requestAnimationFrame(() => {
          getOwnMenuButtons(subMenu)[0]?.focus({ preventScroll: true });
        });
      }
    },
    [clearPreviewTimer, supportsAnchorArea, supportsImplicitSource, supportsNativePopover],
  );

  const closeMenu = useCallback(
    (fromPointer: boolean, skipRestore = false) => {
      hideSubmenu();
      setFallbackRootOpen(false);
      hidePopoverSafe(rootPopoverRef.current);
      closeContextMenu();

      if (!skipRestore && invokerRef.current && invokerRef.current.isConnected) {
        try {
          if (fromPointer) {
            (
              invokerRef.current as HTMLElement & { focus: (opts?: Record<string, unknown>) => void }
            ).focus({ preventScroll: true, focusVisible: false });
          } else {
            invokerRef.current.focus({ preventScroll: true });
          }
        } catch {
          invokerRef.current.focus();
        }
      }
    },
    [closeContextMenu, hideSubmenu],
  );

  useLayoutEffect(() => {
    if (!contextMenu) {
      hideSubmenu();
      setFallbackRootOpen(false);
      hidePopoverSafe(rootPopoverRef.current);
      return;
    }

    const rootPop = rootPopoverRef.current;
    const anchor = anchorRef.current;
    if (!rootPop || !anchor) return;

    const activeEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (activeEl && !rootPop.contains(activeEl)) {
      invokerRef.current = activeEl;
    }

    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const safeX = Math.max(4, Math.min(contextMenu.clientX, vw - 4));
    const safeY = Math.max(4, Math.min(contextMenu.clientY, vh - 4));
    anchor.style.left = `${safeX}px`;
    anchor.style.top = `${safeY}px`;

    if (supportsAnchorArea && !supportsImplicitSource) {
      anchor.style.setProperty('anchor-name', '--dcm-ctx-point-anchor');
      rootPop.style.setProperty('position-anchor', '--dcm-ctx-point-anchor');
    }

    hideSubmenu();

    if (supportsNativePopover) {
      hidePopoverSafe(rootPop);
      showPopoverWithSource(rootPop, anchor);
    } else {
      setFallbackRootOpen(true);
    }

    if (!supportsAnchorArea) {
      requestAnimationFrame(() => {
        positionFixedAtPoint(rootPop, safeX, safeY);
      });
    }

    requestAnimationFrame(() => {
      const menuEl = rootMenuRef.current;
      if (!menuEl) return;
      if (contextMenu.openedViaKeyboard) {
        getOwnMenuButtons(menuEl)[0]?.focus({ preventScroll: true });
      } else {
        menuEl.focus({ preventScroll: true });
      }
    });
  }, [
    contextMenu,
    hideSubmenu,
    supportsAnchorArea,
    supportsImplicitSource,
    supportsNativePopover,
  ]);

  // Sync store when native popover light-dismiss closes the menu (outside click or Esc)
  useEffect(() => {
    const rootPop = rootPopoverRef.current;
    if (!rootPop) return;

    const onToggle = (ev: Event) => {
      const nextState = (ev as ToggleEvent).newState;
      if (nextState === 'closed' && !rootPop.matches(':popover-open')) {
        clearPreviewTimer();
        setOpenSubmenu(null);
        setFallbackRootOpen(false);
        if (useDiceStore.getState().contextMenu) {
          useDiceStore.getState().closeContextMenu();
        }
      }
    };

    rootPop.addEventListener('toggle', onToggle);
    return () => rootPop.removeEventListener('toggle', onToggle);
  }, [clearPreviewTimer]);

  // Sync submenu aria-expanded and cleanup when submenu toggles natively
  useEffect(() => {
    const subs: Array<{ id: SubmenuId; el: PopoverEl | null }> = [
      { id: 'emblem', el: emblemSubmenuRef.current },
      { id: 'face-svg', el: faceSvgSubmenuRef.current },
    ];
    const cleanups: Array<() => void> = [];
    for (const entry of subs) {
      const subEl = entry.el;
      if (!subEl) continue;
      const handler = (ev: Event) => {
        const nextState = (ev as ToggleEvent).newState;
        if (nextState === 'closed') {
          setOpenSubmenu((cur) => (cur === entry.id ? null : cur));
        } else if (nextState === 'open') {
          setOpenSubmenu(entry.id);
          if (!supportsAnchorArea) {
            const trig =
              entry.id === 'emblem' ? emblemTriggerRef.current : faceSvgTriggerRef.current;
            if (trig) positionSubmenuBesideTrigger(subEl, trig);
          }
        }
      };
      subEl.addEventListener('toggle', handler);
      cleanups.push(() => subEl.removeEventListener('toggle', handler));
    }
    return () => cleanups.forEach((fn) => fn());
  }, [contextMenu, supportsAnchorArea]);

  // Populate fallback roles on [focusgroup~="menu"] when native focusgroup is unsupported
  useEffect(() => {
    const rootPop = rootPopoverRef.current;
    if (!rootPop || hasNativeFocusgroup) return;

    const groups = rootPop.querySelectorAll<HTMLElement>('[focusgroup~="menu"]');
    groups.forEach((group) => {
      group.setAttribute('role', 'menu');
      group.querySelectorAll<HTMLButtonElement>('button:not([role])').forEach((item) => {
        item.setAttribute('role', 'menuitem');
      });
    });
  }, [contextMenu, hasNativeFocusgroup]);

  // Close menu on outside focus or outside pointerdown (in fallback mode)
  useEffect(() => {
    if (!contextMenu) return;

    const onFocusIn = (e: FocusEvent) => {
      const rootPop = rootPopoverRef.current;
      if (!rootPop) return;
      if (e.target instanceof Node && !rootPop.contains(e.target)) {
        closeMenu(true, true);
      }
    };

    const onPointerDownFallback = (e: PointerEvent) => {
      if (supportsNativePopover) return;
      const rootPop = rootPopoverRef.current;
      if (rootPop && e.target instanceof Node && !rootPop.contains(e.target)) {
        closeMenu(true, true);
      }
    };

    const onViewportChange = () => {
      closeMenu(true, true);
    };

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('pointerdown', onPointerDownFallback);
    window.addEventListener('resize', onViewportChange);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('pointerdown', onPointerDownFallback);
      window.removeEventListener('resize', onViewportChange);
    };
  }, [contextMenu, closeMenu, supportsNativePopover]);

  const dieOrder = getProjectDieOrder(project);
  const selectedDice = useMemo(
    () => normalizeSelectedDice(project.selectedDice, project.activeDie, dieOrder),
    [project.selectedDice, project.activeDie, dieOrder],
  );

  const handleMenuKeyDown = (
    e: ReactKeyboardEvent<HTMLDivElement>,
    level: 'root' | SubmenuId,
  ) => {
    const groupEl = e.currentTarget;
    const items = getOwnMenuButtons(groupEl);

    if (e.key === 'Tab') {
      closeMenu(false);
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (level !== 'root') {
        hideSubmenu(level);
        const trig = level === 'emblem' ? emblemTriggerRef.current : faceSvgTriggerRef.current;
        trig?.focus({ preventScroll: true });
      } else {
        closeMenu(false);
      }
      return;
    }

    if (e.key === 'ArrowLeft' && level !== 'root') {
      e.preventDefault();
      e.stopPropagation();
      hideSubmenu(level);
      const trig = level === 'emblem' ? emblemTriggerRef.current : faceSvgTriggerRef.current;
      trig?.focus({ preventScroll: true });
      return;
    }

    if (e.key === 'ArrowRight' && level === 'root') {
      const active = document.activeElement;
      if (active === emblemTriggerRef.current) {
        e.preventDefault();
        e.stopPropagation();
        openSubmenuFor('emblem', true);
        return;
      }
      if (active === faceSvgTriggerRef.current) {
        e.preventDefault();
        e.stopPropagation();
        openSubmenuFor('face-svg', true);
        return;
      }
    }

    if (e.key === 'Home' && items.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      items[0].focus({ preventScroll: true });
      return;
    }

    if (e.key === 'End' && items.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      items[items.length - 1].focus({ preventScroll: true });
      return;
    }

    if (
      (e.key === 'ArrowDown' || e.key === 'ArrowUp') &&
      items.length > 0 &&
      (!hasNativeFocusgroup || !(document.activeElement instanceof HTMLButtonElement))
    ) {
      e.preventDefault();
      e.stopPropagation();
      const idx = items.indexOf(document.activeElement as HTMLButtonElement);
      const next =
        idx < 0
          ? e.key === 'ArrowUp'
            ? items.length - 1
            : 0
          : (idx + (e.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
      items[next].focus({ preventScroll: true });
    }
  };

  const handleItemPointerMove = (
    e: ReactPointerEvent<HTMLButtonElement>,
    submenuForThisItem?: SubmenuId,
  ) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    if (hit && !btn.contains(hit)) return;

    if (document.activeElement !== btn) {
      try {
        (btn as HTMLElement & { focus: (opts?: Record<string, unknown>) => void }).focus({
          preventScroll: true,
          focusVisible: false,
        });
      } catch {
        btn.focus({ preventScroll: true });
      }
    }

    if (submenuForThisItem) {
      if (openSubmenu !== submenuForThisItem) {
        clearPreviewTimer();
        previewTimerRef.current = setTimeout(() => {
          openSubmenuFor(submenuForThisItem, false);
        }, 80);
      }
    } else if (openSubmenu) {
      hideSubmenu();
    }
  };

  const renderHighFaceEmblemSubmenu = (
    targetIds: string[],
    firstMode: boolean | null,
    mixedEmblemMode: boolean,
  ) => (
    <>
      <button
        ref={emblemTriggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={openSubmenu === 'emblem'}
        onPointerMove={(e) => handleItemPointerMove(e, 'emblem')}
        onPointerLeave={(e) => {
          clearPreviewTimer();
          if (emblemSubmenuRef.current) {
            startSafeTriangleBridge(emblemSubmenuRef.current, e.clientX, e.clientY);
          }
        }}
        onClick={() => {
          if (supportsCommandInvoker) return;
          if (openSubmenu === 'emblem') {
            hideSubmenu('emblem');
          } else {
            openSubmenuFor('emblem', false);
          }
        }}
        {...({
          commandfor: 'dcm-ctx-emblem-submenu',
          command: 'toggle-popover',
        } as Record<string, string>)}
      >
        <span>High-Face Emblem</span>
        <span className="hint" aria-hidden="true">
          ›
        </span>
      </button>

      <div
        ref={emblemSubmenuRef}
        id="dcm-ctx-emblem-submenu"
        className={`studio-context-popover studio-submenu-popover ${
          !supportsNativePopover && openSubmenu === 'emblem' ? 'fallback-open' : ''
        }`}
        {...(supportsNativePopover ? ({ popover: 'auto' } as Record<string, string>) : {})}
      >
        <div
          ref={emblemMenuRef}
          className="studio-menu-list"
          aria-label="High-face emblem mode"
          onKeyDown={(e) => handleMenuKeyDown(e, 'emblem')}
          {...({ focusgroup: 'menu nomemory' } as Record<string, string>)}
        >
          <div role="group" aria-label="Emblem override mode">
            <button
              type="button"
              role="menuitemradio"
              aria-checked={!mixedEmblemMode && firstMode === true}
              onPointerMove={(e) => handleItemPointerMove(e)}
              onClick={(e) => {
                updateDiceSettings(
                  targetIds,
                  { useHighFaceEmblemOverride: true },
                  'emblemOverride',
                );
                closeMenu(e.detail > 0);
              }}
            >
              <span>Enable SVG Logo on High Face</span>
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={!mixedEmblemMode && firstMode === false}
              onPointerMove={(e) => handleItemPointerMove(e)}
              onClick={(e) => {
                updateDiceSettings(
                  targetIds,
                  { useHighFaceEmblemOverride: false },
                  'emblemOverride',
                );
                closeMenu(e.detail > 0);
              }}
            >
              <span>Numbers Only on High Face</span>
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={!mixedEmblemMode && firstMode === null}
              onPointerMove={(e) => handleItemPointerMove(e)}
              onClick={(e) => {
                updateDiceSettings(
                  targetIds,
                  { useHighFaceEmblemOverride: null, highFaceSvgIdOverride: null },
                  'emblemOverride',
                );
                closeMenu(e.detail > 0);
              }}
            >
              <span>
                Inherit Global ({project.typography.useHighFaceEmblem ? 'Logo On' : 'Off'})
              </span>
            </button>
          </div>
        </div>
      </div>
    </>
  );

  const renderDieMenu = (menu: Extract<StudioContextMenuTarget, { kind: 'die' }>) => {
    const die = project.dice[menu.dieId];
    if (!die) return null;

    const isGroupTarget = selectedDice.length > 1 && selectedDice.includes(die.id);
    const targetIds = isGroupTarget ? selectedDice : [die.id];
    const targetObjs = targetIds
      .map((id) => project.dice[id])
      .filter((d): d is DieSettings => Boolean(d));
    const dieLabel = getDieInstanceLabel(die, project);

    const allEnabled = targetObjs.every((d) => d.enabled);
    const anyCustom = targetObjs.some((d) => hasDieCustomOverrides(d));
    const canRemove = dieOrder.length > 1;

    const emblemModes = targetObjs.map((d) => d.useHighFaceEmblemOverride);
    const firstMode = emblemModes[0];
    const mixedEmblemMode = emblemModes.some((m) => m !== firstMode);

    return (
      <>
        <div className="studio-menu-header" aria-hidden="true">
          <span className="studio-menu-title">
            {isGroupTarget ? `Group (${targetIds.length} Dice)` : dieLabel}
          </span>
          <span className="studio-menu-badge">
            {isGroupTarget ? `Anchor: ${dieLabel}` : `${die.sizeMm.toFixed(1)} mm`}
          </span>
        </div>

        <div
          ref={rootMenuRef}
          tabIndex={-1}
          className="studio-menu-list"
          aria-label={isGroupTarget ? 'Selected dice group actions' : `${dieLabel} actions`}
          onKeyDown={(e) => handleMenuKeyDown(e, 'root')}
          {...({ focusgroup: 'menu nomemory' } as Record<string, string>)}
        >
          {isGroupTarget ? (
            <button
              type="button"
              onPointerMove={(e) => handleItemPointerMove(e)}
              onClick={(e) => {
                selectDie(die.id, { forceSingle: true });
                setViewportMode('single');
                closeMenu(e.detail > 0);
              }}
            >
              <span>Focus Only {dieLabel} in Single View</span>
            </button>
          ) : project.viewportMode === 'tray' ? (
            <button
              type="button"
              onPointerMove={(e) => handleItemPointerMove(e)}
              onClick={(e) => {
                selectDie(die.id, { forceSingle: true });
                setViewportMode('single');
                closeMenu(e.detail > 0);
              }}
            >
              <span>Inspect in Single Die View</span>
              <span className="hint" aria-hidden="true">
                1
              </span>
            </button>
          ) : (
            <button
              type="button"
              onPointerMove={(e) => handleItemPointerMove(e)}
              onClick={(e) => {
                setViewportMode('tray');
                closeMenu(e.detail > 0);
              }}
            >
              <span>Show Full Set Tray</span>
              <span className="hint" aria-hidden="true">
                2
              </span>
            </button>
          )}

          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={allEnabled}
            onPointerMove={(e) => handleItemPointerMove(e)}
            onKeyDown={(e) => {
              if (e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                updateDiceSettings(targetIds, { enabled: !allEnabled });
              }
            }}
            onClick={(e) => {
              updateDiceSettings(targetIds, { enabled: !allEnabled });
              closeMenu(e.detail > 0);
            }}
          >
            <span>{isGroupTarget ? 'Include Selected in Export' : 'Include in Export'}</span>
          </button>

          <hr />

          {!isGroupTarget && (
            <button
              type="button"
              onPointerMove={(e) => handleItemPointerMove(e)}
              onClick={() => {
                selectDie(die.id, { forceSingle: true });
                closeMenu(true, true);
                requestInspectorFocus('die-label');
              }}
            >
              <span>Rename / Edit Label…</span>
            </button>
          )}

          {renderHighFaceEmblemSubmenu(targetIds, firstMode, mixedEmblemMode)}

          <button
            type="button"
            onPointerMove={(e) => handleItemPointerMove(e)}
            onClick={(e) => {
              duplicateDieInstance(die.id);
              closeMenu(e.detail > 0);
            }}
          >
            <span>Duplicate {dieLabel}</span>
            <span className="hint" aria-hidden="true">
              Ctrl+D
            </span>
          </button>

          <button
            type="button"
            onPointerMove={(e) => handleItemPointerMove(e)}
            onClick={(e) => {
              duplicateDieInstance(die.id, { asLogoNumbersPair: true });
              closeMenu(e.detail > 0);
            }}
          >
            <span>Create Logo + Numbers Pair</span>
          </button>

          <hr />

          <button
            type="button"
            onPointerMove={(e) => handleItemPointerMove(e)}
            onClick={() => {
              closeMenu(true, true);
              openExportModalWithScope('selected');
            }}
          >
            <span>
              {isGroupTarget
                ? `Export Selected (${targetIds.length})…`
                : `Export ${dieLabel} (STL / 3MF)…`}
            </span>
          </button>

          <button
            type="button"
            disabled={!anyCustom}
            onPointerMove={(e) => handleItemPointerMove(e)}
            onClick={(e) => {
              resetDiceOverrides(targetIds, 'all');
              closeMenu(e.detail > 0);
            }}
          >
            <span>
              {isGroupTarget ? 'Reset Custom Overrides on Selected' : 'Reset Custom Overrides'}
            </span>
          </button>

          <hr />

          <button
            type="button"
            className="danger-item"
            disabled={!canRemove}
            onPointerMove={(e) => handleItemPointerMove(e)}
            onClick={() => {
              closeMenu(true, true);
              requestRemoveDice(targetIds);
            }}
          >
            <span>
              {isGroupTarget ? `Remove Selected (${targetIds.length})…` : `Remove ${dieLabel}…`}
            </span>
            <span className="hint" aria-hidden="true">
              Del
            </span>
          </button>
        </div>
      </>
    );
  };

  const renderFaceMenu = (menu: Extract<StudioContextMenuTarget, { kind: 'face' }>) => {
    const die = project.dice[menu.dieId];
    if (!die) return null;

    const dieLabel = getDieInstanceLabel(die, project);
    const ov = die.faceOverrides[menu.faceId];
    const currentRot = ov?.rotationDeg ?? 0;
    const currentScale = ov?.scaleMultiplier ?? 1;
    const hasOffset =
      Boolean(ov) && (Math.abs(ov.offsetXMm) > 0.005 || Math.abs(ov.offsetYMm) > 0.005);

    const rotPlus90 = normalizeRotationDeg(currentRot + 90);
    const rotMinus90 = normalizeRotationDeg(currentRot - 90);
    const rotFlip = normalizeRotationDeg(currentRot + 180);
    const scaleUp = Math.min(1.8, Math.round((currentScale + 0.1) * 100) / 100);
    const scaleDown = Math.max(0.4, Math.round((currentScale - 0.1) * 100) / 100);

    return (
      <>
        <div className="studio-menu-header" aria-hidden="true">
          <span className="studio-menu-title">
            {dieLabel} · Face &ldquo;{menu.faceLabel}&rdquo;
          </span>
          <span className="studio-menu-badge">
            {ov ? 'Edited' : `${currentRot}° · ${currentScale.toFixed(2)}×`}
          </span>
        </div>

        <div
          ref={rootMenuRef}
          tabIndex={-1}
          className="studio-menu-list"
          aria-label={`Face ${menu.faceLabel} actions`}
          onKeyDown={(e) => handleMenuKeyDown(e, 'root')}
          {...({ focusgroup: 'menu nomemory' } as Record<string, string>)}
        >
          <button
            type="button"
            onPointerMove={(e) => handleItemPointerMove(e)}
            onClick={() => {
              closeMenu(true, true);
              requestInspectorFocus('face-custom-text');
            }}
          >
            <span>Edit Custom Face Text…</span>
          </button>

          <button
            type="button"
            onPointerMove={(e) => handleItemPointerMove(e)}
            onClick={() => {
              closeMenu(true, true);
              requestInspectorFocus('face-svg-upload');
            }}
          >
            <span>Upload Custom .SVG for Face {menu.faceLabel}…</span>
          </button>

          <button
            ref={faceSvgTriggerRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={openSubmenu === 'face-svg'}
            onPointerMove={(e) => handleItemPointerMove(e, 'face-svg')}
            onPointerLeave={(e) => {
              clearPreviewTimer();
              if (faceSvgSubmenuRef.current) {
                startSafeTriangleBridge(faceSvgSubmenuRef.current, e.clientX, e.clientY);
              }
            }}
            onClick={() => {
              if (supportsCommandInvoker) return;
              if (openSubmenu === 'face-svg') {
                hideSubmenu('face-svg');
              } else {
                openSubmenuFor('face-svg', false);
              }
            }}
            {...({
              commandfor: 'dcm-ctx-face-svg-submenu',
              command: 'toggle-popover',
            } as Record<string, string>)}
          >
            <span>Assign Project SVG Emblem</span>
            <span className="hint" aria-hidden="true">
              ›
            </span>
          </button>

          <div
            ref={faceSvgSubmenuRef}
            id="dcm-ctx-face-svg-submenu"
            className={`studio-context-popover studio-submenu-popover ${
              !supportsNativePopover && openSubmenu === 'face-svg' ? 'fallback-open' : ''
            }`}
            {...(supportsNativePopover ? ({ popover: 'auto' } as Record<string, string>) : {})}
          >
            <div
              ref={faceSvgMenuRef}
              className="studio-menu-list"
              aria-label="Face SVG emblem library"
              onKeyDown={(e) => handleMenuKeyDown(e, 'face-svg')}
              {...({ focusgroup: 'menu nomemory' } as Record<string, string>)}
            >
              <div role="group" aria-label="SVG emblem choices">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={!ov?.svgId}
                  onPointerMove={(e) => handleItemPointerMove(e)}
                  onClick={(e) => {
                    updateFaceOverride(die.id, menu.faceId, { svgId: null });
                    closeMenu(e.detail > 0);
                  }}
                >
                  <span>Use Numeral / Global Default</span>
                </button>
                {project.svgAssets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={ov?.svgId === asset.id}
                    onPointerMove={(e) => handleItemPointerMove(e)}
                    onClick={(e) => {
                      updateFaceOverride(die.id, menu.faceId, { svgId: asset.id });
                      closeMenu(e.detail > 0);
                    }}
                  >
                    <span>{asset.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <hr />

          <button
            type="button"
            onPointerMove={(e) => handleItemPointerMove(e)}
            onClick={(e) => {
              updateFaceOverride(die.id, menu.faceId, { rotationDeg: rotPlus90 });
              closeMenu(e.detail > 0);
            }}
          >
            <span>Rotate +90°</span>
            <span className="hint" aria-hidden="true">
              {rotPlus90}°
            </span>
          </button>

          <button
            type="button"
            onPointerMove={(e) => handleItemPointerMove(e)}
            onClick={(e) => {
              updateFaceOverride(die.id, menu.faceId, { rotationDeg: rotMinus90 });
              closeMenu(e.detail > 0);
            }}
          >
            <span>Rotate −90°</span>
            <span className="hint" aria-hidden="true">
              {rotMinus90}°
            </span>
          </button>

          <button
            type="button"
            onPointerMove={(e) => handleItemPointerMove(e)}
            onClick={(e) => {
              updateFaceOverride(die.id, menu.faceId, { rotationDeg: rotFlip });
              closeMenu(e.detail > 0);
            }}
          >
            <span>Flip 180°</span>
            <span className="hint" aria-hidden="true">
              {rotFlip}°
            </span>
          </button>

          <button
            type="button"
            disabled={currentRot === 0}
            onPointerMove={(e) => handleItemPointerMove(e)}
            onClick={(e) => {
              updateFaceOverride(die.id, menu.faceId, { rotationDeg: 0 });
              closeMenu(e.detail > 0);
            }}
          >
            <span>Reset Rotation (0°)</span>
          </button>

          <hr />

          <button
            type="button"
            disabled={currentScale >= 1.8}
            onPointerMove={(e) => handleItemPointerMove(e)}
            onClick={(e) => {
              updateFaceOverride(die.id, menu.faceId, { scaleMultiplier: scaleUp });
              closeMenu(e.detail > 0);
            }}
          >
            <span>Scale Larger (+10%)</span>
            <span className="hint" aria-hidden="true">
              {scaleUp.toFixed(2)}×
            </span>
          </button>

          <button
            type="button"
            disabled={currentScale <= 0.4}
            onPointerMove={(e) => handleItemPointerMove(e)}
            onClick={(e) => {
              updateFaceOverride(die.id, menu.faceId, { scaleMultiplier: scaleDown });
              closeMenu(e.detail > 0);
            }}
          >
            <span>Scale Smaller (−10%)</span>
            <span className="hint" aria-hidden="true">
              {scaleDown.toFixed(2)}×
            </span>
          </button>

          <button
            type="button"
            disabled={Math.abs(currentScale - 1) < 0.005}
            onPointerMove={(e) => handleItemPointerMove(e)}
            onClick={(e) => {
              updateFaceOverride(die.id, menu.faceId, { scaleMultiplier: 1 });
              closeMenu(e.detail > 0);
            }}
          >
            <span>Reset Scale (1.00×)</span>
          </button>

          <button
            type="button"
            disabled={!hasOffset}
            onPointerMove={(e) => handleItemPointerMove(e)}
            onClick={(e) => {
              updateFaceOverride(die.id, menu.faceId, { offsetXMm: 0, offsetYMm: 0 });
              closeMenu(e.detail > 0);
            }}
          >
            <span>Center Offset (0, 0 mm)</span>
          </button>

          <hr />

          <button
            type="button"
            className="danger-item"
            disabled={!ov}
            onPointerMove={(e) => handleItemPointerMove(e)}
            onClick={(e) => {
              updateFaceOverride(die.id, menu.faceId, null);
              closeMenu(e.detail > 0);
            }}
          >
            <span>Reset Face {menu.faceLabel} Overrides</span>
          </button>
        </div>
      </>
    );
  };

  const renderAllFacesMenu = (menu: Extract<StudioContextMenuTarget, { kind: 'all-faces' }>) => {
    const die = project.dice[menu.dieId];
    if (!die) return null;

    const dieLabel = getDieInstanceLabel(die, project);
    const faceIds = menu.faceIds;
    const faceCount = faceIds.length;
    const editedFaceCount = Object.keys(die.faceOverrides).length;
    const overrideEntries = Object.values(die.faceOverrides);
    const rots = faceIds.map((id) => normalizeRotationDeg(die.faceOverrides[id]?.rotationDeg ?? 0));
    const uniformRot = rots.length > 0 && rots.every((r) => r === rots[0]) ? rots[0] : null;
    const anyRotated = overrideEntries.some(
      (ov) => normalizeRotationDeg(ov.rotationDeg ?? 0) !== 0,
    );

    const dieScale = die.fontScaleMultiplier;
    const scaleUp = Math.min(1.5, Math.round((dieScale + 0.1) * 100) / 100);
    const scaleDown = Math.max(0.5, Math.round((dieScale - 0.1) * 100) / 100);
    const anyFaceScaled = overrideEntries.some((ov) => Math.abs((ov.scaleMultiplier ?? 1) - 1) > 0.005);
    const anyScaled = Math.abs(dieScale - 1) > 0.005 || anyFaceScaled;
    const anyOffset = overrideEntries.some(
      (ov) => Math.abs(ov.offsetXMm ?? 0) > 0.005 || Math.abs(ov.offsetYMm ?? 0) > 0.005,
    );
    const anyCustomContent = overrideEntries.some(
      (ov) => ov.customText !== undefined || ov.svgId !== undefined,
    );
    const canResetAll = editedFaceCount > 0 || Math.abs(dieScale - 1) > 0.005;
    const emblemMode = die.useHighFaceEmblemOverride;

    const rotationActions = [
      { label: 'Rotate All Faces +90°', deltaDeg: 90, fallbackHint: '+90°' },
      { label: 'Rotate All Faces −90°', deltaDeg: -90, fallbackHint: '−90°' },
      { label: 'Flip All Faces 180°', deltaDeg: 180, fallbackHint: '180°' },
    ];

    return (
      <>
        <div className="studio-menu-header" aria-hidden="true">
          <span className="studio-menu-title">
            {dieLabel} · All {faceCount} Faces
          </span>
          <span className="studio-menu-badge">
            {editedFaceCount > 0
              ? `${editedFaceCount} Edited`
              : `${uniformRot ?? 0}° · ${dieScale.toFixed(2)}×`}
          </span>
        </div>

        <div
          ref={rootMenuRef}
          tabIndex={-1}
          className="studio-menu-list"
          aria-label={`${dieLabel} all faces actions`}
          onKeyDown={(e) => handleMenuKeyDown(e, 'root')}
          {...({ focusgroup: 'menu nomemory' } as Record<string, string>)}
        >
          <button
            type="button"
            onPointerMove={(e) => handleItemPointerMove(e)}
            onClick={() => {
              closeMenu(true, true);
              requestInspectorFocus('die-font-override');
            }}
          >
            <span>Edit Die Font &amp; Typography…</span>
          </button>

          {renderHighFaceEmblemSubmenu([die.id], emblemMode, false)}

          <button
            type="button"
            disabled={!anyCustomContent}
            onPointerMove={(e) => handleItemPointerMove(e)}
            onClick={(e) => {
              batchUpdateAllFaces(die.id, faceIds, { type: 'clear-custom-content' });
              closeMenu(e.detail > 0);
            }}
          >
            <span>Clear Custom Face Text &amp; SVGs</span>
          </button>

          <hr />

          {rotationActions.map((rot) => (
            <button
              key={rot.label}
              type="button"
              onPointerMove={(e) => handleItemPointerMove(e)}
              onClick={(e) => {
                batchUpdateAllFaces(die.id, faceIds, { type: 'rotate', deltaDeg: rot.deltaDeg });
                closeMenu(e.detail > 0);
              }}
            >
              <span>{rot.label}</span>
              <span className="hint" aria-hidden="true">
                {uniformRot !== null
                  ? `${normalizeRotationDeg(uniformRot + rot.deltaDeg)}°`
                  : rot.fallbackHint}
              </span>
            </button>
          ))}

          <button
            type="button"
            disabled={!anyRotated}
            onPointerMove={(e) => handleItemPointerMove(e)}
            onClick={(e) => {
              batchUpdateAllFaces(die.id, faceIds, { type: 'reset-rotation' });
              closeMenu(e.detail > 0);
            }}
          >
            <span>Reset All Rotations (0°)</span>
          </button>

          <hr />

          <button
            type="button"
            disabled={dieScale >= 1.5}
            onPointerMove={(e) => handleItemPointerMove(e)}
            onClick={(e) => {
              batchUpdateAllFaces(die.id, faceIds, { type: 'scale-die', multiplier: scaleUp });
              closeMenu(e.detail > 0);
            }}
          >
            <span>Scale All Faces Larger (+10%)</span>
            <span className="hint" aria-hidden="true">
              {scaleUp.toFixed(2)}×
            </span>
          </button>

          <button
            type="button"
            disabled={dieScale <= 0.5}
            onPointerMove={(e) => handleItemPointerMove(e)}
            onClick={(e) => {
              batchUpdateAllFaces(die.id, faceIds, { type: 'scale-die', multiplier: scaleDown });
              closeMenu(e.detail > 0);
            }}
          >
            <span>Scale All Faces Smaller (−10%)</span>
            <span className="hint" aria-hidden="true">
              {scaleDown.toFixed(2)}×
            </span>
          </button>

          <button
            type="button"
            disabled={!anyScaled}
            onPointerMove={(e) => handleItemPointerMove(e)}
            onClick={(e) => {
              batchUpdateAllFaces(die.id, faceIds, { type: 'reset-scale' });
              closeMenu(e.detail > 0);
            }}
          >
            <span>Reset All Scales (1.00×)</span>
          </button>

          <button
            type="button"
            disabled={!anyOffset}
            onPointerMove={(e) => handleItemPointerMove(e)}
            onClick={(e) => {
              batchUpdateAllFaces(die.id, faceIds, { type: 'center-offsets' });
              closeMenu(e.detail > 0);
            }}
          >
            <span>Center All Offsets (0, 0 mm)</span>
          </button>

          <hr />

          <button
            type="button"
            className="danger-item"
            disabled={!canResetAll}
            onPointerMove={(e) => handleItemPointerMove(e)}
            onClick={(e) => {
              batchUpdateAllFaces(die.id, faceIds, { type: 'reset-all' });
              closeMenu(e.detail > 0);
            }}
          >
            <span>Reset All Face Overrides</span>
          </button>
        </div>
      </>
    );
  };

  return (
    <>
      <span ref={anchorRef} className="studio-context-anchor" aria-hidden="true" />
      <div
        ref={rootPopoverRef}
        id="dcm-studio-context-menu"
        className={`studio-context-popover ${
          !supportsNativePopover && fallbackRootOpen ? 'fallback-open' : ''
        }`}
        {...(supportsNativePopover ? ({ popover: 'auto' } as Record<string, string>) : {})}
        onContextMenu={(e) => e.preventDefault()}
      >
        {contextMenu?.kind === 'die'
          ? renderDieMenu(contextMenu)
          : contextMenu?.kind === 'face'
            ? renderFaceMenu(contextMenu)
            : contextMenu?.kind === 'all-faces'
              ? renderAllFacesMenu(contextMenu)
              : null}
      </div>
    </>
  );
}
