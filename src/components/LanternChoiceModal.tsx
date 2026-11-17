import React from 'react';
import { Shield, Rocket, Radio, X } from 'lucide-react';
import { HudSnapshot } from '../game/types';

interface LanternChoiceModalProps {
  hud: HudSnapshot;
  onChoose: (choice: 'keeper' | 'exodus' | 'signal') => void;
  onClose: () => void;
}

export const LanternChoiceModal: React.FC<LanternChoiceModalProps> = ({
  hud,
  onChoose,
  onClose,
}) => {
  const ending = hud.story.ending;

  return (
    <div className="pda-backdrop fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="chamfer-panel tactical-grid w-full max-w-3xl border border-[#D9B25F]/60 text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/12 px-7 py-4">
          <div className="border-l-2 border-[#D9B25F] pl-3">
            <h2 className="font-display text-xl font-bold uppercase tracking-wider text-[#BEEFE6]">
              The Lantern · Control Core of Orrin
            </h2>
            <p className="mt-0.5 text-xs text-[#D9B25F]">
              Orrin is an engineered tidal anchor holding Tessara’s oceans in balance.
            </p>
          </div>
          <button
            onClick={onClose}
            className="chamfer-btn border border-white/12 bg-white/5 p-2 text-slate-300 hover:bg-white/15 hover:text-white"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          {ending ? (
            <div className="space-y-4 py-4 text-center">
              <div className="font-display text-2xl font-bold uppercase tracking-wider text-[#D9B25F]">
                {ending === 'keeper'
                  ? 'Ending I: The Keeper'
                  : ending === 'exodus'
                  ? 'Ending II: The Exodus'
                  : 'Ending III: The Signal'}
              </div>
              <p className="mx-auto max-w-xl text-sm leading-relaxed text-slate-300">
                {ending === 'keeper'
                  ? 'You restarted the Conduit engine. Orrin’s tides stabilize across both seas, locking you in as the eternal keeper of the tidal anchor.'
                  : ending === 'exodus'
                  ? 'You shut down the Conduit core. Tidal stress ends as the lowlands flood, clearing the path to build a rescue beacon and leave Orrin behind.'
                  : 'You rewired the Conduit under crushing pressure, redirecting the moon’s core power into an interstellar rescue signal while keeping Tessara’s tides steady.'}
              </p>
              <button
                onClick={onClose}
                className="chamfer-btn bg-[#D9B25F] px-6 py-2.5 text-sm font-bold uppercase tracking-wider text-slate-950 hover:bg-amber-300"
              >
                Continue Exploring Orrin
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <button
                onClick={() => onChoose('keeper')}
                className="chamfer-sm flex flex-col justify-between border border-[#38BDF8]/45 bg-[#0A1826]/80 p-4 text-left transition-colors hover:border-[#38BDF8] hover:bg-[#0D2134]"
              >
                <div>
                  <Shield className="w-6 h-6 text-[#38BDF8]" />
                  <h3 className="font-display mt-3 text-base font-bold text-white">
                    1. Restart the Engine
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-300">
                    Stabilize the Conduit and save Orrin’s tides, locking you in as the moon’s Keeper.
                  </p>
                </div>
                <div className="mt-4 text-xs font-bold uppercase tracking-wider text-[#38BDF8]">
                  Ending: The Keeper
                </div>
              </button>

              <button
                onClick={() => onChoose('exodus')}
                className="chamfer-sm flex flex-col justify-between border border-[#E86F51]/45 bg-[#24110D]/80 p-4 text-left transition-colors hover:border-[#E86F51] hover:bg-[#311712]"
              >
                <div>
                  <Rocket className="w-6 h-6 text-[#E86F51]" />
                  <h3 className="font-display mt-3 text-base font-bold text-white">
                    2. Shut It Down
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-300">
                    End tidal stress so the seas drift and flood the lowlands, freeing power for escape.
                  </p>
                </div>
                <div className="mt-4 text-xs font-bold uppercase tracking-wider text-[#E86F51]">
                  Ending: The Exodus
                </div>
              </button>

              <button
                onClick={() => onChoose('signal')}
                className="chamfer-sm flex flex-col justify-between border border-[#D9B25F]/50 bg-[#1F1A0D]/80 p-4 text-left transition-colors hover:border-[#D9B25F] hover:bg-[#2B2412]"
              >
                <div>
                  <Radio className="w-6 h-6 text-[#D9B25F]" />
                  <h3 className="font-display mt-3 text-base font-bold text-white">
                    3. Rewire the Core
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-300">
                    Redirect Conduit energy to power a rescue beacon while holding the moon stable.
                  </p>
                </div>
                <div className="mt-4 text-xs font-bold uppercase tracking-wider text-[#D9B25F]">
                  Bonus Ending: The Signal
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
