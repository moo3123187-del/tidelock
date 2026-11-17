import React from 'react';
import { X, ArrowDownToLine, ArrowUpFromLine, Trash2 } from 'lucide-react';
import { BUILDABLES, ITEMS, RECIPES } from '../game/config';
import { getIsoIconDataUrl } from '../game/isoIcons';
import { HudSnapshot, MachineInstance } from '../game/types';

interface MachineModalProps {
  machine: MachineInstance;
  hud: HudSnapshot;
  onClose: () => void;
  onSelectRecipe: (recipeId: string) => void;
  onFeed: (itemId: string, amount: number) => void;
  onCollect: () => void;
  onDismantle: () => void;
}

export const MachineModal: React.FC<MachineModalProps> = ({
  machine,
  hud,
  onClose,
  onSelectRecipe,
  onFeed,
  onCollect,
  onDismantle,
}) => {
  const def = BUILDABLES[machine.defId];
  const recipes = RECIPES.filter((r) => r.machine === machine.defId);
  const activeRecipe = recipes.find((r) => r.id === machine.recipeId);

  const countOf = (itemId: string) => {
    let n = 0;
    for (const s of hud.inventory) if (s.itemId === itemId) n += s.count;
    for (const s of hud.hotbar) if (s && s.itemId === itemId) n += s.count;
    return n;
  };

  const stateColor =
    machine.state === 'Running' || machine.state === 'Throttled'
      ? '#3DDC84'
      : machine.state === 'NoPower'
      ? '#4DA3FF'
      : machine.state === 'Fault'
      ? '#FF4D4D'
      : '#FFB020';

  return (
    <div className="pda-backdrop fixed inset-0 z-30 flex items-center justify-center p-4">
      <div className="chamfer-panel tactical-grid w-full max-w-xl border border-white/20 text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/12 px-7 py-4">
          <div className="flex items-center gap-3">
            <img src={getIsoIconDataUrl(machine.defId, 64)} alt={def.name} className="h-10 w-10" />
            <div>
              <h2 className="font-display text-base font-bold uppercase tracking-wider text-white">
                {def.name}
              </h2>
              <div className="mt-0.5 flex items-center gap-2 text-xs">
                <span className="font-bold" style={{ color: stateColor }}>
                  {machine.state}
                </span>
                <span className="text-slate-500">·</span>
                <span className="font-mono-num text-slate-300">
                  {def.powerKw < 0 ? `+${Math.abs(def.powerKw)} kW` : `${def.powerKw} kW`}
                </span>
                {machine.nodeResource && (
                  <>
                    <span className="text-slate-500">·</span>
                    <span className="text-[#F2C230]">Node: {ITEMS[machine.nodeResource]?.name}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="chamfer-btn border border-white/12 bg-white/5 p-2 text-slate-300 hover:bg-white/15 hover:text-white"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {recipes.length > 0 && (
            <div>
              <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Active Schematic
              </div>
              <div className="grid grid-cols-2 gap-2">
                {recipes.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => onSelectRecipe(r.id)}
                    className={`chamfer-sm flex items-center gap-2.5 border px-3 py-2.5 text-left text-xs transition-colors ${
                      machine.recipeId === r.id
                        ? 'border-[#3DDC84] bg-[#0F241D]/80 text-white'
                        : 'border-white/10 bg-[#0D1422]/80 text-slate-300 hover:border-white/25'
                    }`}
                  >
                    <img
                      src={getIsoIconDataUrl(Object.keys(r.outputs)[0], 64)}
                      alt={r.name}
                      className="h-7 w-7 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{r.name}</div>
                      <div className="font-mono-num text-[10px] text-slate-400">{r.time}s</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeRecipe && (
            <div>
              <div className="flex justify-between text-xs text-slate-300">
                <span>Processing {activeRecipe.name}</span>
                <span className="font-mono-num font-bold text-[#3DDC84]">
                  {Math.min(100, Math.round((machine.progress / activeRecipe.time) * 100))}%
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full bg-white/10">
                <div
                  className="h-full bg-[#3DDC84] transition-all"
                  style={{ width: `${Math.min(100, (machine.progress / activeRecipe.time) * 100)}%` }}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="chamfer-sm border border-white/10 bg-[#0D1422]/85 p-3.5">
              <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Input Buffer
              </div>
              {activeRecipe ? (
                <div className="space-y-2.5">
                  {Object.entries(activeRecipe.inputs).map(([id, needed]) => {
                    const buffered = machine.inputBuffer[id] || 0;
                    const invCount = countOf(id);
                    return (
                      <div key={id} className="flex items-center justify-between gap-2 text-xs">
                        <div>
                          <div className="font-medium text-white">{ITEMS[id]?.name}</div>
                          <div className="font-mono-num text-[11px] text-slate-400">
                            In: {buffered} (Need {needed})
                          </div>
                        </div>
                        <button
                          disabled={invCount <= 0}
                          onClick={() => onFeed(id, 5)}
                          className={`chamfer-btn flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold whitespace-nowrap ${
                            invCount > 0
                              ? 'bg-[#38BDF8] text-slate-950 hover:bg-sky-300'
                              : 'bg-white/5 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          <ArrowDownToLine className="w-3 h-3" />
                          <span>+5 ({invCount})</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-slate-500">Automated input</div>
              )}
            </div>

            <div className="chamfer-sm border border-white/10 bg-[#0D1422]/85 p-3.5">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                  Output Buffer
                </span>
                <button
                  onClick={onCollect}
                  className="chamfer-btn flex items-center gap-1 bg-[#3DDC84] px-2.5 py-1 text-[11px] font-bold text-slate-950 hover:bg-emerald-300 whitespace-nowrap"
                >
                  <ArrowUpFromLine className="w-3 h-3" />
                  <span>Collect</span>
                </button>
              </div>
              <div className="space-y-1.5 text-xs">
                {Object.entries(machine.outputBuffer).filter(([, q]) => q > 0).length === 0 ? (
                  <div className="text-slate-500">Empty</div>
                ) : (
                  Object.entries(machine.outputBuffer)
                    .filter(([, q]) => q > 0)
                    .map(([id, q]) => (
                      <div key={id} className="flex justify-between">
                        <span className="text-slate-200">{ITEMS[id]?.name ?? id}</span>
                        <span className="font-mono-num font-bold text-[#3DDC84]">{q}</span>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>

          {def.capacityKws && (
            <div className="chamfer-sm border border-white/10 bg-[#0D1422]/85 p-3.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-300">Stored Energy</span>
                <span className="font-mono-num font-bold text-[#F2C230]">
                  {Math.round(machine.storedEnergy || 0)} / {def.capacityKws} kWs
                </span>
              </div>
            </div>
          )}

          {machine.uid !== 'starter_fab' && (
            <div className="flex justify-end pt-1">
              <button
                onClick={onDismantle}
                className="chamfer-btn flex items-center gap-1.5 border border-red-400/35 bg-red-500/15 px-3.5 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/30"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Dismantle (100% Refund)</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
