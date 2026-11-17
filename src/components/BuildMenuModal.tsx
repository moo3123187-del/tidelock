import React, { useState } from 'react';
import { Hammer, Pin, X } from 'lucide-react';
import { BUILDABLES, ITEMS } from '../game/config';
import { getIsoIconDataUrl } from '../game/isoIcons';
import { BuildableDef, HudSnapshot } from '../game/types';

interface BuildMenuModalProps {
  hud: HudSnapshot;
  pinnedId: string | null;
  onTogglePin: (defId: string) => void;
  onClose: () => void;
  onSelectBuild: (defId: string) => void;
}

const CATEGORIES: { id: BuildableDef['category'] | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'machine', label: 'Machines' },
  { id: 'power', label: 'Power' },
  { id: 'logistics', label: 'Logistics' },
  { id: 'module', label: 'Base Modules' },
  { id: 'vehicle', label: 'Vehicles' },
];

export const BuildMenuModal: React.FC<BuildMenuModalProps> = ({
  hud,
  pinnedId,
  onTogglePin,
  onClose,
  onSelectBuild,
}) => {
  const [cat, setCat] = useState<BuildableDef['category'] | 'all'>('all');

  const countOf = (itemId: string) => {
    let n = 0;
    for (const s of hud.inventory) if (s.itemId === itemId) n += s.count;
    for (const s of hud.hotbar) if (s && s.itemId === itemId) n += s.count;
    return n;
  };

  const list = Object.values(BUILDABLES).filter((b) => cat === 'all' || b.category === cat);

  return (
    <div className="pda-backdrop fixed inset-0 z-30 flex items-center justify-center p-4">
      <div className="chamfer-panel tactical-grid flex max-h-[86vh] w-full max-w-5xl flex-col border border-white/20 text-slate-100 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/12 px-7 py-4">
          <div className="border-l-2 border-[#F2C230] pl-3">
            <h2 className="font-display text-lg font-bold uppercase tracking-wider text-white">
              Habitat &amp; Industry Constructor
            </h2>
            <p className="mt-0.5 text-xs text-slate-300">
              Modules snap on 10-stud grid · Machines snap on 2-stud grid · Drills snap to ore nodes
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="chamfer-sm flex flex-wrap items-center gap-1 border border-white/12 bg-black/40 p-1">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCat(c.id)}
                  className={`chamfer-btn px-3 py-1 text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${
                    cat === c.id ? 'bg-[#F2C230] text-slate-950' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              className="chamfer-btn ml-1 border border-white/12 bg-white/5 p-2 text-slate-300 hover:bg-white/15 hover:text-white"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3.5 overflow-y-auto p-6 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((b) => {
            const unlocked = !b.unlockBlueprint || hud.blueprints.includes(b.unlockBlueprint);
            const affordable = unlocked && Object.entries(b.cost).every(([id, q]) => countOf(id) >= q);
            const isPinned = pinnedId === b.id;
            return (
              <div
                key={b.id}
                className={`chamfer-sm flex flex-col justify-between border p-4 ${
                  unlocked
                    ? 'border-white/12 bg-[#0D1422]/80'
                    : 'border-white/5 bg-black/30 opacity-50'
                }`}
              >
                <div>
                  <div className="flex items-start gap-3">
                    <img
                      src={getIsoIconDataUrl(b.id, 64)}
                      alt={b.name}
                      className="h-12 w-12 shrink-0 object-contain"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-sm font-bold text-white">{b.name}</div>
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        Tier {b.tier} · {b.footprint.join('×')} ·{' '}
                        {b.powerKw < 0 ? (
                          <span className="font-mono-num text-[#3DDC84]">+{Math.abs(b.powerKw)} kW</span>
                        ) : b.powerKw > 0 ? (
                          <span className="font-mono-num text-[#F2C230]">-{b.powerKw} kW</span>
                        ) : (
                          <span className="font-mono-num">0 kW</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="mt-2.5 text-xs leading-relaxed text-slate-300">{b.description}</p>
                </div>

                <div className="mt-3 border-t border-white/10 pt-2.5">
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                    {Object.entries(b.cost).map(([id, qty]) => {
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
                  <div className="mt-3 flex items-center gap-1.5">
                    {unlocked && (
                      <button
                        onClick={() => onTogglePin(b.id)}
                        className={`chamfer-btn border p-2 transition-colors ${
                          isPinned
                            ? 'border-[#F2C230] bg-[#F2C230]/20 text-[#F2C230]'
                            : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                        }`}
                        title={isPinned ? 'Unpin from HUD' : 'Pin blueprint to HUD'}
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      disabled={!affordable}
                      onClick={() => onSelectBuild(b.id)}
                      className={`chamfer-btn flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                        affordable
                          ? 'bg-[#F2C230] text-slate-950 hover:bg-amber-300'
                          : 'bg-white/5 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <Hammer className="w-3.5 h-3.5" />
                      <span>{unlocked ? 'Deploy Hologram' : 'Scan Wreck to Unlock'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
