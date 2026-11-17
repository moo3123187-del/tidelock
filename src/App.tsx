import { useEffect, useRef, useState } from 'react';
import { BuildMenuModal } from './components/BuildMenuModal';
import { HudOverlay } from './components/HudOverlay';
import { InventoryModal } from './components/InventoryModal';
import { LanternChoiceModal } from './components/LanternChoiceModal';
import { MachineModal } from './components/MachineModal';
import { ProductionModal } from './components/ProductionModal';
import { TitlePauseModal } from './components/TitlePauseModal';
import { WorldMapModal } from './components/WorldMapModal';
import { TidelockEngine } from './game/engine';
import { HudSnapshot, OrbitPhase, SaveSlotData } from './game/types';

type ActiveModal = 'inventory' | 'build' | 'production' | 'map' | 'lantern' | null;

export type PinnedTarget = { kind: 'recipe' | 'buildable'; id: string } | null;

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<TidelockEngine | null>(null);

  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [showTitle, setShowTitle] = useState(true);
  const [isInitialTitle, setIsInitialTitle] = useState(true);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [inspectedMachineUid, setInspectedMachineUid] = useState<string | null>(null);
  const [pinnedTarget, setPinnedTarget] = useState<PinnedTarget>(null);
  const [saveSlots, setSaveSlots] = useState<(SaveSlotData | null)[]>(() =>
    TidelockEngine.listSaveSlots()
  );

  const refreshSlots = () => setSaveSlots(TidelockEngine.listSaveSlots());

  useEffect(() => {
    if (!mountRef.current) return;
    const engine = new TidelockEngine(mountRef.current, {
      onHudUpdate: (snapshot) => setHud(snapshot),
      onOpenMachine: (uid) => {
        engine.setPaused(true);
        setInspectedMachineUid(uid);
      },
      onOpenLantern: () => {
        engine.setPaused(true);
        setActiveModal('lantern');
      },
      onPauseToggle: () => {
        setInspectedMachineUid((prevM) => {
          if (prevM) {
            engine.setPaused(false);
            return null;
          }
          setActiveModal((prevModal) => {
            if (prevModal) {
              engine.setPaused(false);
              return null;
            }
            setShowTitle((prevTitle) => {
              const next = !prevTitle;
              engine.setPaused(next);
              if (next) refreshSlots();
              return next;
            });
            return null;
          });
          return null;
        });
      },
      onToggleModal: (modal) => {
        setInspectedMachineUid(null);
        setShowTitle(false);
        setActiveModal((prev) => {
          const next = prev === modal ? null : modal;
          engine.setPaused(next !== null);
          return next;
        });
      },
    });
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const closeAllModals = () => {
    setActiveModal(null);
    setInspectedMachineUid(null);
    setShowTitle(false);
    setIsInitialTitle(false);
    engineRef.current?.setPaused(false);
    engineRef.current?.requestPointerLock();
  };

  const handleOpenModal = (modal: 'inventory' | 'build' | 'production' | 'map') => {
    setInspectedMachineUid(null);
    setShowTitle(false);
    setActiveModal((prev) => {
      const next = prev === modal ? null : modal;
      engineRef.current?.setPaused(next !== null);
      return next;
    });
  };

  const inspectedMachine =
    inspectedMachineUid && engineRef.current
      ? engineRef.current.getMachine(inspectedMachineUid) ?? null
      : null;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#070A11]">
      {/* Isolated WebGL Viewport */}
      <div
        ref={mountRef}
        onClick={() => {
          if (!showTitle && !activeModal && !inspectedMachineUid) {
            engineRef.current?.requestPointerLock();
          }
        }}
        className="h-full w-full cursor-crosshair"
      />

      {/* Gameplay HUD */}
      {hud && !showTitle && (
        <HudOverlay
          hud={hud}
          pinnedTarget={pinnedTarget}
          onUnpin={() => setPinnedTarget(null)}
          onSelectSlot={(idx) => engineRef.current?.selectHotbarSlot(idx)}
          onOpenModal={handleOpenModal}
          onPause={() => {
            refreshSlots();
            setShowTitle(true);
            engineRef.current?.setPaused(true);
          }}
          onToggleMute={() => engineRef.current?.toggleMuted()}
          onSetOrbitSpeed={(mult) => engineRef.current?.setOrbitSpeed(mult)}
          onCancelBuild={() => engineRef.current?.enterBuildMode(null)}
        />
      )}

      {/* Modals */}
      {hud && activeModal === 'inventory' && (
        <InventoryModal
          hud={hud}
          pinnedId={pinnedTarget?.kind === 'recipe' ? pinnedTarget.id : null}
          onTogglePin={(id) =>
            setPinnedTarget((prev) => (prev?.kind === 'recipe' && prev.id === id ? null : { kind: 'recipe', id }))
          }
          onClose={closeAllModals}
          onCraft={(recipeId) => engineRef.current?.craftRecipe(recipeId)}
          onUseItem={(itemId) => engineRef.current?.useInventoryItem(itemId)}
          onEquipToHotbar={(invIdx) => engineRef.current?.equipInventoryToHotbar(invIdx)}
        />
      )}

      {hud && activeModal === 'build' && (
        <BuildMenuModal
          hud={hud}
          pinnedId={pinnedTarget?.kind === 'buildable' ? pinnedTarget.id : null}
          onTogglePin={(id) =>
            setPinnedTarget((prev) => (prev?.kind === 'buildable' && prev.id === id ? null : { kind: 'buildable', id }))
          }
          onClose={closeAllModals}
          onSelectBuild={(defId) => {
            engineRef.current?.enterBuildMode(defId);
            closeAllModals();
          }}
        />
      )}

      {hud && activeModal === 'production' && (
        <ProductionModal hud={hud} onClose={closeAllModals} />
      )}

      {hud && activeModal === 'map' && <WorldMapModal hud={hud} onClose={closeAllModals} />}

      {hud && activeModal === 'lantern' && (
        <LanternChoiceModal
          hud={hud}
          onChoose={(choice) => engineRef.current?.chooseLanternEnding(choice)}
          onClose={closeAllModals}
        />
      )}

      {hud && inspectedMachine && (
        <MachineModal
          machine={inspectedMachine}
          hud={hud}
          onClose={closeAllModals}
          onSelectRecipe={(recipeId) =>
            engineRef.current?.setMachineRecipe(inspectedMachine.uid, recipeId)
          }
          onFeed={(itemId, amount) =>
            engineRef.current?.feedMachineFromInventory(inspectedMachine.uid, itemId, amount)
          }
          onCollect={() => engineRef.current?.collectMachineOutputs(inspectedMachine.uid)}
          onDismantle={() => {
            if (engineRef.current?.dismantleMachine(inspectedMachine.uid)) {
              closeAllModals();
            }
          }}
        />
      )}

      {/* Title & Pause / Save Slot Selector */}
      {showTitle && hud && (
        <TitlePauseModal
          isTitle={isInitialTitle}
          currentSlot={hud.saveSlot}
          slots={saveSlots}
          orbitPhase={hud.orbitPhase}
          mouseSensitivity={hud.mouseSensitivity}
          onResume={closeAllModals}
          onNewGame={(slot) => {
            engineRef.current?.newGame(slot);
            refreshSlots();
            closeAllModals();
          }}
          onLoadSlot={(slot) => {
            engineRef.current?.loadGame(slot);
            closeAllModals();
          }}
          onSaveCurrent={(slot) => {
            engineRef.current?.saveGame(slot);
            refreshSlots();
          }}
          onJumpPhase={(phase: OrbitPhase) => {
            engineRef.current?.advanceToPhase(phase);
          }}
          onSetSensitivity={(mult) => engineRef.current?.setMouseSensitivity(mult)}
        />
      )}
    </div>
  );
}
