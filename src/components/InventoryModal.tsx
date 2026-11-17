import React, { useState } from 'react';
import { X, Wrench, CheckCircle2, Pin } from 'lucide-react';
import { ITEMS, RECIPES, SUIT_SPECS, TANK_SPECS } from '../game/config';
import { getIsoIconDataUrl } from '../game/isoIcons';
import { HudSnapshot } from '../game/types';

interface InventoryModalProps {
  hud: HudSnapshot;
  pinnedId: string | null;
  onTogglePin: (recipeId: string) => void;
  onClose: () => void;
  onCraft: (recipeId: string) => void;
  onUseItem: (itemId: string) => void;
  onEquipToHotbar: (invIdx: number) => void;
}

const INVENTORY_INDICES = Array.from({ length: 30 }, (_, i) => i);

export const InventoryModal: React.FC<InventoryModalProps> = ({
  hud,
  pinnedId,
  onTogglePin,
  onClose,
  onCraft,
  onUseItem,
  onEquipToHotbar,
}) => {
  const [tab, setTab] = useState<'craft' | 'blueprints'>('craft');
  const [selectedCell, setSelectedCell] = useState<number | null>(null);

  const countOf = (itemId: string) => {
    let n = 0;
    for (const s of hud.inventory) if (s.itemId === itemId) n += s.count;
    for (const s of hud.hotbar) if (s && s.itemId === itemId) n += s.count;
    return n;
  };

  const fabricatorRecipes = RECIPES.filter((r) => r.machine === 'fabricator');
  const inspectedSlot = selectedCell !== null ? hud.inventory[selectedCell] : undefined;
  const inspectedDef = inspectedSlot ? ITEMS[inspectedSlot.itemId] : null;
  const isUsable =
    inspectedSlot?.itemId === 'water_flask' ||
    inspectedSlot?.itemId === 'ration' ||
    inspectedSlot?.itemId === 'medkit';

  return (
    <div className="pda-backdrop fixed inset-0 z-30 flex items-center justify-center p-4">
      <div className="chamfer-panel tactical-grid flex max-h-[86vh] w-full max-w-5xl flex-col border border-white/20 text-slate-100 shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/12 px-7 py-4">
          <div className="border-l-2 border-[#38BDF8] pl-3">
            <h2 className="font-display text-lg font-bold uppercase tracking-wider text-white">
              Suit Storage &amp; Fabricator
            </h2>
            <p className="mt-0.5 text-xs text-slate-300">
              {SUIT_SPECS[hud.stats.suitTier].name} · {TANK_SPECS[hud.stats.tankTier].name} ({hud.stats.maxOxygen}s O₂)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="chamfer-sm flex items-center gap-1 border border-white/12 bg-black/40 p-1">
              <button
                onClick={() => setTab('craft')}
                className={`chamfer-btn px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                  tab === 'craft' ? 'bg-[#F2C230] text-slate-950' : 'text-slate-300 hover:text-white'
                }`}
              >
                Fabricator
              </button>
              <button
                onClick={() => setTab('blueprints')}
                className={`chamfer-btn px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                  tab === 'blueprints' ? 'bg-[#38BDF8] text-slate-950' : 'text-slate-300 hover:text-white'
                }`}
              >
                Blueprints ({hud.blueprints.length})
              </button>
            </div>
            <button
              onClick={onClose}
              className="chamfer-btn border border-white/12 bg-white/5 p-2 text-slate-300 hover:bg-white/15 hover:text-white"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 md:grid-cols-12">
          {/* Left: Interactive Inventory Grid */}
          <div className="flex flex-col md:col-span-5">
            <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Backpack Cells (Click Item to Use / Equip)
            </h3>
            <div className="grid grid-cols-5 gap-2">
              {INVENTORY_INDICES.map((i) => {
                const slot = hud.inventory[i];
                const def = slot ? ITEMS[slot.itemId] : null;
                const isSel = selectedCell === i && Boolean(slot);
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!slot}
                    onClick={() => setSelectedCell(isSel ? null : i)}
                    className={`chamfer-slot relative flex h-16 flex-col items-center justify-center border p-1 transition-colors ${
                      isSel
                        ? 'border-[#F2C230] bg-[#162238]'
                        : slot
                        ? 'border-white/15 bg-[#0F1726]/80 hover:border-white/35'
                        : 'border-white/8 bg-black/25 cursor-default'
                    }`}
                    title={def ? `${def.name}: ${def.description}` : 'Empty'}
                  >
                    {slot && def && (
                      <>
                        <img
                          src={getIsoIconDataUrl(slot.itemId, 64)}
                          alt={def.name}
                          className="h-9 w-9 object-contain"
                        />
                        <span className="w-full truncate text-center text-[9px] font-medium text-slate-300">
                          {def.name.split(' ')[0]}
                        </span>
                        <span className="font-mono-num absolute right-1.5 top-0.5 text-[10px] font-bold text-[#F2C230]">
                          {slot.count}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>

            {inspectedSlot && inspectedDef && (
              <div className="chamfer-sm mt-3 flex items-center justify-between gap-2 border border-white/15 bg-[#0D1422]/90 px-3 py-2.5 text-xs">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-white">{inspectedDef.name}</div>
                  <div className="truncate text-[11px] text-slate-400">{inspectedDef.description}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {isUsable && (
                    <button
                      onClick={() => onUseItem(inspectedSlot.itemId)}
                      className="chamfer-btn bg-[#3DDC84] px-3 py-1.5 text-[11px] font-bold text-slate-950 hover:bg-emerald-300"
                    >
                      Use
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (selectedCell !== null) onEquipToHotbar(selectedCell);
                    }}
                    className="chamfer-btn bg-[#38BDF8] px-3 py-1.5 text-[11px] font-bold text-slate-950 hover:bg-sky-300"
                  >
                    Hotbar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: Fabricator Crafting or Blueprints */}
          <div className="flex flex-col md:col-span-7">
            {tab === 'craft' ? (
              <>
                <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Fabricator Schematics
                </h3>
                <div className="max-h-[56vh] space-y-2 overflow-y-auto pr-1">
                  {fabricatorRecipes.map((r) => {
                    const unlocked = !r.unlockBlueprint || hud.blueprints.includes(r.unlockBlueprint);
                    const canAfford =
                      unlocked &&
                      Object.entries(r.inputs).every(([id, qty]) => countOf(id) >= qty);
                    const isPinned = pinnedId === r.id;
                    return (
                      <div
                        key={r.id}
                        className={`chamfer-sm flex items-center justify-between gap-3 border px-3.5 py-2.5 ${
                          unlocked
                            ? 'border-white/12 bg-[#0D1422]/80'
                            : 'border-white/5 bg-black/30 opacity-50'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <img
                            src={getIsoIconDataUrl(Object.keys(r.outputs)[0], 64)}
                            alt={r.name}
                            className="h-10 w-10 shrink-0 object-contain"
                          />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white">
                              {r.name}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px]">
                              {Object.entries(r.inputs).map(([id, qty]) => {
                                const have = countOf(id);
                                return (
                                  <span
                                    key={id}
                                    className={`font-mono-num ${have >= qty ? 'text-[#3DDC84]' : 'text-[#E5484D]'}`}
                                  >
                                    {ITEMS[id]?.name ?? id}: {have}/{qty}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {unlocked && (
                            <button
                              onClick={() => onTogglePin(r.id)}
                              className={`chamfer-btn border p-2 transition-colors ${
                                isPinned
                                  ? 'border-[#F2C230] bg-[#F2C230]/20 text-[#F2C230]'
                                  : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                              }`}
                              title={isPinned ? 'Unpin from HUD' : 'Pin recipe to HUD'}
                            >
                              <Pin className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            disabled={!canAfford}
                            onClick={() => onCraft(r.id)}
                            className={`chamfer-btn flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${
                              canAfford
                                ? 'bg-[#F2C230] text-slate-950 hover:bg-amber-300'
                                : 'bg-white/5 text-slate-500 cursor-not-allowed'
                            }`}
                          >
                            <Wrench className="w-3.5 h-3.5" />
                            <span>{unlocked ? 'Craft' : 'Locked'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Unlocked Blueprints (Scan Meridian Wrecks &amp; Ruins)
                </h3>
                <div className="grid max-h-[56vh] grid-cols-2 gap-2 overflow-y-auto pr-1">
                  {hud.blueprints.map((bp) => (
                    <div
                      key={bp}
                      className="chamfer-sm flex items-center gap-2 border border-white/10 bg-[#0D1422]/80 px-3 py-2 text-xs"
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-[#3DDC84]" />
                      <span className="truncate font-medium text-slate-200">{ITEMS[bp]?.name ?? bp}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
