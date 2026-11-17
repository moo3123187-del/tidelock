export type OrbitPhase = 'Day' | 'Dusk' | 'Eclipse' | 'Dawn';

export type RegionId =
  | 'NearSea'
  | 'Plains'
  | 'Belt'
  | 'Spine'
  | 'FarSide'
  | 'FarSea'
  | 'Cavern';

export type MachineState =
  | 'Idle'
  | 'NoInput'
  | 'Running'
  | 'Throttled'
  | 'OutputBlocked'
  | 'NoPower'
  | 'Fault';

export type ItemCategory = 'tool' | 'raw' | 'component' | 'consumable' | 'gear';

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  tier: number;
  stackMax: number;
  description: string;
  color: string;
  accent?: string;
}

export interface RecipeDef {
  id: string;
  name: string;
  machine: string; // 'hand' | 'fabricator' | 'furnace_t1' | 'arc_smelter_t2' | 'assembler_t1' | 'chem_vat_t2' | 'autofab_t3'
  inputs: Record<string, number>;
  outputs: Record<string, number>;
  time: number; // seconds
  tier: number;
  unlockBlueprint?: string;
}

export interface BuildableDef {
  id: string;
  name: string;
  category: 'machine' | 'power' | 'logistics' | 'module' | 'vehicle';
  tier: number;
  footprint: [number, number, number]; // W (X), D (Z), H (Y)
  cost: Record<string, number>;
  powerKw: number; // positive = consumes, negative = generates
  capacityKws?: number;
  hp: number;
  snapGrid: number; // 10 for modules, 2 for machines, 4 for conveyors
  requiresNode?: boolean;
  requiresWater?: boolean;
  description: string;
  unlockBlueprint?: string;
}

export interface InventorySlot {
  itemId: string;
  count: number;
}

export interface MachineInstance {
  uid: string;
  defId: string;
  x: number;
  y: number;
  z: number;
  rotY: number; // radians
  state: MachineState;
  hp: number;
  maxHp: number;
  recipeId: string | null;
  progress: number;
  inputBuffer: Record<string, number>;
  outputBuffer: Record<string, number>;
  nodeResource?: string;
  beltItems?: { itemId: string; pos: number }[];
  storedEnergy?: number;
}

export interface VehicleInstance {
  uid: string;
  defId: 'vehicle_dart_t1' | 'vehicle_mule_t2' | 'vehicle_needle_t2';
  x: number;
  y: number;
  z: number;
  rotY: number;
  vx: number;
  vy: number;
  vz: number;
  battery: number;
  maxBattery: number;
  hp: number;
  maxHp: number;
}

export interface ResourceNodeInstance {
  uid: string;
  resourceId: string;
  size: 'Small' | 'Medium' | 'Large' | 'Vein';
  x: number;
  y: number;
  z: number;
  remaining: number;
  maxYield: number;
  rotY: number;
  scale: number;
}

export interface ScannableWreck {
  uid: string;
  name: string;
  x: number;
  y: number;
  z: number;
  blueprintUnlock: string;
  scanned: boolean;
  scrapRemaining: number;
}

export interface CreatureInstance {
  uid: string;
  kind: 'plodder' | 'skitter' | 'ridge_stalker' | 'cave_lurker' | 'warden_leviathan';
  x: number;
  y: number;
  z: number;
  rotY: number;
  hp: number;
  maxHp: number;
  state: 'idle' | 'patrol' | 'circle' | 'telegraph' | 'lunge' | 'retreat' | 'flee';
  stateTimer: number;
  homeX: number;
  homeZ: number;
  patrolAngle: number;
  alerted: boolean;
}

export interface LandmarkDef {
  id: string;
  name: string;
  x: number;
  z: number;
  y?: number;
  region: RegionId;
  purpose: string;
  storyBeat?: string;
}

export interface PlayerStats {
  health: number;
  maxHealth: number;
  oxygen: number;
  maxOxygen: number;
  warmth: number;
  maxWarmth: number;
  hunger: number;
  maxHunger: number;
  thirst: number;
  maxThirst: number;
  stamina: number;
  maxStamina: number;
  suitTier: number;
  tankTier: number;
}

export interface ProductionSummary {
  supplyKw: number;
  demandKw: number;
  storedKws: number;
  capacityKws: number;
  satisfaction: number;
  eclipseEnduranceSec: number;
  machineCounts: Record<MachineState, number>;
  activeMachines: number;
}

export interface StoryState {
  act: number;
  questTitle: string;
  questStep: string;
  flags: Record<string, boolean>;
  ending: 'keeper' | 'exodus' | 'signal' | null;
}

export interface HudSnapshot {
  stats: PlayerStats;
  orbitSeconds: number;
  orbitPhase: OrbitPhase;
  phaseProgress: number;
  timeToEclipseSec: number;
  tideOffset: number;
  tideTrend: 'rising' | 'falling';
  region: RegionId;
  playerPos: { x: number; y: number; z: number; rotY: number };
  planetElevationDeg: number;
  planetBearingDeg: number;
  underwater: boolean;
  depthBelowSea: number;
  airStatus: 'breathable' | 'pressurized' | 'submerged' | 'toxic_haze';
  nearHeater: boolean;
  insideShelter: boolean;
  handlampOn: boolean;
  firstPerson: boolean;
  inVehicle: { defId: string; name: string; speed: number; batteryPct: number } | null;
  hotbar: (InventorySlot | null)[];
  selectedSlot: number;
  inventory: InventorySlot[];
  blueprints: string[];
  interactionPrompt: string | null;
  dismantlePrompt: string | null;
  targetInfo: { title: string; subtitle: string; tone: 'cyan' | 'amber' | 'danger' | 'emerald' } | null;
  damageFlash: number;
  scanProgress: number; // 0..1 when actively scanning
  scanTargetName: string | null;
  alertBanner: { text: string; tone: 'warning' | 'danger' | 'info' } | null;
  buildModeId: string | null;
  buildValid: boolean;
  production: ProductionSummary;
  story: StoryState;
  saveSlot: number;
  orbitSpeedMultiplier: number;
  mouseSensitivity: number;
  muted: boolean;
  discoveredLandmarks: string[];
  builtStructures: { uid: string; defId: string; x: number; z: number }[];
  vehiclesSummary: { uid: string; defId: string; x: number; z: number }[];
  pointerLocked: boolean;
}

export interface SaveSlotData {
  version: number;
  slot: number;
  savedAt: string;
  orbitSeconds: number;
  stats: PlayerStats;
  playerPos: { x: number; y: number; z: number; rotY: number };
  inventory: InventorySlot[];
  hotbar: (InventorySlot | null)[];
  blueprints: string[];
  machines: MachineInstance[];
  vehicles: VehicleInstance[];
  nodes: { uid: string; remaining: number }[];
  scannedWrecks: string[];
  storyFlags: Record<string, boolean>;
  ending: 'keeper' | 'exodus' | 'signal' | null;
  discoveredLandmarks: string[];
}
