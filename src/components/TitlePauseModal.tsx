import React, { useState } from 'react';
import { Play, Save, RotateCcw, Sun, Sunset, Moon, Sunrise, Wind, Keyboard } from 'lucide-react';
import { OrbitPhase, SaveSlotData } from '../game/types';

interface TitlePauseModalProps {
  isTitle: boolean;
  currentSlot: number;
  slots: (SaveSlotData | null)[];
  orbitPhase: OrbitPhase;
  mouseSensitivity: number;
  onResume: () => void;
  onNewGame: (slot: number) => void;
  onLoadSlot: (slot: number) => void;
  onSaveCurrent: (slot: number) => void;
  onJumpPhase: (phase: OrbitPhase) => void;
  onSetSensitivity: (mult: number) => void;
}

export const TitlePauseModal: React.FC<TitlePauseModalProps> = ({
  isTitle,
  currentSlot,
  slots,
  orbitPhase,
  mouseSensitivity,
  onResume,
  onNewGame,
  onLoadSlot,
  onSaveCurrent,
  onJumpPhase,
  onSetSensitivity,
}) => {
  const [rightTab, setRightTab] = useState<'slots' | 'guide'>('slots');
  const activeSave = slots[currentSlot - 1];

  if (isTitle) {
    return (
      <div
        className="fixed inset-0 z-40 flex items-center p-6 sm:p-12"
        style={{
          background:
            'linear-gradient(95deg, rgba(6,9,16,0.94) 0%, rgba(6,9,16,0.78) 42%, rgba(6,9,16,0.12) 78%, rgba(6,9,16,0.02) 100%)',
        }}
      >
        <div className="flex max-h-[90vh] w-full max-w-[460px] flex-col justify-between overflow-y-auto pr-2">
          {/* Editorial Game Title Lockup */}
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7AA2FF]">
              <span className="h-px w-6 bg-[#7AA2FF]" />
              <span>Moon Orrin · First-Person Survival</span>
            </div>
            <h1 className="font-display mt-2 text-5xl font-bold tracking-[0.12em] text-white sm:text-6xl">
              TIDELOCK
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Survive Tessara’s 48-minute orbit, build automated power grids before the Eclipse, and dive the Near Sea Trench.
            </p>

            {/* Primary Launch / Continue CTA */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {activeSave ? (
                <button
                  onClick={() => onLoadSlot(currentSlot)}
                  className="chamfer-btn flex items-center gap-2.5 bg-[#F2C230] px-7 py-3 text-sm font-bold uppercase tracking-wider text-slate-950 transition-colors hover:bg-amber-300"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Continue Slot {currentSlot}</span>
                </button>
              ) : (
                <button
                  onClick={() => onNewGame(currentSlot)}
                  className="chamfer-btn flex items-center gap-2.5 bg-[#F2C230] px-7 py-3 text-sm font-bold uppercase tracking-wider text-slate-950 transition-colors hover:bg-amber-300"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Launch Expedition</span>
                </button>
              )}

              <div className="flex items-center gap-1 border border-white/12 bg-[#0B101C]/80 p-1 chamfer-sm">
                <button
                  onClick={() => setRightTab('slots')}
                  className={`chamfer-btn px-3 py-1.5 text-xs font-semibold transition-colors ${
                    rightTab === 'slots' ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Save Slots
                </button>
                <button
                  onClick={() => setRightTab('guide')}
                  className={`chamfer-btn px-3 py-1.5 text-xs font-semibold transition-colors ${
                    rightTab === 'guide' ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Controls &amp; Air
                </button>
              </div>
            </div>
          </div>

          {/* Compact Tabbed Content: Slots or Guide */}
          <div className="mt-7">
            {rightTab === 'slots' ? (
              <div className="space-y-2.5">
                {[1, 2, 3].map((slotNum, idx) => {
                  const data = slots[idx];
                  const selected = currentSlot === slotNum;
                  return (
                    <div
                      key={slotNum}
                      className={`chamfer-sm flex items-center justify-between gap-3 border px-4 py-3 transition-colors ${
                        selected
                          ? 'border-[#F2C230]/60 bg-[#101726]/90'
                          : 'border-white/10 bg-[#090D16]/75 hover:border-white/25'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white">
                          <span>Slot {slotNum}</span>
                          {data && (
                            <>
                              <span className="text-slate-500">·</span>
                              <span className="font-mono-num text-[#38BDF8] font-medium">
                                Orbit {Math.floor(data.orbitSeconds / 60)}m · {data.blueprints.length} BPs
                              </span>
                            </>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-slate-400">
                          {data
                            ? `${data.machines.length} machines · Saved ${new Date(data.savedAt).toLocaleTimeString()}`
                            : 'Empty Expedition Slot'}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {data && (
                          <button
                            onClick={() => onLoadSlot(slotNum)}
                            className="chamfer-btn bg-[#38BDF8] px-3 py-1.5 text-[11px] font-bold text-slate-950 hover:bg-sky-300"
                          >
                            Load
                          </button>
                        )}
                        <button
                          onClick={() => onNewGame(slotNum)}
                          className="chamfer-btn flex items-center gap-1 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#F2C230] hover:text-slate-950"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>{data ? 'New' : 'Start'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="chamfer-sm border border-[#38BDF8]/35 bg-[#091824]/85 p-3.5 leading-relaxed">
                  <div className="mb-1 flex items-center gap-1.5 font-semibold text-[#38BDF8]">
                    <Wind className="w-3.5 h-3.5" />
                    <span>Where Air (O₂) Is Needed</span>
                  </div>
                  <p className="text-slate-300">
                    Plains, Terminator Belt, and Spine air is breathable. O₂ tanks are used when{' '}
                    <strong className="text-white">submerged underwater</strong> outside the Needle Sub, or inside the{' '}
                    <strong className="text-white">Far Side toxic haze</strong> before Suit Tier 2.
                  </p>
                </div>

                <div className="chamfer-sm border border-white/10 bg-[#090D16]/85 p-3.5">
                  <div className="mb-2 flex items-center gap-1.5 font-semibold text-[#F2C230]">
                    <Keyboard className="w-3.5 h-3.5" />
                    <span>Flight &amp; Suit Controls</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                    <div className="flex justify-between"><span className="text-slate-400">Move</span><span className="font-mono-num text-white">WASD</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Sprint</span><span className="font-mono-num text-white">Shift</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Jump / Dive</span><span className="font-mono-num text-white">Space / C</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Scan / Mine</span><span className="font-mono-num text-white">LMB</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Interact</span><span className="font-mono-num text-white">E</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Lamp / HUD</span><span className="font-mono-num text-white">F / H</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Craft / Build</span><span className="font-mono-num text-white">Tab / B</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Power / Map</span><span className="font-mono-num text-white">P / M</span></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // In-Game Pause Overlay
  return (
    <div className="pda-backdrop fixed inset-0 z-40 flex items-center justify-center p-6">
      <div className="chamfer-panel tactical-grid w-full max-w-4xl border border-white/15 p-7 text-slate-100 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7AA2FF]">
              Expedition Paused · Moon Orrin
            </div>
            <h1 className="font-display mt-1 text-3xl font-bold tracking-wider text-white">
              TIDELOCK TELEMETRY
            </h1>
          </div>
          <button
            onClick={onResume}
            className="chamfer-btn flex items-center gap-2 bg-[#F2C230] px-6 py-2.5 text-sm font-bold uppercase tracking-wider text-slate-950 hover:bg-amber-300"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Resume</span>
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Save Slots
            </h2>
            <div className="space-y-2">
              {[1, 2, 3].map((slotNum, idx) => {
                const data = slots[idx];
                const active = currentSlot === slotNum;
                return (
                  <div
                    key={slotNum}
                    className={`chamfer-sm flex items-center justify-between gap-3 border px-4 py-3 ${
                      active ? 'border-[#F2C230]/55 bg-white/[0.06]' : 'border-white/10 bg-white/[0.02]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs font-bold text-white">
                        <span>Slot {slotNum}</span>
                        {data && (
                          <span className="font-mono-num text-[#38BDF8] font-normal">
                            · Orbit {Math.floor(data.orbitSeconds / 60)}m · {data.blueprints.length} BPs
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-slate-400">
                        {data
                          ? `${data.machines.length} machines · ${new Date(data.savedAt).toLocaleTimeString()}`
                          : 'Empty Slot'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => onSaveCurrent(slotNum)}
                        className="chamfer-btn flex items-center gap-1 bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-white/20"
                      >
                        <Save className="w-3 h-3" />
                        <span>Save</span>
                      </button>
                      {data && (
                        <button
                          onClick={() => onLoadSlot(slotNum)}
                          className="chamfer-btn bg-[#38BDF8] px-3 py-1.5 text-[11px] font-bold text-slate-950 hover:bg-sky-300"
                        >
                          Load
                        </button>
                      )}
                      <button
                        onClick={() => onNewGame(slotNum)}
                        className="chamfer-btn bg-[#F2C230] px-3 py-1.5 text-[11px] font-bold text-slate-950 hover:bg-amber-300"
                      >
                        New
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="chamfer-sm border border-white/10 bg-white/[0.02] p-4">
              <div className="mb-2.5 flex items-center justify-between text-xs">
                <span className="font-semibold uppercase tracking-wider text-slate-400">Orbit Phase Control</span>
                <span className="font-mono-num font-bold text-[#7AA2FF]">{orbitPhase}</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {(
                  [
                    ['Day', Sun],
                    ['Dusk', Sunset],
                    ['Eclipse', Moon],
                    ['Dawn', Sunrise],
                  ] as const
                ).map(([phase, Icon]) => (
                  <button
                    key={phase}
                    onClick={() => onJumpPhase(phase)}
                    className={`chamfer-btn flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold transition-colors ${
                      orbitPhase === phase
                        ? 'bg-[#7AA2FF] text-slate-950'
                        : 'bg-white/[0.06] text-slate-200 hover:bg-white/15'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{phase}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            <div className="chamfer-sm border border-white/10 bg-white/[0.02] p-4">
              <h2 className="mb-2.5 font-semibold uppercase tracking-wider text-[#F2C230]">Controls</h2>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <div className="flex justify-between"><span className="text-slate-400">Move</span><span className="font-mono-num text-white">WASD</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Sprint</span><span className="font-mono-num text-white">Shift</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Jump / Dive</span><span className="font-mono-num text-white">Space / C</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Scan / Mine</span><span className="font-mono-num text-white">LMB</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Interact</span><span className="font-mono-num text-white">E</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Dismantle</span><span className="font-mono-num text-white">X</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Hotbar</span><span className="font-mono-num text-white">1–8 / Wheel</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Craft / Build</span><span className="font-mono-num text-white">Tab / B</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Power / Map</span><span className="font-mono-num text-white">P / M</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Pause / Cancel</span><span className="font-mono-num text-white">Esc / RMB</span></div>
              </div>
              <div className="mt-3.5 border-t border-white/10 pt-3">
                <div className="mb-1.5 flex items-center justify-between text-[11px]">
                  <span className="text-slate-300">Look Sensitivity</span>
                  <span className="font-mono-num font-bold text-[#F2C230]">
                    {mouseSensitivity.toFixed(1)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.4}
                  max={2.4}
                  step={0.1}
                  value={mouseSensitivity}
                  onChange={(e) => onSetSensitivity(parseFloat(e.target.value))}
                  className="h-1.5 w-full cursor-pointer accent-[#F2C230]"
                />
              </div>
            </div>

            <div className="chamfer-sm border border-[#38BDF8]/30 bg-[#0A1826]/70 p-4 leading-relaxed">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-[#38BDF8]">
                <Wind className="w-4 h-4" />
                <span>Atmosphere &amp; Air (O₂)</span>
              </div>
              <p className="text-slate-300">
                Surface air is breathable on Plains, Belt, and Spine. O₂ is consumed underwater outside the Needle Sub and inside Far Side Dark haze without Suit T2+.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
