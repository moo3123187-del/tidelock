// Procedural Web Audio API sound engine for TIDELOCK (Zero external files)

export class TidelockAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private planetOsc: OscillatorNode | null = null;
  private planetGain: GainNode | null = null;
  private ambientFilter: BiquadFilterNode | null = null;
  private muted = false;
  private initialized = false;

  public init(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.38;
      this.masterGain.connect(this.ctx.destination);

      this.ambientFilter = this.ctx.createBiquadFilter();
      this.ambientFilter.type = 'lowpass';
      this.ambientFilter.frequency.value = 1800;
      this.ambientFilter.connect(this.masterGain);

      // Sub-planet Tessara harmonic drone (fades toward Far Side)
      this.planetOsc = this.ctx.createOscillator();
      this.planetOsc.type = 'sine';
      this.planetOsc.frequency.value = 54;
      this.planetGain = this.ctx.createGain();
      this.planetGain.gain.value = 0.04;
      this.planetOsc.connect(this.planetGain);
      this.planetGain.connect(this.ambientFilter);
      this.planetOsc.start();

      this.initialized = true;
    } catch {
      // Ignore audio errors on restricted environments
    }
  }

  public setMuted(m: boolean): void {
    this.muted = m;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(m ? 0 : 0.38, this.ctx.currentTime, 0.08);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public updateAmbience(playerX: number, underwater: boolean, inEclipse: boolean): void {
    if (!this.ctx || !this.planetGain || !this.ambientFilter || !this.planetOsc) return;
    const now = this.ctx.currentTime;
    // Planet hum stronger on sub-planet +X side, fades on Far Side (X < -300)
    const subPlanetFactor = Math.max(0, Math.min(1, (playerX + 450) / 1400));
    const targetHum = (inEclipse ? 0.075 : 0.035) * subPlanetFactor + (underwater ? 0.04 : 0);
    this.planetGain.gain.setTargetAtTime(targetHum, now, 0.25);
    this.planetOsc.frequency.setTargetAtTime(underwater ? 44 : inEclipse ? 62 : 54, now, 0.3);
    this.ambientFilter.frequency.setTargetAtTime(underwater ? 320 : 2400, now, 0.2);
  }

  public playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume = 0.14,
    slideToFreq?: number
  ): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideToFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideToFreq), now + duration);
    }
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playScanTick(progress: number): void {
    this.playTone(460 + progress * 440, 0.08, 'triangle', 0.09);
  }

  public playUnlockChime(): void {
    this.playTone(523.25, 0.16, 'triangle', 0.16);
    setTimeout(() => this.playTone(659.25, 0.18, 'triangle', 0.16), 90);
    setTimeout(() => this.playTone(783.99, 0.3, 'sine', 0.18), 180);
  }

  public playCutterHit(): void {
    this.playTone(190, 0.12, 'sawtooth', 0.14, 95);
    this.playTone(980, 0.06, 'square', 0.06, 420);
  }

  public playBuildPlace(): void {
    this.playTone(160, 0.14, 'square', 0.12, 240);
    setTimeout(() => this.playTone(320, 0.12, 'triangle', 0.1), 50);
  }

  public playEclipseHorn(): void {
    this.playTone(92, 1.4, 'sawtooth', 0.18, 68);
    setTimeout(() => this.playTone(138, 1.2, 'triangle', 0.12, 92), 180);
  }

  public playCreatureGrowl(isLeviathan = false): void {
    if (isLeviathan) {
      this.playTone(58, 1.6, 'sawtooth', 0.22, 34);
    } else {
      this.playTone(115, 0.55, 'sawtooth', 0.15, 72);
    }
  }

  public playFlareIgnite(): void {
    this.playTone(680, 0.25, 'sawtooth', 0.1, 260);
  }

  public playFootstep(inWater: boolean): void {
    if (inWater) {
      this.playTone(170 + Math.random() * 40, 0.09, 'sine', 0.045, 95);
    } else {
      this.playTone(95 + Math.random() * 25, 0.045, 'triangle', 0.032, 55);
    }
  }

  public playDamageHit(): void {
    this.playTone(110, 0.22, 'sawtooth', 0.2, 48);
    this.playTone(260, 0.12, 'square', 0.09, 90);
  }

  public playDismantle(): void {
    this.playTone(280, 0.1, 'triangle', 0.12, 160);
    setTimeout(() => this.playTone(180, 0.12, 'sine', 0.1, 110), 60);
  }

  public dispose(): void {
    try {
      this.planetOsc?.stop();
      this.ctx?.close();
    } catch {
      // ignore
    }
  }
}
