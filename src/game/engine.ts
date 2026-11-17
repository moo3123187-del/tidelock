import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BUILDABLES,
  COLD_RATES,
  INITIAL_BLUEPRINTS,
  ITEMS,
  LANDMARKS,
  ORBIT_DURATION,
  ORBIT_PHASES,
  RECIPES,
  REGION_CONFIG,
  SEA_LEVEL_Y,
  SOLAR_OUTPUT,
  SUIT_SPECS,
  TANK_SPECS,
  TIDE_CYCLE,
  WORLD_SEMI_X,
  WORLD_SEMI_Z,
} from './config';
import { TidelockAudio } from './audio';
import {
  buildBuildableMesh,
  buildCreatureMesh,
  buildFirstPersonToolGroup,
  buildLandmarkMesh,
  buildPlayerAvatar,
  buildVehicleCockpit,
  buildVehicleMesh,
  CreatureRigRefs,
  updateMachineModelVisuals,
} from './models';
import { getGroundHeight, getPlanetElevationDeg, getRegionAt, getTerrainColor } from './terrain';
import { createProceduralTextures, ProceduralTextureSet } from './textures';
import {
  CreatureInstance,
  HudSnapshot,
  InventorySlot,
  MachineInstance,
  MachineState,
  OrbitPhase,
  PlayerStats,
  ProductionSummary,
  ResourceNodeInstance,
  SaveSlotData,
  ScannableWreck,
  VehicleInstance,
} from './types';

// Pre-allocated scratch math objects (Zero GC in hot loop)
const _v3 = new THREE.Vector3();
const _color = new THREE.Color();
const _skyZenith = new THREE.Color();
const _skyHorizon = new THREE.Color();
const _dummy = new THREE.Object3D();

const SAVE_KEY_PREFIX = 'tidelock_save_slot_v1_';
const MAX_PARTICLES = 180;
const MAX_BELT_ITEMS = 128;

interface ActiveFlare {
  mesh: THREE.Group;
  x: number;
  y: number;
  z: number;
  ttl: number;
}

interface ParticleItem {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  r: number;
  g: number;
  b: number;
}

export class TidelockEngine {
  private container: HTMLElement;
  private onHudUpdate: (hud: HudSnapshot) => void;
  private onOpenMachine: (uid: string) => void;
  private onOpenLantern: () => void;
  private onPauseToggle: () => void;
  private onToggleModal: (modal: 'inventory' | 'build' | 'production' | 'map') => void;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private textures!: ProceduralTextureSet;
  private audio = new TidelockAudio();
  private isSoftwareGl = false;

  private sunLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private planetLight!: THREE.DirectionalLight;
  private skyMat!: THREE.ShaderMaterial;
  private skyDome!: THREE.Mesh;
  private tessaraGroup!: THREE.Group;
  private sunMesh!: THREE.Mesh;
  private sunCorona!: THREE.Sprite;
  private nearWaterMesh!: THREE.Mesh;
  private farWaterMesh!: THREE.Mesh;
  private waterTimeUniform = { value: 0 };
  private handlampLight!: THREE.SpotLight;
  private handlampBeamMesh!: THREE.Mesh;
  private vehicleHeadlight!: THREE.SpotLight;
  private localWarmLight!: THREE.PointLight;
  private lanternCore: THREE.Object3D | null = null;
  private lanternRing: THREE.Object3D | null = null;
  private playerMesh!: THREE.Group;

  // First-person viewmodel & cockpit
  private fpAnchor = new THREE.Group();
  private fpToolGroup: THREE.Group | null = null;
  private fpActiveBeam: THREE.Object3D | null = null;
  private fpCockpitGroup: THREE.Group | null = null;
  private currentFpItemId: string | null = null;
  private currentFpVehicleDef: string | null = null;
  private fpSwingTimer = 0;
  private fpEquipDrop = 0;
  private walkBobPhase = 0;
  private lastFootstepCycle = 0;
  private camRoll = 0;
  private damageFlash = 0;
  private toolCooldown = 0;
  private mouseSensitivity = 1.0;

  // Power cable visuals
  private powerCableGroup = new THREE.Group();
  private powerCableMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.45,
  });

  // Particle pool
  private particles: ParticleItem[] = [];
  private particleGeo!: THREE.BufferGeometry;
  private particlePositions!: Float32Array;
  private particleColors!: Float32Array;

  private frameId = 0;
  private lastTime = performance.now();
  private elapsed = 0;
  private hudEmitAccum = 0;
  private simAccum1Hz = 0;
  private beltAccum10Hz = 0;
  private particleEmitAccum = 0;
  private autosaveAccum = 0;
  private disposed = false;

  // Input state
  private keys: Record<string, boolean> = {};
  private mouseDown = false;
  private draggingLook = false;
  private pointerLocked = false;
  private yaw = -Math.PI * 0.44;
  private pitch = 0.06;
  private readonly firstPerson = true; // Pure First-Person everywhere!
  private handlampOn = true;
  private paused = true;

  // World state
  private saveSlot = 1;
  private orbitSeconds = 60;
  private orbitSpeedMultiplier = 8;
  private prevOrbitPhase: OrbitPhase = 'Day';

  private stats: PlayerStats = {
    health: 100,
    maxHealth: 100,
    oxygen: 45,
    maxOxygen: 45,
    warmth: 100,
    maxWarmth: 100,
    hunger: 100,
    maxHunger: 100,
    thirst: 100,
    maxThirst: 100,
    stamina: 100,
    maxStamina: 100,
    suitTier: 0,
    tankTier: 0,
  };

  private playerPos = new THREE.Vector3(642, 18, -76);
  private playerVel = new THREE.Vector3();
  private grounded = true;

  private hotbar: (InventorySlot | null)[] = [
    { itemId: 'scanner', count: 1 },
    { itemId: 'handlamp', count: 1 },
    { itemId: 'flare', count: 2 },
    { itemId: 'knife', count: 1 },
    { itemId: 'water_flask', count: 2 },
    { itemId: 'ration', count: 2 },
    null,
    null,
  ];
  private selectedSlot = 0;
  private inventory: InventorySlot[] = [
    { itemId: 'scrap_plate', count: 6 },
    { itemId: 'fibre', count: 4 },
  ];
  private blueprints = new Set<string>(INITIAL_BLUEPRINTS);
  private storyFlags: Record<string, boolean> = {};
  private discoveredLandmarks = new Set<string>(['cradle']);
  private ending: 'keeper' | 'exodus' | 'signal' | null = null;

  // Dynamic entities
  private machines = new Map<string, MachineInstance>();
  private machineMeshes = new Map<string, THREE.Group>();
  private beltInstancedMesh!: THREE.InstancedMesh;

  private vehicles = new Map<string, VehicleInstance>();
  private vehicleMeshes = new Map<string, THREE.Group>();
  private activeVehicleUid: string | null = null;

  private nodes = new Map<string, ResourceNodeInstance>();
  private nodeMeshes = new Map<string, THREE.Object3D>();
  private wrecks: ScannableWreck[] = [];
  private wreckMeshes = new Map<string, THREE.Group>();
  private creatures: CreatureInstance[] = [];
  private creatureMeshes = new Map<string, THREE.Group>();
  private flares: ActiveFlare[] = [];

  // Build Ghost
  private buildModeId: string | null = null;
  private buildRotY = 0;
  private buildGhost: THREE.Group | null = null;
  private buildGhostMats: THREE.MeshBasicMaterial[] = [];
  private buildValid = false;
  private prevBuildValid = false;
  private buildSnapPos = new THREE.Vector3();

  // Scanning & interaction
  private scanProgress = 0;
  private scanTargetName: string | null = null;
  private activeAlert: { text: string; tone: 'warning' | 'danger' | 'info'; ttl: number } | null = null;
  private lastProdSummary: ProductionSummary = {
    supplyKw: 0,
    demandKw: 0,
    storedKws: 0,
    capacityKws: 0,
    satisfaction: 1,
    eclipseEnduranceSec: 0,
    machineCounts: {
      Idle: 0,
      NoInput: 0,
      Running: 0,
      Throttled: 0,
      OutputBlocked: 0,
      NoPower: 0,
      Fault: 0,
    },
    activeMachines: 0,
  };

  constructor(
    container: HTMLElement,
    callbacks: {
      onHudUpdate: (hud: HudSnapshot) => void;
      onOpenMachine: (uid: string) => void;
      onOpenLantern: () => void;
      onPauseToggle: () => void;
      onToggleModal: (modal: 'inventory' | 'build' | 'production' | 'map') => void;
    }
  ) {
    this.container = container;
    this.onHudUpdate = callbacks.onHudUpdate;
    this.onOpenMachine = callbacks.onOpenMachine;
    this.onOpenLantern = callbacks.onOpenLantern;
    this.onPauseToggle = callbacks.onPauseToggle;
    this.onToggleModal = callbacks.onToggleModal;

    try {
      const savedSens = localStorage.getItem('tidelock_mouse_sens');
      if (savedSens) this.mouseSensitivity = THREE.MathUtils.clamp(parseFloat(savedSens) || 1, 0.4, 2.5);
    } catch {
      // ignore
    }

    this.initRenderer();
    this.initScene();
    this.initParticleSystem();
    this.buildWorldTerrain();
    this.populateWorldEntities();
    this.syncFirstPersonViewmodel();
    this.updatePlayerAndVehicle(0);
    this.updateSkyAndLighting();
    this.bindEvents();
    this.emitHud(true);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.lastTime = performance.now();
    this.tick();
  }

  private initRenderer(): void {
    this.isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.3));
    this.renderer.setSize(
      this.container.clientWidth || window.innerWidth,
      this.container.clientHeight || window.innerHeight
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    this.textures = createProceduralTextures(this.renderer);
  }

  private initScene(): void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c111d);
    this.scene.fog = new THREE.FogExp2(0x8a8174, 0.0011);

    const aspect = (this.container.clientWidth || window.innerWidth) / (this.container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(72, aspect, 0.15, 5200);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // First-person held tool & vehicle cockpit anchor attached to camera
    this.fpAnchor.position.set(0, 0, 0);
    this.camera.add(this.fpAnchor);

    // Mandatory Studio Environment Reflections
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Procedural Atmospheric Gradient + Cloud Wisps Sky Dome
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uZenith: { value: new THREE.Color(0x0b1226) },
        uHorizon: { value: new THREE.Color(0x8a7d6d) },
        uSunDir: { value: new THREE.Vector3(0.5, 0.5, 0.2) },
        uSunGlow: { value: new THREE.Color(0xffd9a0) },
        uSunStrength: { value: 0.65 },
      },
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uSunDir;
        uniform vec3 uSunGlow;
        uniform float uSunStrength;
        varying vec3 vWorldDir;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        float fbmCloud(vec2 p) {
          float v = 0.0;
          float a = 0.52;
          for (int i = 0; i < 3; i++) {
            v += a * vnoise(p);
            p = p * 2.1 + vec2(1.7, 9.2);
            a *= 0.48;
          }
          return v;
        }

        void main() {
          vec3 d = normalize(vWorldDir);
          float h = clamp(d.y * 1.15, 0.0, 1.0);
          vec3 col = mix(uHorizon, uZenith, pow(h, 0.52));

          // Soft atmospheric cirrus wisps above horizon
          if (d.y > 0.02) {
            vec2 cuv = d.xz / (d.y + 0.24) * 1.4 + vec2(uTime * 0.008, uTime * 0.003);
            float cl = fbmCloud(cuv);
            float mask = smoothstep(0.47, 0.77, cl) * smoothstep(0.02, 0.22, d.y) * smoothstep(0.95, 0.35, d.y);
            vec3 cloudCol = mix(uHorizon * 1.25, uSunGlow, 0.32 * uSunStrength);
            col = mix(col, cloudCol, mask * 0.38);
          }

          float sunAmt = max(dot(d, normalize(uSunDir)), 0.0);
          col += uSunGlow * pow(sunAmt, 12.0) * 0.42 * uSunStrength;
          col += uSunGlow * pow(sunAmt, 110.0) * 0.9 * uSunStrength;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(3600, 24, 16), this.skyMat);
    this.scene.add(this.skyDome);

    // Lighting Rig
    this.hemiLight = new THREE.HemisphereLight(0x9fb8e8, 0x4b3d32, 0.9);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xffd9a0, 2.0);
    this.sunLight.position.set(400, 700, 300);
    if (!this.isSoftwareGl) {
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.set(1024, 1024);
      this.sunLight.shadow.camera.near = 10;
      this.sunLight.shadow.camera.far = 1400;
      const d = 180;
      this.sunLight.shadow.camera.left = -d;
      this.sunLight.shadow.camera.right = d;
      this.sunLight.shadow.camera.top = d;
      this.sunLight.shadow.camera.bottom = -d;
      this.sunLight.shadow.bias = -0.0005;
      this.sunLight.shadow.normalBias = 0.02;
    }
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.planetLight = new THREE.DirectionalLight(0x6b8cff, 0.55);
    this.planetLight.position.set(1200, 600, 0);
    this.scene.add(this.planetLight);

    // Giant Tidally Locked Planet Tessara with Atmospheric Halo & Banded Planetary Rings
    this.tessaraGroup = new THREE.Group();
    const tessSphere = new THREE.Mesh(
      new THREE.SphereGeometry(540, 32, 22),
      new THREE.MeshStandardMaterial({
        map: this.textures.tessaraSurface,
        emissive: 0x223878,
        emissiveIntensity: 0.58,
        roughness: 0.72,
        metalness: 0.04,
        fog: false,
      })
    );
    const tessHalo = new THREE.Mesh(
      new THREE.SphereGeometry(576, 26, 18),
      new THREE.MeshBasicMaterial({
        color: 0x7aa2ff,
        transparent: true,
        opacity: 0.16,
        side: THREE.BackSide,
        fog: false,
      })
    );
    const ringGeo = new THREE.RingGeometry(640, 960, 64, 1);
    // Remap ring UVs so U spans radially 0..1 from inner to outer radius
    const rPos = ringGeo.attributes.position;
    const rUv = ringGeo.attributes.uv;
    for (let i = 0; i < rPos.count; i++) {
      const rx = rPos.getX(i);
      const ry = rPos.getY(i);
      const dist = Math.hypot(rx, ry);
      const u = THREE.MathUtils.clamp((dist - 640) / (960 - 640), 0, 1);
      rUv.setXY(i, u, 0.5);
    }
    const ringBand = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        map: this.textures.tessaraRings,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        fog: false,
      })
    );
    ringBand.rotation.x = Math.PI * 0.42;
    ringBand.rotation.y = 0.22;
    this.tessaraGroup.add(tessSphere, tessHalo, ringBand);
    this.scene.add(this.tessaraGroup);

    // Sun disc + glowing sprite corona
    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(62, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff0d4, fog: false })
    );
    this.sunCorona = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.textures.particleSoft,
        color: 0xffd9a0,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        fog: false,
      })
    );
    this.sunCorona.scale.set(420, 420, 1);
    this.sunMesh.add(this.sunCorona);
    this.scene.add(this.sunMesh);

    // Starfield
    const starCount = 720;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 0.94 + 0.03);
      const r = 3200;
      starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      starPos[i * 3 + 1] = r * Math.cos(ph);
      starPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xe2ecff, size: 6.0, fog: false, sizeAttenuation: true })
    );
    this.scene.add(stars);

    this.playerMesh = buildPlayerAvatar();
    this.playerMesh.visible = false;
    this.scene.add(this.playerMesh);

    // First-person Handlamp, Volumetric Beam Cone & Vehicle Headlights
    this.handlampLight = new THREE.SpotLight(0xfff3d6, 82, 108, THREE.MathUtils.degToRad(34), 0.5, 1.3);
    this.scene.add(this.handlampLight);
    this.scene.add(this.handlampLight.target);

    const beamGeo = new THREE.ConeGeometry(3.2, 18, 16, 1, true);
    beamGeo.rotateX(Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffe4b5,
      transparent: true,
      opacity: 0.042,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.handlampBeamMesh = new THREE.Mesh(beamGeo, beamMat);
    this.handlampBeamMesh.position.set(0.24, -0.18, -9.6);
    this.camera.add(this.handlampBeamMesh);

    this.vehicleHeadlight = new THREE.SpotLight(0xfff3d6, 110, 145, THREE.MathUtils.degToRad(40), 0.45, 1.2);
    this.vehicleHeadlight.visible = false;
    this.scene.add(this.vehicleHeadlight);
    this.scene.add(this.vehicleHeadlight.target);

    // Pooled warm dynamic point light (avoids shader recompiles when placing flares/heaters)
    this.localWarmLight = new THREE.PointLight(0xff8c42, 0, 52, 1.5);
    this.scene.add(this.localWarmLight);

    // Single InstancedMesh for all conveyor belt items (zero GC allocations)
    const beltItemGeo = new THREE.DodecahedronGeometry(0.45, 0);
    const beltItemMat = new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.35 });
    this.beltInstancedMesh = new THREE.InstancedMesh(beltItemGeo, beltItemMat, MAX_BELT_ITEMS);
    this.beltInstancedMesh.count = 0;
    this.beltInstancedMesh.frustumCulled = false;
    this.scene.add(this.beltInstancedMesh);
    this.scene.add(this.powerCableGroup);
  }

  private initParticleSystem(): void {
    this.particleGeo = new THREE.BufferGeometry();
    this.particlePositions = new Float32Array(MAX_PARTICLES * 3);
    this.particleColors = new Float32Array(MAX_PARTICLES * 3);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -9999,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        r: 1,
        g: 1,
        b: 1,
      });
      this.particlePositions[i * 3 + 1] = -9999;
    }
    this.particleGeo.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    this.particleGeo.setAttribute('color', new THREE.BufferAttribute(this.particleColors, 3));
    const mat = new THREE.PointsMaterial({
      size: 1.4,
      map: this.textures.particleSoft,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const pts = new THREE.Points(this.particleGeo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
  }

  private spawnParticle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    maxLife: number,
    r: number,
    g: number,
    b: number
  ): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.x = x;
        p.y = y;
        p.z = z;
        p.vx = vx;
        p.vy = vy;
        p.vz = vz;
        p.life = 0;
        p.maxLife = maxLife;
        p.r = r;
        p.g = g;
        p.b = b;
        return;
      }
    }
  }

  private updateParticles(dt: number): void {
    // Ambient smoke from running Furnaces, Drills, Flares & atmospheric motes
    this.particleEmitAccum += dt;
    if (this.particleEmitAccum >= 0.1) {
      this.particleEmitAccum = 0;
      for (const m of this.machines.values()) {
        if ((m.state === 'Running' || m.state === 'Throttled') && Math.hypot(m.x - this.playerPos.x, m.z - this.playerPos.z) < 160) {
          if (m.defId === 'furnace_t1') {
            this.spawnParticle(
              m.x + 1.2 + (Math.random() - 0.5) * 0.4,
              m.y + 8.1,
              m.z + 1.2 + (Math.random() - 0.5) * 0.4,
              (Math.random() - 0.5) * 1.1,
              3.2 + Math.random() * 1.4,
              (Math.random() - 0.5) * 1.1,
              2.2,
              0.46,
              0.49,
              0.52
            );
          } else if (m.defId === 'drill_t1') {
            this.spawnParticle(
              m.x + (Math.random() - 0.5) * 1.6,
              m.y + 0.5,
              m.z + (Math.random() - 0.5) * 1.6,
              (Math.random() - 0.5) * 3,
              2.2 + Math.random() * 1.5,
              (Math.random() - 0.5) * 3,
              0.9,
              0.68,
              0.55,
              0.42
            );
          }
        }
      }
      for (const f of this.flares) {
        this.spawnParticle(
          f.x + (Math.random() - 0.5) * 0.4,
          f.y + 0.4,
          f.z + (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 1.5,
          2.6 + Math.random() * 1.8,
          (Math.random() - 0.5) * 1.5,
          1.1,
          1.0,
          0.42,
          0.2
        );
      }
      // Underwater / Cavern / Plains wind motes near player
      if (this.playerPos.y < -8) {
        this.spawnParticle(
          this.playerPos.x + (Math.random() - 0.5) * 40,
          this.playerPos.y + (Math.random() - 0.5) * 20,
          this.playerPos.z + (Math.random() - 0.5) * 40,
          (Math.random() - 0.5) * 0.6,
          1.2,
          (Math.random() - 0.5) * 0.6,
          3.0,
          0.3,
          0.85,
          0.92
        );
      } else {
        const reg = getRegionAt(this.playerPos.x, this.playerPos.z, this.playerPos.y);
        const isFar = reg === 'FarSide';
        this.spawnParticle(
          this.playerPos.x + (Math.random() - 0.5) * 55,
          this.playerPos.y + 1 + Math.random() * 11,
          this.playerPos.z + (Math.random() - 0.5) * 55,
          isFar ? (Math.random() - 0.5) * 0.8 : -2.6,
          0.35 + Math.random() * 0.4,
          (Math.random() - 0.5) * 1.0,
          2.6,
          isFar ? 0.65 : 0.92,
          isFar ? 0.45 : 0.82,
          isFar ? 0.98 : 0.64
        );
      }
    }

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        this.particlePositions[i * 3 + 1] = -9999;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const fade = 1 - p.life / p.maxLife;
      this.particlePositions[i * 3] = p.x;
      this.particlePositions[i * 3 + 1] = p.y;
      this.particlePositions[i * 3 + 2] = p.z;
      this.particleColors[i * 3] = p.r * fade;
      this.particleColors[i * 3 + 1] = p.g * fade;
      this.particleColors[i * 3 + 2] = p.b * fade;
    }
    this.particleGeo.attributes.position.needsUpdate = true;
    this.particleGeo.attributes.color.needsUpdate = true;
  }

  private buildWorldTerrain(): void {
    const segX = 176;
    const segZ = 104;
    const width = WORLD_SEMI_X * 2.1;
    const depth = WORLD_SEMI_Z * 2.1;

    const geo = new THREE.PlaneGeometry(width, depth, segX, segZ);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = getGroundHeight(x, z);
      pos.setY(i, y);

      // Precomputed slope, dune ripple & elevation strata shading (0ms runtime cost)
      const hx = getGroundHeight(x + 4, z);
      const hz = getGroundHeight(x, z + 4);
      const slope = Math.hypot(hx - y, hz - y) / 4;
      const [r, g, b] = getTerrainColor(x, y, z);
      const strata = Math.sin(y * 0.42 + x * 0.018) * 0.035;
      const duneRipple = Math.sin(x * 0.14 + z * 0.08) * 0.022;
      const cliffMix = Math.min(1, Math.max(0, (slope - 0.26) * 1.45));
      const ridgeBoost = y > 90 ? Math.min(0.14, (y - 90) * 0.0014) : 0;
      colors[i * 3] = THREE.MathUtils.clamp(THREE.MathUtils.lerp(r + strata + duneRipple, 0.2, cliffMix) + ridgeBoost, 0.02, 1);
      colors[i * 3 + 1] = THREE.MathUtils.clamp(THREE.MathUtils.lerp(g + strata * 0.85 + duneRipple * 0.9, 0.19, cliffMix) + ridgeBoost, 0.02, 1);
      colors[i * 3 + 2] = THREE.MathUtils.clamp(THREE.MathUtils.lerp(b + strata * 0.7 + duneRipple * 0.7, 0.23, cliffMix) + ridgeBoost, 0.02, 1);
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: this.textures.terrainDetail,
      normalMap: this.textures.terrainNormal,
      normalScale: new THREE.Vector2(1.08, 1.08),
      roughness: 0.84,
      metalness: 0.06,
    });
    const terrainMesh = new THREE.Mesh(geo, terrainMat);
    terrainMesh.receiveShadow = true;
    this.scene.add(terrainMesh);

    // Animated PBR Ocean Water using fast MeshStandardMaterial + vertex waves
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0f6a80,
      roughness: 0.14,
      metalness: 0.26,
      envMapIntensity: 1.25,
      transparent: true,
      opacity: 0.84,
      side: THREE.DoubleSide,
    });
    waterMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.waterTimeUniform;
      shader.vertexShader =
        `uniform float uTime;\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `
          #include <begin_vertex>
          float wave1 = sin(position.x * 0.06 + uTime * 1.8) * cos(position.y * 0.05 + uTime * 1.3);
          float wave2 = sin((position.x + position.y) * 0.12 - uTime * 2.4) * 0.45;
          transformed.z += (wave1 + wave2) * 0.65;
          `
        );
    };

    this.nearWaterMesh = new THREE.Mesh(new THREE.PlaneGeometry(760, 1950, 28, 28), waterMat);
    this.nearWaterMesh.rotation.x = -Math.PI / 2;
    this.nearWaterMesh.position.set(1230, SEA_LEVEL_Y, 0);
    this.scene.add(this.nearWaterMesh);

    this.farWaterMesh = new THREE.Mesh(new THREE.PlaneGeometry(660, 1950, 18, 18), waterMat);
    this.farWaterMesh.rotation.x = -Math.PI / 2;
    this.farWaterMesh.position.set(-1260, SEA_LEVEL_Y, 0);
    this.scene.add(this.farWaterMesh);

    // Skylight Cavern rim boulders & warm amber light shaft
    const cavRing = new THREE.Mesh(
      new THREE.TorusGeometry(62, 11, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0x5c4a3b, roughness: 0.92 })
    );
    cavRing.rotation.x = Math.PI / 2;
    cavRing.position.set(500, 10, -240);
    this.scene.add(cavRing);

    const cavShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(24, 48, 72, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xd8a24a,
        transparent: true,
        opacity: 0.09,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    cavShaft.position.set(500, -12, -240);
    this.scene.add(cavShaft);

    const cavLight = new THREE.PointLight(0xd8a24a, 22, 160, 1.4);
    cavLight.position.set(500, -8, -240);
    this.scene.add(cavLight);

    // Major Landmarks (and cache Lantern animated refs)
    for (const lm of LANDMARKS) {
      if (lm.id === 'cradle' || lm.id === 'relay_alpha' || lm.id === 'terminus_gate' || lm.id === 'the_lantern') {
        const mesh = buildLandmarkMesh(lm.id, this.textures);
        const gy = getGroundHeight(lm.x, lm.z);
        mesh.position.set(lm.x, gy, lm.z);
        this.scene.add(mesh);
        if (lm.id === 'the_lantern') {
          this.lanternCore = mesh.getObjectByName('LanternCore') ?? null;
          this.lanternRing = mesh.getObjectByName('LanternRing') ?? null;
        }
      }
    }

    this.buildInstancedFoliageAndRocks();
  }

  private buildInstancedFoliageAndRocks(): void {
    // 1. Multi-blade Tuftgrass on Plains
    const grassCount = 340;
    const grassGeo = new THREE.ConeGeometry(1.15, 3.2, 5);
    grassGeo.translate(0, 1.6, 0);
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x769960, roughness: 0.85 });
    const grassMesh = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
    let idx = 0;
    for (let i = 0; i < grassCount; i++) {
      const x = 400 + Math.sin(i * 12.7) * 240 + (i % 7) * 28;
      const z = -420 + ((i * 73) % 840);
      const y = getGroundHeight(x, z);
      if (y < 2) continue;
      _dummy.position.set(x, y, z);
      _dummy.rotation.set((i % 3) * 0.08, (i * 1.1) % Math.PI, 0);
      const s = 0.8 + (i % 5) * 0.14;
      _dummy.scale.set(s, s, s);
      _dummy.updateMatrix();
      grassMesh.setMatrixAt(idx, _dummy.matrix);
      _color.setHSL(0.26 + (i % 4) * 0.015, 0.34, 0.42 + (i % 3) * 0.05);
      grassMesh.setColorAt(idx, _color);
      idx++;
    }
    grassMesh.count = idx;
    grassMesh.computeBoundingSphere();
    this.scene.add(grassMesh);

    // 2. Sculpted Rock spires & boulders across regions
    const rockCount = 220;
    const rockGeo = new THREE.DodecahedronGeometry(3.4, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x8a7f76,
      normalMap: this.textures.terrainNormal,
      roughness: 0.9,
      metalness: 0.08,
    });
    const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    let rIdx = 0;
    for (let i = 0; i < rockCount; i++) {
      const x = -920 + ((i * 193) % 2180);
      const z = -640 + ((i * 317) % 1280);
      const y = getGroundHeight(x, z);
      _dummy.position.set(x, y + 0.4, z);
      _dummy.rotation.set(i * 0.5, i * 1.3, 0);
      const s = 0.85 + (i % 6) * 0.48;
      _dummy.scale.set(s * 1.35, s * 1.05, s * 1.1);
      _dummy.updateMatrix();
      rockMesh.setMatrixAt(rIdx, _dummy.matrix);
      const reg = getRegionAt(x, z, y);
      _color.set(REGION_CONFIG[reg].groundColor).multiplyScalar(0.68);
      rockMesh.setColorAt(rIdx, _color);
      rIdx++;
    }
    rockMesh.count = rIdx;
    rockMesh.computeBoundingSphere();
    this.scene.add(rockMesh);

    // 3. Multi-Tier Weepwood Trees with Trunks + Dual Foliage Canopies + Glowing Amber Resin Pods
    const treeCount = 56;
    const trunkGeo = new THREE.CylinderGeometry(0.55, 1.2, 12.5, 7);
    trunkGeo.translate(0, 6.25, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x564132, roughness: 0.92 });
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);

    const canopyGeo = new THREE.DodecahedronGeometry(4.4, 1);
    canopyGeo.scale(1.25, 0.52, 1.25);
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x557548, roughness: 0.86 });
    const canopyMesh = new THREE.InstancedMesh(canopyGeo, canopyMat, treeCount);
    const canopyTopMesh = new THREE.InstancedMesh(canopyGeo, canopyMat, treeCount);

    const podGeo = new THREE.SphereGeometry(0.62, 8, 8);
    const podMat = new THREE.MeshStandardMaterial({
      color: 0xf28c38,
      emissive: 0xf28c38,
      emissiveIntensity: 1.65,
      roughness: 0.3,
    });
    const podMesh = new THREE.InstancedMesh(podGeo, podMat, treeCount);

    for (let i = 0; i < treeCount; i++) {
      const x = 350 + ((i * 53) % 290);
      const z = -390 + ((i * 97) % 780);
      const y = getGroundHeight(x, z);
      const s = 0.85 + (i % 4) * 0.16;

      _dummy.position.set(x, y, z);
      _dummy.rotation.set(0, i, 0);
      _dummy.scale.setScalar(s);
      _dummy.updateMatrix();
      trunkMesh.setMatrixAt(i, _dummy.matrix);

      _dummy.position.set(x, y + 11.4 * s, z);
      _dummy.updateMatrix();
      canopyMesh.setMatrixAt(i, _dummy.matrix);

      _dummy.position.set(x + Math.sin(i) * 0.6, y + 13.6 * s, z + Math.cos(i) * 0.6);
      _dummy.scale.setScalar(s * 0.7);
      _dummy.updateMatrix();
      canopyTopMesh.setMatrixAt(i, _dummy.matrix);

      _dummy.position.set(x + Math.sin(i) * 1.3, y + 8.6 * s, z + Math.cos(i) * 1.3);
      _dummy.scale.setScalar(s);
      _dummy.updateMatrix();
      podMesh.setMatrixAt(i, _dummy.matrix);
    }
    trunkMesh.computeBoundingSphere();
    canopyMesh.computeBoundingSphere();
    canopyTopMesh.computeBoundingSphere();
    podMesh.computeBoundingSphere();
    this.scene.add(trunkMesh, canopyMesh, canopyTopMesh, podMesh);

    // 4. Bioluminescent Subsea Coral Polyps in Near Sea & Trench Approach
    const coralCount = 64;
    const coralGeo = new THREE.ConeGeometry(1.4, 4.8, 6);
    coralGeo.translate(0, 2.4, 0);
    const coralMat = new THREE.MeshStandardMaterial({
      color: 0x3fc1d1,
      emissive: 0x16687a,
      emissiveIntensity: 1.25,
      roughness: 0.4,
    });
    const coralMesh = new THREE.InstancedMesh(coralGeo, coralMat, coralCount);
    let cIdx = 0;
    for (let i = 0; i < coralCount; i++) {
      const x = 940 + ((i * 47) % 440);
      const z = -460 + ((i * 113) % 920);
      const y = getGroundHeight(x, z);
      if (y > -6) continue;
      _dummy.position.set(x, y, z);
      _dummy.rotation.set((i % 3) * 0.14, i * 0.9, 0);
      _dummy.scale.setScalar(0.8 + (i % 4) * 0.35);
      _dummy.updateMatrix();
      coralMesh.setMatrixAt(cIdx, _dummy.matrix);
      _color.setHex(i % 3 === 0 ? 0x3fc1d1 : i % 3 === 1 ? 0xd9b25f : 0xc256c8);
      coralMesh.setColorAt(cIdx, _color);
      cIdx++;
    }
    coralMesh.count = cIdx;
    coralMesh.computeBoundingSphere();
    this.scene.add(coralMesh);
  }

  private populateWorldEntities(): void {
    this.machines.clear();
    this.machineMeshes.forEach((m) => this.scene.remove(m));
    this.machineMeshes.clear();

    this.vehicles.clear();
    this.vehicleMeshes.forEach((m) => this.scene.remove(m));
    this.vehicleMeshes.clear();

    this.nodes.clear();
    this.nodeMeshes.forEach((m) => this.scene.remove(m));
    this.nodeMeshes.clear();

    this.wreckMeshes.forEach((m) => this.scene.remove(m));
    this.wreckMeshes.clear();
    this.wrecks = [];

    this.creatureMeshes.forEach((m) => this.scene.remove(m));
    this.creatureMeshes.clear();
    this.creatures = [];

    const wreckDefs: { name: string; x: number; z: number; bp: string }[] = [
      { name: 'Meridian Cutter Crate', x: 678, z: -62, bp: 'cutter' },
      { name: 'Meridian Supply Pod', x: 702, z: -98, bp: 'fabricator_t0' },
      { name: 'Meridian Bulkhead Section', x: 745, z: -20, bp: 'insulated_suit' },
      { name: 'Meridian Hover Sled Frame', x: 785, z: 58, bp: 'vehicle_dart_t1' },
      { name: 'Meridian Rover Chassis', x: 310, z: 45, bp: 'vehicle_mule_t2' },
      { name: 'Near Sea Submersible Pod', x: 935, z: 55, bp: 'vehicle_needle_t2' },
      { name: 'Terminus Gate Monolith', x: 70, z: -190, bp: 'pressure_suit' },
    ];
    wreckDefs.forEach((wd, i) => {
      const y = getGroundHeight(wd.x, wd.z);
      const uid = `wreck_${i}`;
      const w: ScannableWreck = {
        uid,
        name: wd.name,
        x: wd.x,
        y,
        z: wd.z,
        blueprintUnlock: wd.bp,
        scanned: this.blueprints.has(wd.bp),
        scrapRemaining: 4,
      };
      this.wrecks.push(w);

      const g = new THREE.Group();
      const shell = new THREE.Mesh(
        new THREE.CylinderGeometry(2.6, 2.8, 5.4, 16, 1, true, -Math.PI * 0.42, Math.PI * 0.84),
        new THREE.MeshStandardMaterial({
          color: 0xa4acb5,
          map: this.textures.panelMetal,
          roughness: 0.36,
          metalness: 0.74,
          side: THREE.DoubleSide,
        })
      );
      shell.rotation.z = Math.PI / 2;
      shell.rotation.x = 0.25;
      shell.position.y = 0.9;

      const canister = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.85, 2.6, 8, 12),
        new THREE.MeshStandardMaterial({ map: this.textures.hazard, roughness: 0.52, metalness: 0.35 })
      );
      canister.rotation.z = Math.PI / 2;
      canister.position.set(0.3, 0.85, 0.8);

      const ribCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-2.5, 0.2, -1.6),
        new THREE.Vector3(-1.8, 2.7, -1.2),
        new THREE.Vector3(1.6, 2.9, -1.0),
        new THREE.Vector3(2.4, 0.2, -1.5),
      ]);
      const rib = new THREE.Mesh(
        new THREE.TubeGeometry(ribCurve, 14, 0.2, 8, false),
        new THREE.MeshStandardMaterial({ color: 0x333942, roughness: 0.38, metalness: 0.82 })
      );
      const strip = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.18, 2.4, 6, 10),
        new THREE.MeshStandardMaterial({
          color: w.scanned ? 0x3ddc84 : 0x4dd0e1,
          emissive: w.scanned ? 0x3ddc84 : 0x4dd0e1,
          emissiveIntensity: 1.85,
        })
      );
      strip.name = 'ScanGlow';
      strip.rotation.z = Math.PI / 2;
      strip.position.set(0, 2.85, -0.4);
      g.add(shell, canister, rib, strip);
      g.position.set(wd.x, y, wd.z);
      this.scene.add(g);
      this.wreckMeshes.set(uid, g);
    });

    const addNode = (
      uid: string,
      resourceId: string,
      x: number,
      z: number,
      size: 'Small' | 'Medium' | 'Large' = 'Small'
    ) => {
      const y = getGroundHeight(x, z);
      const maxYield = size === 'Large' ? 6000 : size === 'Medium' ? 1500 : 400;
      const node: ResourceNodeInstance = {
        uid,
        resourceId,
        size,
        x,
        y,
        z,
        remaining: maxYield,
        maxYield,
        rotY: (x * 0.13 + z * 0.07) % (Math.PI * 2),
        scale: size === 'Large' ? 2.2 : size === 'Medium' ? 1.4 : 1.0,
      };
      this.nodes.set(uid, node);

      const itemCol = ITEMS[resourceId]?.color ?? '#9AA0A6';
      const g = new THREE.Group();
      const isCrystal = resourceId === 'prismite' || resourceId === 'lantern_ore' || resourceId === 'lithe';
      const isFlora = resourceId === 'fibre' || resourceId === 'resin';
      const mat = new THREE.MeshStandardMaterial({
        color: itemCol,
        roughness: isCrystal ? 0.12 : isFlora ? 0.55 : 0.72,
        metalness: resourceId === 'ferrite' || resourceId === 'cuprite' || resourceId === 'titanite' ? 0.58 : 0.12,
        emissive: isCrystal ? itemCol : resourceId === 'resin' ? '#c2651a' : '#000000',
        emissiveIntensity: resourceId === 'lantern_ore' ? 1.35 : isCrystal ? 0.72 : resourceId === 'resin' ? 0.35 : 0,
      });

      if (isCrystal) {
        const shardGeo = new THREE.CylinderGeometry(0.12, 0.75, 3.6, 6);
        const offsets: [number, number, number, number, number, number][] = [
          [0, 1.7, 0, 0.12, 0, 1.05],
          [0.95, 1.2, 0.55, 0.38, -0.32, 0.76],
          [-0.85, 1.05, -0.45, -0.35, 0.28, 0.68],
          [0.35, 0.9, -0.85, -0.25, -0.24, 0.6],
        ];
        for (const [ox, oy, oz, rx, rz, sc] of offsets) {
          const s = new THREE.Mesh(shardGeo, mat);
          s.position.set(ox, oy, oz);
          s.rotation.set(rx, 0, rz);
          s.scale.setScalar(sc);
          g.add(s);
        }
      } else if (isFlora) {
        const geo = resourceId === 'resin' ? new THREE.SphereGeometry(0.9, 10, 8) : new THREE.ConeGeometry(0.85, 2.8, 6);
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2;
          const m = new THREE.Mesh(geo, mat);
          m.position.set(Math.cos(a) * 0.65, resourceId === 'resin' ? 0.85 + (i % 2) * 0.35 : 1.25, Math.sin(a) * 0.65);
          m.rotation.set(Math.sin(a) * 0.25, a, Math.cos(a) * 0.25);
          m.scale.setScalar(i === 0 ? 1.15 : 0.8);
          g.add(m);
        }
      } else {
        const rockBase = new THREE.DodecahedronGeometry(1.85, 1);
        const rockMat = new THREE.MeshStandardMaterial({
          color: 0x524c48,
          roughness: 0.88,
          metalness: 0.18,
        });
        const m1 = new THREE.Mesh(rockBase, rockMat);
        m1.scale.set(1.2, 0.82, 1.05);
        m1.position.y = 1.05;
        const m2 = new THREE.Mesh(new THREE.OctahedronGeometry(1.15, 0), mat);
        m2.position.set(0.75, 1.45, 0.45);
        m2.rotation.set(0.4, 0.6, 0.2);
        const m3 = new THREE.Mesh(new THREE.OctahedronGeometry(0.85, 0), mat);
        m3.position.set(-0.85, 1.15, -0.5);
        m3.rotation.set(-0.3, 0.2, 0.5);
        g.add(m1, m2, m3);
      }

      g.position.set(x, y, z);
      g.rotation.y = node.rotY;
      g.scale.setScalar(node.scale);
      this.scene.add(g);
      this.nodeMeshes.set(uid, g);
    };

    const starterNodes: [string, number, number, 'Small' | 'Medium'][] = [
      ['scrap_plate', 632, -62, 'Small'],
      ['scrap_plate', 666, -102, 'Small'],
      ['scrap_plate', 720, -68, 'Small'],
      ['fibre', 635, -95, 'Small'],
      ['fibre', 618, -74, 'Small'],
      ['fibre', 672, -48, 'Small'],
      ['silica', 610, -110, 'Small'],
      ['silica', 688, -125, 'Small'],
      ['ferrite', 595, -55, 'Small'],
      ['ferrite', 575, -92, 'Medium'],
      ['ferrite', 710, -120, 'Small'],
      ['ferrite', 540, -40, 'Medium'],
      ['cuprite', 560, -145, 'Small'],
      ['cuprite', 515, -180, 'Medium'],
      ['resin', 580, -25, 'Small'],
      ['resin', 460, 40, 'Small'],
      ['brine_salt', 760, -140, 'Small'],
    ];
    starterNodes.forEach(([res, x, z, sz], i) => addNode(`node_start_${i}`, res, x, z, sz));

    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;
      const rad = 22 + (i % 3) * 14;
      const res = i % 2 === 0 ? 'prismite' : 'cuprite';
      addNode(`node_cav_${i}`, res, 500 + Math.cos(ang) * rad, -240 + Math.sin(ang) * rad, 'Medium');
    }

    const beltCoords: [string, number, number][] = [
      ['ferrite', 310, -60],
      ['cuprite', 260, -120],
      ['tar', 200, 120],
      ['tar', 140, 80],
      ['brine_salt', 110, -70],
      ['aluminite', 185, -15],
      ['ferrite', -40, 20],
      ['cuprite', -80, -90],
      ['tar', -140, 160],
    ];
    beltCoords.forEach(([res, x, z], i) => addNode(`node_belt_${i}`, res, x, z, 'Medium'));

    addNode('node_spine_0', 'titanite', -240, 560, 'Large');
    addNode('node_spine_1', 'titanite', -280, 600, 'Medium');
    addNode('node_spine_2', 'aluminite', -180, 440, 'Medium');

    addNode('node_farside_0', 'lithe', -660, -140, 'Medium');
    addNode('node_farside_1', 'lithe', -710, -170, 'Medium');

    addNode('node_trench_0', 'lantern_ore', 1230, 35, 'Medium');
    addNode('node_trench_1', 'lantern_ore', 1285, -30, 'Medium');

    this.spawnMachine('fabricator_t0', 658, -72, 0, 'starter_fab');

    const addCreature = (
      kind: CreatureInstance['kind'],
      x: number,
      z: number,
      hp: number,
      yOverride?: number
    ) => {
      const uid = `cre_${this.creatures.length}`;
      const y = yOverride ?? getGroundHeight(x, z);
      const c: CreatureInstance = {
        uid,
        kind,
        x,
        y,
        z,
        rotY: Math.random() * Math.PI * 2,
        hp,
        maxHp: hp,
        state: 'patrol',
        stateTimer: 4 + Math.random() * 5,
        homeX: x,
        homeZ: z,
        patrolAngle: Math.random() * Math.PI * 2,
        alerted: false,
      };
      this.creatures.push(c);
      const mesh = buildCreatureMesh(kind, this.textures);
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      this.creatureMeshes.set(uid, mesh);
    };

    for (let i = 0; i < 6; i++) {
      addCreature('plodder', 560 + i * 28, 30 + (i % 3) * 24, 120);
    }
    for (let i = 0; i < 5; i++) {
      addCreature('skitter', 730 + i * 24, -130 + (i % 2) * 40, 15);
    }
    addCreature('ridge_stalker', 360, -40, 450);
    addCreature('ridge_stalker', 220, 60, 450);
    addCreature('ridge_stalker', 480, 90, 450);
    addCreature('cave_lurker', 515, -265, 200);
    addCreature('warden_leviathan', 1200, 75, 25000, -120);
    this.rebuildPowerCables();
  }

  private rebuildPowerCables(): void {
    while (this.powerCableGroup.children.length > 0) {
      const child = this.powerCableGroup.children.pop();
      if (child instanceof THREE.Line) child.geometry.dispose();
    }

    const list = Array.from(this.machines.values()).filter(
      (m) => m.defId !== 'conveyor_t1' && m.defId !== 'chest_t1'
    );
    const seen = new Set<string>();

    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const aIsPole = a.defId === 'power_pole_t1';
      const aIsGen = (BUILDABLES[a.defId]?.powerKw ?? 0) < 0 || Boolean(BUILDABLES[a.defId]?.capacityKws);
      if (!aIsPole && !aIsGen) continue;

      const maxRange = aIsPole ? 62 : 42;
      let links = 0;
      for (let j = 0; j < list.length && links < 3; j++) {
        if (i === j) continue;
        const b = list[j];
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d > maxRange || d < 2) continue;
        const pairKey = a.uid < b.uid ? `${a.uid}:${b.uid}` : `${b.uid}:${a.uid}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        links++;

        const hA = a.defId === 'power_pole_t1' ? 14.5 : a.defId === 'wind_turbine_t1' ? 18 : 4.2;
        const hB = b.defId === 'power_pole_t1' ? 14.5 : b.defId === 'wind_turbine_t1' ? 18 : 4.2;
        const p0 = new THREE.Vector3(a.x, a.y + hA, a.z);
        const p2 = new THREE.Vector3(b.x, b.y + hB, b.z);
        const mid = p0.clone().lerp(p2, 0.5);
        mid.y -= Math.min(3.5, d * 0.065);
        const curve = new THREE.QuadraticBezierCurve3(p0, mid, p2);
        const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(10));
        this.powerCableGroup.add(new THREE.Line(geo, this.powerCableMat));
      }
    }
  }

  private spawnMachine(defId: string, x: number, z: number, rotY: number, forcedUid?: string): MachineInstance {
    const def = BUILDABLES[defId];
    const uid = forcedUid ?? `mach_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
    const y = getGroundHeight(x, z);

    let nodeResource: string | undefined;
    if (def.requiresNode) {
      let bestDist = 18;
      for (const n of this.nodes.values()) {
        const d = Math.hypot(n.x - x, n.z - z);
        if (d < bestDist && n.remaining > 0) {
          bestDist = d;
          nodeResource = n.resourceId;
        }
      }
    }

    const defaultRecipe =
      defId === 'furnace_t1'
        ? 'iron_ingot'
        : defId === 'assembler_t1'
        ? 'copper_wire'
        : null;

    const m: MachineInstance = {
      uid,
      defId,
      x,
      y,
      z,
      rotY,
      state: 'Idle',
      hp: def.hp,
      maxHp: def.hp,
      recipeId: defaultRecipe,
      progress: 0,
      inputBuffer: {},
      outputBuffer: {},
      nodeResource,
      beltItems: defId === 'conveyor_t1' ? [] : undefined,
      storedEnergy: def.capacityKws ? def.capacityKws : 0,
    };
    if (defId === 'battery_t1') m.storedEnergy = 12000;
    this.machines.set(uid, m);

    const mesh = buildBuildableMesh(defId, this.textures, this.isSoftwareGl);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    this.scene.add(mesh);
    this.machineMeshes.set(uid, mesh);
    return m;
  }

  private spawnVehicle(defId: VehicleInstance['defId'], x: number, z: number, rotY = 0): VehicleInstance {
    const def = BUILDABLES[defId];
    const uid = `veh_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
    const y =
      defId === 'vehicle_needle_t2'
        ? Math.min(-6, Math.max(getGroundHeight(x, z) + 2, -12))
        : getGroundHeight(x, z);
    const v: VehicleInstance = {
      uid,
      defId,
      x,
      y,
      z,
      rotY,
      vx: 0,
      vy: 0,
      vz: 0,
      battery: 100,
      maxBattery: 100,
      hp: def.hp,
      maxHp: def.hp,
    };
    this.vehicles.set(uid, v);
    const mesh = buildVehicleMesh(defId, this.textures);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    this.scene.add(mesh);
    this.vehicleMeshes.set(uid, mesh);
    return v;
  }

  // =================== FIRST-PERSON VIEWMODEL SYNC ===================

  private syncFirstPersonViewmodel(): void {
    const activeVeh = this.activeVehicleUid ? this.vehicles.get(this.activeVehicleUid) : null;
    if (activeVeh) {
      if (this.fpToolGroup) this.fpToolGroup.visible = false;
      if (this.currentFpVehicleDef !== activeVeh.defId) {
        if (this.fpCockpitGroup) this.fpAnchor.remove(this.fpCockpitGroup);
        this.fpCockpitGroup = buildVehicleCockpit(activeVeh.defId, this.textures);
        this.fpAnchor.add(this.fpCockpitGroup);
        this.currentFpVehicleDef = activeVeh.defId;
      }
      if (this.fpCockpitGroup) this.fpCockpitGroup.visible = true;
      return;
    }

    if (this.fpCockpitGroup) this.fpCockpitGroup.visible = false;

    const slot = this.hotbar[this.selectedSlot];
    const itemId = this.buildModeId ? 'build_tool' : slot?.itemId ?? null;
    if (itemId !== this.currentFpItemId) {
      if (this.fpToolGroup) this.fpAnchor.remove(this.fpToolGroup);
      this.fpToolGroup = itemId ? buildFirstPersonToolGroup(itemId, this.textures) : null;
      this.fpActiveBeam = this.fpToolGroup ? this.fpToolGroup.getObjectByName('ActiveBeam') ?? null : null;
      if (this.fpToolGroup) {
        this.fpToolGroup.position.set(0.36, -0.32, -0.52);
        this.fpAnchor.add(this.fpToolGroup);
      }
      this.currentFpItemId = itemId;
      this.fpEquipDrop = 0.25;
    }
    if (this.fpToolGroup) this.fpToolGroup.visible = true;
  }

  // =================== PUBLIC API ===================

  public setPaused(p: boolean): void {
    this.paused = p;
    if (p && document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
    this.emitHud(true);
  }

  public requestPointerLock(): void {
    if (this.paused) return;
    this.audio.init();
    try {
      this.renderer.domElement.requestPointerLock?.();
    } catch {
      // Fallback drag-look works
    }
  }

  public setOrbitSpeed(mult: number): void {
    this.orbitSpeedMultiplier = mult;
    this.emitHud(true);
  }

  public advanceToPhase(target: OrbitPhase): void {
    const p = ORBIT_PHASES.find((x) => x.name === target);
    if (p) {
      const cycleBase = Math.floor(this.orbitSeconds / ORBIT_DURATION) * ORBIT_DURATION;
      this.orbitSeconds = cycleBase + p.start + 2;
      this.emitHud(true);
    }
  }

  public setMouseSensitivity(mult: number): void {
    this.mouseSensitivity = THREE.MathUtils.clamp(mult, 0.4, 2.5);
    try {
      localStorage.setItem('tidelock_mouse_sens', String(this.mouseSensitivity));
    } catch {
      // ignore
    }
    this.emitHud(true);
  }

  public toggleMuted(): void {
    this.audio.setMuted(!this.audio.isMuted());
    this.emitHud(true);
  }

  public selectHotbarSlot(index: number): void {
    if (index < 0 || index >= 8) return;
    this.selectedSlot = index;
    const slot = this.hotbar[index];
    if (slot?.itemId === 'handlamp') {
      this.handlampOn = !this.handlampOn;
    }
    this.syncFirstPersonViewmodel();
    this.emitHud(true);
  }

  public enterBuildMode(defId: string | null): void {
    this.buildModeId = defId;
    if (this.buildGhost) {
      this.scene.remove(this.buildGhost);
      this.buildGhost = null;
    }
    this.buildGhostMats = [];
    this.prevBuildValid = false;
    if (defId) {
      const ghost = buildBuildableMesh(defId, this.textures, true);
      const sharedGhostMat = new THREE.MeshBasicMaterial({
        color: 0x3ddc84,
        transparent: true,
        opacity: 0.45,
      });
      ghost.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.material = sharedGhostMat;
        }
      });
      this.buildGhostMats.push(sharedGhostMat);
      this.buildGhost = ghost;
      this.scene.add(ghost);
    }
    this.syncFirstPersonViewmodel();
    this.emitHud(true);
  }

  public craftRecipe(recipeId: string): boolean {
    const r = RECIPES.find((x) => x.id === recipeId);
    if (!r || !this.hasItems(r.inputs)) return false;
    this.consumeItems(r.inputs);
    for (const [itemId, qty] of Object.entries(r.outputs)) {
      if (itemId === 'insulated_suit') {
        this.stats.suitTier = Math.max(this.stats.suitTier, 1);
        this.triggerAlert('Insulated Suit equipped (Depth 150, -50% cold loss)', 'info');
      } else if (itemId === 'pressure_suit') {
        this.stats.suitTier = Math.max(this.stats.suitTier, 2);
        this.triggerAlert('Pressure Suit equipped (Depth 400 — ready for The Trench!)', 'info');
      } else if (itemId === 'deepsuit') {
        this.stats.suitTier = Math.max(this.stats.suitTier, 3);
        this.triggerAlert('Deepsuit equipped (Depth 900, active heating)', 'info');
      } else if (itemId === 'standard_tank') {
        this.stats.tankTier = Math.max(this.stats.tankTier, 1);
        this.stats.maxOxygen = TANK_SPECS[1].capacity;
        this.stats.oxygen = this.stats.maxOxygen;
        this.triggerAlert('Standard O2 Tank equipped (120s)', 'info');
      } else if (itemId === 'high_cap_tank') {
        this.stats.tankTier = Math.max(this.stats.tankTier, 2);
        this.stats.maxOxygen = TANK_SPECS[2].capacity;
        this.stats.oxygen = this.stats.maxOxygen;
        this.triggerAlert('High-Capacity O2 Tank equipped (240s)', 'info');
      } else {
        this.addItem(itemId, qty);
      }
    }
    this.audio.playUnlockChime();
    this.emitHud(true);
    return true;
  }

  public getMachine(uid: string): MachineInstance | undefined {
    return this.machines.get(uid);
  }

  public setMachineRecipe(uid: string, recipeId: string): void {
    const m = this.machines.get(uid);
    if (!m) return;
    m.recipeId = recipeId;
    m.progress = 0;
    this.emitHud(true);
  }

  public feedMachineFromInventory(uid: string, itemId: string, amount: number): void {
    const m = this.machines.get(uid);
    if (!m) return;
    const take = Math.min(this.countItem(itemId), amount);
    if (take <= 0) return;
    this.consumeItems({ [itemId]: take });
    m.inputBuffer[itemId] = (m.inputBuffer[itemId] || 0) + take;
    this.emitHud(true);
  }

  public collectMachineOutputs(uid: string): void {
    const m = this.machines.get(uid);
    if (!m) return;
    for (const [id, qty] of Object.entries(m.outputBuffer)) {
      if (qty > 0) {
        this.addItem(id, qty);
        m.outputBuffer[id] = 0;
      }
    }
    this.audio.playTone(540, 0.1, 'triangle', 0.1);
    this.emitHud(true);
  }

  public dismantleMachine(uid: string): boolean {
    if (uid === 'starter_fab') {
      this.triggerAlert('Starter Cradle Fabricator cannot be dismantled', 'warning');
      return false;
    }
    const m = this.machines.get(uid);
    if (!m) return false;
    const def = BUILDABLES[m.defId];
    if (def) {
      for (const [id, qty] of Object.entries(def.cost)) {
        this.addItem(id, qty);
      }
    }
    for (const [id, qty] of Object.entries(m.inputBuffer)) {
      if (qty > 0) this.addItem(id, qty);
    }
    for (const [id, qty] of Object.entries(m.outputBuffer)) {
      if (qty > 0) this.addItem(id, qty);
    }
    if (m.beltItems) {
      for (const bi of m.beltItems) this.addItem(bi.itemId, 1);
    }
    const mesh = this.machineMeshes.get(uid);
    if (mesh) this.scene.remove(mesh);
    this.machineMeshes.delete(uid);
    this.machines.delete(uid);
    this.rebuildPowerCables();
    this.audio.playDismantle();
    this.triggerAlert(`Dismantled ${def?.name ?? m.defId} (100% refunded)`, 'info');
    this.emitHud(true);
    return true;
  }

  public useInventoryItem(itemId: string): boolean {
    if (this.countItem(itemId) <= 0) return false;
    if (itemId === 'water_flask') {
      this.consumeItems({ water_flask: 1 });
      this.stats.thirst = Math.min(100, this.stats.thirst + 35);
      this.audio.playTone(420, 0.14, 'sine', 0.12, 600);
      this.triggerAlert('Drank Filtered Water (+35 Thirst)', 'info');
      this.emitHud(true);
      return true;
    }
    if (itemId === 'ration') {
      this.consumeItems({ ration: 1 });
      this.stats.hunger = Math.min(100, this.stats.hunger + 35);
      this.stats.health = Math.min(100, this.stats.health + 10);
      this.audio.playTone(340, 0.14, 'triangle', 0.12);
      this.triggerAlert('Ate Biomass Ration (+35 Food, +10 HP)', 'info');
      this.emitHud(true);
      return true;
    }
    if (itemId === 'medkit') {
      this.consumeItems({ medkit: 1 });
      this.stats.health = Math.min(100, this.stats.health + 45);
      this.audio.playUnlockChime();
      this.triggerAlert('Applied Trauma Patch (+45 Health)', 'info');
      this.emitHud(true);
      return true;
    }
    return false;
  }

  public equipInventoryToHotbar(invIdx: number): void {
    const invSlot = this.inventory[invIdx];
    if (!invSlot) return;
    const targetIdx = this.hotbar.findIndex((s) => s === null) !== -1
      ? this.hotbar.findIndex((s) => s === null)
      : this.selectedSlot;
    const prevHotbar = this.hotbar[targetIdx];
    this.hotbar[targetIdx] = { ...invSlot };
    if (prevHotbar) {
      this.inventory[invIdx] = { ...prevHotbar };
    } else {
      this.inventory.splice(invIdx, 1);
    }
    this.selectedSlot = targetIdx;
    this.syncFirstPersonViewmodel();
    this.audio.playTone(500, 0.07, 'triangle', 0.08);
    this.emitHud(true);
  }

  public chooseLanternEnding(choice: 'keeper' | 'exodus' | 'signal'): void {
    this.ending = choice;
    this.storyFlags.lantern_resolved = true;
    this.audio.playUnlockChime();
    this.saveGame(this.saveSlot);
    this.emitHud(true);
  }

  public saveGame(slot = this.saveSlot): void {
    this.saveSlot = slot;
    const data: SaveSlotData = {
      version: 1,
      slot,
      savedAt: new Date().toISOString(),
      orbitSeconds: this.orbitSeconds,
      stats: { ...this.stats },
      playerPos: { x: this.playerPos.x, y: this.playerPos.y, z: this.playerPos.z, rotY: this.yaw },
      inventory: this.inventory.map((s) => ({ ...s })),
      hotbar: this.hotbar.map((s) => (s ? { ...s } : null)),
      blueprints: Array.from(this.blueprints),
      machines: Array.from(this.machines.values()),
      vehicles: Array.from(this.vehicles.values()),
      nodes: Array.from(this.nodes.values()).map((n) => ({ uid: n.uid, remaining: n.remaining })),
      scannedWrecks: this.wrecks.filter((w) => w.scanned).map((w) => w.uid),
      storyFlags: { ...this.storyFlags },
      ending: this.ending,
      discoveredLandmarks: Array.from(this.discoveredLandmarks),
    };
    try {
      localStorage.setItem(SAVE_KEY_PREFIX + slot, JSON.stringify(data));
      this.triggerAlert(`Saved to Slot ${slot}`, 'info');
    } catch {
      // ignore
    }
  }

  public loadGame(slot: number): boolean {
    this.saveSlot = slot;
    const raw = localStorage.getItem(SAVE_KEY_PREFIX + slot);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw) as SaveSlotData;
      this.orbitSeconds = data.orbitSeconds ?? 60;
      this.stats = { ...data.stats };
      this.playerPos.set(data.playerPos.x, data.playerPos.y, data.playerPos.z);
      this.yaw = data.playerPos.rotY ?? 0;
      this.inventory = data.inventory ?? [];
      this.hotbar = data.hotbar ?? this.hotbar;
      this.blueprints = new Set(data.blueprints ?? INITIAL_BLUEPRINTS);
      this.storyFlags = data.storyFlags ?? {};
      this.ending = data.ending ?? null;
      this.discoveredLandmarks = new Set(data.discoveredLandmarks ?? ['cradle']);

      this.populateWorldEntities();
      for (const ns of data.nodes ?? []) {
        const n = this.nodes.get(ns.uid);
        if (n) n.remaining = ns.remaining;
      }
      const scannedSet = new Set(data.scannedWrecks ?? []);
      for (const w of this.wrecks) w.scanned = scannedSet.has(w.uid);

      this.machines.clear();
      this.machineMeshes.forEach((m) => this.scene.remove(m));
      this.machineMeshes.clear();
      for (const ms of data.machines ?? []) {
        const m = this.spawnMachine(ms.defId, ms.x, ms.z, ms.rotY, ms.uid);
        Object.assign(m, ms);
      }
      for (const vs of data.vehicles ?? []) {
        const v = this.spawnVehicle(vs.defId, vs.x, vs.z, vs.rotY);
        Object.assign(v, vs);
      }
      this.rebuildPowerCables();
      this.activeVehicleUid = null;
      this.syncFirstPersonViewmodel();
      this.emitHud(true);
      return true;
    } catch {
      return false;
    }
  }

  public newGame(slot: number): void {
    this.saveSlot = slot;
    this.orbitSeconds = 60;
    this.stats = {
      health: 100,
      maxHealth: 100,
      oxygen: 45,
      maxOxygen: 45,
      warmth: 100,
      maxWarmth: 100,
      hunger: 100,
      maxHunger: 100,
      thirst: 100,
      maxThirst: 100,
      stamina: 100,
      maxStamina: 100,
      suitTier: 0,
      tankTier: 0,
    };
    this.playerPos.set(642, getGroundHeight(642, -76), -76);
    this.playerVel.set(0, 0, 0);
    this.yaw = -Math.PI * 0.44;
    this.pitch = 0.06;
    this.hotbar = [
      { itemId: 'scanner', count: 1 },
      { itemId: 'handlamp', count: 1 },
      { itemId: 'flare', count: 2 },
      { itemId: 'knife', count: 1 },
      { itemId: 'water_flask', count: 2 },
      { itemId: 'ration', count: 2 },
      null,
      null,
    ];
    this.inventory = [
      { itemId: 'scrap_plate', count: 6 },
      { itemId: 'fibre', count: 4 },
    ];
    this.blueprints = new Set(INITIAL_BLUEPRINTS);
    this.storyFlags = {};
    this.ending = null;
    this.discoveredLandmarks = new Set(['cradle']);
    this.activeVehicleUid = null;
    this.populateWorldEntities();
    this.syncFirstPersonViewmodel();
    this.saveGame(slot);
    this.emitHud(true);
  }

  public static listSaveSlots(): (SaveSlotData | null)[] {
    return [1, 2, 3].map((slot) => {
      try {
        const raw = localStorage.getItem(SAVE_KEY_PREFIX + slot);
        return raw ? (JSON.parse(raw) as SaveSlotData) : null;
      } catch {
        return null;
      }
    });
  }

  // =================== INVENTORY HELPERS ===================

  private countItem(itemId: string): number {
    let total = 0;
    for (const s of this.inventory) if (s.itemId === itemId) total += s.count;
    for (const s of this.hotbar) if (s && s.itemId === itemId) total += s.count;
    return total;
  }

  private hasItems(reqs: Record<string, number>): boolean {
    return Object.entries(reqs).every(([id, qty]) => this.countItem(id) >= qty);
  }

  private consumeItems(reqs: Record<string, number>): void {
    for (const [id, needed] of Object.entries(reqs)) {
      let rem = needed;
      for (let i = this.inventory.length - 1; i >= 0 && rem > 0; i--) {
        if (this.inventory[i].itemId === id) {
          const take = Math.min(rem, this.inventory[i].count);
          this.inventory[i].count -= take;
          rem -= take;
          if (this.inventory[i].count <= 0) this.inventory.splice(i, 1);
        }
      }
      for (let i = 0; i < this.hotbar.length && rem > 0; i++) {
        const s = this.hotbar[i];
        if (s && s.itemId === id) {
          const take = Math.min(rem, s.count);
          s.count -= take;
          rem -= take;
          if (s.count <= 0) this.hotbar[i] = null;
        }
      }
    }
  }

  private addItem(itemId: string, count: number): void {
    if (count <= 0) return;
    if (ITEMS[itemId]?.category === 'tool') {
      const emptyIdx = this.hotbar.findIndex((s) => s === null);
      if (emptyIdx !== -1 && !this.hotbar.some((s) => s?.itemId === itemId)) {
        this.hotbar[emptyIdx] = { itemId, count: 1 };
        this.syncFirstPersonViewmodel();
        return;
      }
    }
    const existingHb = this.hotbar.find((s) => s?.itemId === itemId);
    if (existingHb) {
      existingHb.count += count;
      return;
    }
    const existingInv = this.inventory.find((s) => s.itemId === itemId);
    if (existingInv) {
      existingInv.count += count;
    } else {
      this.inventory.push({ itemId, count });
    }
  }

  private triggerAlert(text: string, tone: 'warning' | 'danger' | 'info' = 'info'): void {
    this.activeAlert = { text, tone, ttl: 4.5 };
  }

  // =================== EVENT LISTENERS ===================

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Escape') {
      if (this.buildModeId) {
        this.enterBuildMode(null);
      } else {
        this.onPauseToggle();
      }
      return;
    }
    if (this.paused) return;

    this.keys[e.code] = true;

    if (e.code.startsWith('Digit')) {
      const n = parseInt(e.code.replace('Digit', ''), 10);
      if (n >= 1 && n <= 8) this.selectHotbarSlot(n - 1);
    } else if (e.code === 'KeyF') {
      this.handlampOn = !this.handlampOn;
      this.audio.playTone(620, 0.05, 'triangle', 0.08);
    } else if (e.code === 'KeyR' && this.buildModeId) {
      this.buildRotY += Math.PI / 2;
    } else if (e.code === 'KeyE') {
      this.handleInteract();
    } else if (e.code === 'KeyX' && !this.buildModeId && !this.activeVehicleUid) {
      const m = this.getNearestDismantleable();
      if (m) this.dismantleMachine(m.uid);
    } else if (e.code === 'Tab' || e.code === 'KeyI') {
      e.preventDefault();
      this.onToggleModal('inventory');
    } else if (e.code === 'KeyB') {
      this.onToggleModal('build');
    } else if (e.code === 'KeyP') {
      this.onToggleModal('production');
    } else if (e.code === 'KeyM') {
      this.onToggleModal('map');
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (this.paused) return;
    if (this.pointerLocked || this.draggingLook) {
      const s = this.mouseSensitivity;
      this.yaw -= e.movementX * 0.0024 * s;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0022 * s, -1.25, 1.2);
    }
  };

  private onWheel = (e: WheelEvent) => {
    if (this.paused || this.buildModeId) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    const next = (this.selectedSlot + dir + 8) % 8;
    this.selectHotbarSlot(next);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.paused) return;
    this.audio.init();
    if (e.button === 2) {
      if (this.buildModeId) {
        this.enterBuildMode(null);
        return;
      }
      this.draggingLook = true;
      return;
    }
    if (e.button === 0) {
      this.mouseDown = true;
      if (!this.pointerLocked) this.draggingLook = true;
      if (this.buildModeId) {
        this.tryPlaceBuild();
      } else {
        this.handlePrimaryAction();
      }
    }
  };

  private onMouseUp = () => {
    this.mouseDown = false;
    this.draggingLook = false;
    this.scanProgress = 0;
    this.scanTargetName = null;
  };

  private onPointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    this.emitHud(true);
  };

  private onResize = () => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private onWebGlContextLost = (e: Event) => {
    e.preventDefault();
    this.paused = true;
  };

  private onWebGlContextRestored = () => {
    this.paused = false;
    this.emitHud(true);
  };

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    this.renderer.domElement.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    this.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    this.renderer.domElement.addEventListener('webglcontextlost', this.onWebGlContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onWebGlContextRestored);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    window.addEventListener('resize', this.onResize);
  }

  // =================== ACTIONS & INTERACTIONS ===================

  private tryPlaceBuild(): void {
    if (!this.buildModeId || !this.buildValid) return;
    const def = BUILDABLES[this.buildModeId];
    if (!def || !this.hasItems(def.cost)) {
      this.triggerAlert('Insufficient materials!', 'warning');
      return;
    }
    this.consumeItems(def.cost);
    if (def.category === 'vehicle') {
      this.spawnVehicle(def.id as VehicleInstance['defId'], this.buildSnapPos.x, this.buildSnapPos.z, this.buildRotY);
    } else {
      this.spawnMachine(def.id, this.buildSnapPos.x, this.buildSnapPos.z, this.buildRotY);
      this.rebuildPowerCables();
    }
    this.audio.playBuildPlace();
    this.fpSwingTimer = 0.25;
    this.triggerAlert(`Built ${def.name}`, 'info');
    if (def.id === 'outpost_pod_t0') this.storyFlags.built_pod = true;
    if (def.id === 'heater_t1') this.storyFlags.built_heater = true;
    if (def.id === 'furnace_t1') this.storyFlags.built_furnace = true;

    if (def.id !== 'conveyor_t1' && def.id !== 'power_pole_t1') {
      this.enterBuildMode(null);
    }
    this.emitHud(true);
  }

  private handlePrimaryAction(): void {
    const slot = this.hotbar[this.selectedSlot];
    if (!slot) return;
    const itemId = slot.itemId;
    this.fpSwingTimer = 0.28;
    this.toolCooldown = 0.4;

    if (itemId === 'handlamp') {
      this.handlampOn = !this.handlampOn;
      this.audio.playTone(620, 0.05, 'triangle', 0.08);
      return;
    }

    if (itemId === 'water_flask') {
      this.stats.thirst = Math.min(100, this.stats.thirst + 35);
      slot.count--;
      if (slot.count <= 0) this.hotbar[this.selectedSlot] = null;
      this.audio.playTone(420, 0.14, 'sine', 0.12, 600);
      this.syncFirstPersonViewmodel();
      return;
    }

    if (itemId === 'ration') {
      this.stats.hunger = Math.min(100, this.stats.hunger + 35);
      this.stats.health = Math.min(100, this.stats.health + 10);
      slot.count--;
      if (slot.count <= 0) this.hotbar[this.selectedSlot] = null;
      this.audio.playTone(340, 0.14, 'triangle', 0.12);
      this.syncFirstPersonViewmodel();
      return;
    }

    if (itemId === 'medkit') {
      this.stats.health = Math.min(100, this.stats.health + 45);
      slot.count--;
      if (slot.count <= 0) this.hotbar[this.selectedSlot] = null;
      this.audio.playUnlockChime();
      this.syncFirstPersonViewmodel();
      return;
    }

    if (itemId === 'flare') {
      slot.count--;
      if (slot.count <= 0) this.hotbar[this.selectedSlot] = null;
      this.spawnFlare();
      this.syncFirstPersonViewmodel();
      return;
    }

    if (itemId === 'cutter' || itemId === 'knife') {
      let hitNode: ResourceNodeInstance | null = null;
      let bestDist = 18;
      for (const n of this.nodes.values()) {
        if (n.remaining <= 0) continue;
        const d = Math.hypot(n.x - this.playerPos.x, n.z - this.playerPos.z);
        if (d < bestDist) {
          bestDist = d;
          hitNode = n;
        }
      }
      if (hitNode && (itemId === 'cutter' || hitNode.resourceId === 'fibre' || hitNode.resourceId === 'scrap_plate')) {
        const dmg = itemId === 'cutter' ? 40 : 12;
        const harvest = Math.min(hitNode.remaining, itemId === 'cutter' ? 2 : 1);
        hitNode.remaining -= dmg;
        this.addItem(hitNode.resourceId, harvest);
        this.audio.playCutterHit();
        for (let k = 0; k < 12; k++) {
          this.spawnParticle(
            hitNode.x + (Math.random() - 0.5) * 1.5,
            hitNode.y + 1.6,
            hitNode.z + (Math.random() - 0.5) * 1.5,
            (Math.random() - 0.5) * 12,
            4 + Math.random() * 8,
            (Math.random() - 0.5) * 12,
            0.55,
            1.0,
            0.76,
            0.18
          );
        }
        this.triggerAlert(`+${harvest} ${ITEMS[hitNode.resourceId]?.name}`, 'info');
        if (hitNode.remaining <= 0) {
          const mesh = this.nodeMeshes.get(hitNode.uid);
          if (mesh) this.scene.remove(mesh);
        }
        return;
      }

      for (const c of this.creatures) {
        const d = Math.hypot(c.x - this.playerPos.x, c.z - this.playerPos.z);
        if (d < 15 && c.hp > 0) {
          const dmg = itemId === 'knife' ? 24 : 14;
          c.hp -= dmg;
          c.state = 'flee';
          c.stateTimer = 5;
          this.audio.playCutterHit();
          for (let k = 0; k < 8; k++) {
            this.spawnParticle(
              c.x + (Math.random() - 0.5) * 1.2,
              c.y + 1.5,
              c.z + (Math.random() - 0.5) * 1.2,
              (Math.random() - 0.5) * 9,
              3 + Math.random() * 6,
              (Math.random() - 0.5) * 9,
              0.45,
              0.3,
              0.92,
              0.78
            );
          }
          if (c.hp <= 0) {
            const m = this.creatureMeshes.get(c.uid);
            if (m) m.visible = false;
            this.addItem('biomass', 4);
            this.triggerAlert('+4 Biomass harvested', 'info');
          }
          return;
        }
      }
    }
  }

  private spawnFlare(): void {
    const g = new THREE.Group();
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 1.1, 8),
      new THREE.MeshStandardMaterial({ color: 0xe86f51, emissive: 0xff4d4d, emissiveIntensity: 2.2 })
    );
    stick.rotation.z = Math.PI / 2;
    stick.position.y = 0.2;
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.textures.particleSoft,
        color: 0xff5a40,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    halo.scale.set(9, 9, 1);
    halo.position.y = 0.7;
    g.add(stick, halo);
    const fx = this.playerPos.x - Math.sin(this.yaw) * 4;
    const fz = this.playerPos.z - Math.cos(this.yaw) * 4;
    const fy = getGroundHeight(fx, fz);
    g.position.set(fx, fy, fz);

    this.scene.add(g);
    this.flares.push({ mesh: g, x: fx, y: fy, z: fz, ttl: 180 });
    this.audio.playFlareIgnite();
    this.triggerAlert('Flare deployed (repels Ridge Stalkers within 40 studs)', 'info');
  }

  private getNearestInteractable(): { label: string; action: () => void } | null {
    if (this.activeVehicleUid) {
      return {
        label: '[E] Exit Cockpit',
        action: () => {
          this.activeVehicleUid = null;
          this.playerPos.y = Math.max(this.playerPos.y, getGroundHeight(this.playerPos.x, this.playerPos.z) + 0.5);
          this.syncFirstPersonViewmodel();
          this.emitHud(true);
        },
      };
    }

    for (const v of this.vehicles.values()) {
      if (Math.hypot(v.x - this.playerPos.x, v.z - this.playerPos.z) < 12) {
        const def = BUILDABLES[v.defId];
        return {
          label: `[E] Enter ${def.name} Cockpit`,
          action: () => {
            this.activeVehicleUid = v.uid;
            this.audio.playTone(220, 0.2, 'triangle', 0.12, 440);
            this.syncFirstPersonViewmodel();
            this.emitHud(true);
          },
        };
      }
    }

    if (Math.hypot(this.playerPos.x - 1260, this.playerPos.z) < 55) {
      return {
        label: '[E] Interface with The Lantern',
        action: () => {
          this.storyFlags.reached_lantern = true;
          this.onOpenLantern();
        },
      };
    }

    if (Math.hypot(this.playerPos.x - 240, this.playerPos.z - 210) < 28 && !this.storyFlags.relay_alpha) {
      return {
        label: '[E] Access Relay Alpha Comms',
        action: () => {
          this.storyFlags.relay_alpha = true;
          this.audio.playUnlockChime();
          this.triggerAlert('RELAY ALPHA: Carrier signal traced to Near Sea Trench (+1260, 0)!', 'info');
          this.emitHud(true);
        },
      };
    }

    let bestMach: MachineInstance | null = null;
    let bestMDist = 11;
    for (const m of this.machines.values()) {
      const d = Math.hypot(m.x - this.playerPos.x, m.z - this.playerPos.z);
      if (d < bestMDist) {
        bestMDist = d;
        bestMach = m;
      }
    }
    if (bestMach) {
      const def = BUILDABLES[bestMach.defId];
      if (bestMach.defId === 'fabricator_t0') {
        return {
          label: '[E] Open Fabricator',
          action: () => this.onToggleModal('inventory'),
        };
      }
      if (bestMach.defId === 'outpost_pod_t0' || bestMach.defId === 'hab_room_t0') {
        return {
          label: `[E] Rest & Save in ${def.name}`,
          action: () => {
            this.stats.warmth = 100;
            this.stats.oxygen = this.stats.maxOxygen;
            this.saveGame(this.saveSlot);
          },
        };
      }
      return {
        label: `[E] Inspect ${def.name}`,
        action: () => this.onOpenMachine(bestMach!.uid),
      };
    }

    for (const n of this.nodes.values()) {
      if (n.remaining <= 0) continue;
      if (Math.hypot(n.x - this.playerPos.x, n.z - this.playerPos.z) < 9) {
        const resName = ITEMS[n.resourceId]?.name ?? n.resourceId;
        if (
          n.resourceId === 'scrap_plate' ||
          n.resourceId === 'fibre' ||
          n.resourceId === 'silica' ||
          n.resourceId === 'brine_salt'
        ) {
          return {
            label: `[E] Gather ${resName}`,
            action: () => {
              n.remaining -= 20;
              this.addItem(n.resourceId, 1);
              this.fpSwingTimer = 0.22;
              this.audio.playTone(360, 0.08, 'sine', 0.1);
              this.triggerAlert(`+1 ${resName}`, 'info');
              if (n.remaining <= 0) {
                const mesh = this.nodeMeshes.get(n.uid);
                if (mesh) this.scene.remove(mesh);
              }
              this.emitHud(true);
            },
          };
        }
      }
    }

    return null;
  }

  private handleInteract(): void {
    const inter = this.getNearestInteractable();
    if (inter) inter.action();
  }

  private getNearestDismantleable(): MachineInstance | null {
    let best: MachineInstance | null = null;
    let bestD = 11;
    for (const m of this.machines.values()) {
      if (m.uid === 'starter_fab') continue;
      const d = Math.hypot(m.x - this.playerPos.x, m.z - this.playerPos.z);
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    return best;
  }

  private getTargetInfo(): HudSnapshot['targetInfo'] {
    if (this.activeVehicleUid || this.buildModeId) return null;

    let bestWreck: ScannableWreck | null = null;
    let bestWD = 42;
    for (const w of this.wrecks) {
      if (w.scanned) continue;
      const d = Math.hypot(w.x - this.playerPos.x, w.z - this.playerPos.z);
      if (d < bestWD) {
        bestWD = d;
        bestWreck = w;
      }
    }
    if (bestWreck) {
      return {
        title: bestWreck.name,
        subtitle: 'Hold LMB with Scanner [1] to extract Blueprint',
        tone: 'cyan',
      };
    }

    let bestNode: ResourceNodeInstance | null = null;
    let bestND = 18;
    for (const n of this.nodes.values()) {
      if (n.remaining <= 0) continue;
      const d = Math.hypot(n.x - this.playerPos.x, n.z - this.playerPos.z);
      if (d < bestND) {
        bestND = d;
        bestNode = n;
      }
    }
    if (bestNode) {
      const name = ITEMS[bestNode.resourceId]?.name ?? bestNode.resourceId;
      const handGather =
        bestNode.resourceId === 'scrap_plate' ||
        bestNode.resourceId === 'fibre' ||
        bestNode.resourceId === 'silica' ||
        bestNode.resourceId === 'brine_salt';
      return {
        title: `${name} (${bestNode.size})`,
        subtitle: handGather
          ? `${bestNode.remaining} units · [E] Gather or [LMB] Mine`
          : `${bestNode.remaining} units · [LMB] Mine with Cutter`,
        tone: 'amber',
      };
    }

    for (const c of this.creatures) {
      if (c.hp <= 0) continue;
      const d = Math.hypot(c.x - this.playerPos.x, c.z - this.playerPos.z);
      if (d < 28) {
        const label =
          c.kind === 'plodder'
            ? 'Tide Plodder (Docile)'
            : c.kind === 'skitter'
            ? 'Sand Skitter'
            : c.kind === 'ridge_stalker'
            ? 'Ridge Stalker (Weak to Flares)'
            : c.kind === 'cave_lurker'
            ? 'Cave Lurker'
            : 'Warden Leviathan';
        return {
          title: label,
          subtitle: `HP ${Math.ceil(c.hp)}/${c.maxHp} · [LMB] Strike with Knife`,
          tone: c.kind === 'plodder' ? 'emerald' : 'danger',
        };
      }
    }

    return null;
  }

  // =================== SIMULATION TICKS ===================

  private getOrbitState(): {
    phase: OrbitPhase;
    progress: number;
    timeToEclipse: number;
    tideOffset: number;
    tideTrend: 'rising' | 'falling';
  } {
    const t = ((this.orbitSeconds % ORBIT_DURATION) + ORBIT_DURATION) % ORBIT_DURATION;
    let phase: OrbitPhase = 'Day';
    let progress = 0;
    for (const p of ORBIT_PHASES) {
      if (t >= p.start && t < p.end) {
        phase = p.name;
        progress = (t - p.start) / (p.end - p.start);
        break;
      }
    }
    const eclipseStart = 2040;
    const timeToEclipse = t < eclipseStart ? eclipseStart - t : ORBIT_DURATION - t + eclipseStart;
    const tidePhase = (this.orbitSeconds / TIDE_CYCLE) * Math.PI * 2;
    const tideOffset = Math.sin(tidePhase) * 16;
    const tideTrend = Math.cos(tidePhase) >= 0 ? 'rising' : 'falling';
    return { phase, progress, timeToEclipse, tideOffset, tideTrend };
  }

  private step1HzSimulation(): void {
    const orbit = this.getOrbitState();
    const region = getRegionAt(this.playerPos.x, this.playerPos.z, this.playerPos.y);

    let supplyKw = 0;
    let demandKw = 0;
    let totalCapacity = 0;
    let totalStored = 0;
    const batteries: MachineInstance[] = [];

    for (const m of this.machines.values()) {
      const def = BUILDABLES[m.defId];
      if (!def) continue;
      if (def.capacityKws) {
        totalCapacity += def.capacityKws;
        totalStored += m.storedEnergy ?? 0;
        batteries.push(m);
      }
      if (def.powerKw < 0) {
        if (m.defId === 'solar_t1') {
          supplyKw += SOLAR_OUTPUT[orbit.phase];
        } else if (m.defId === 'wind_turbine_t1') {
          const r = getRegionAt(m.x, m.z);
          supplyKw += r === 'Spine' || Math.hypot(m.x - 180, m.z + 20) < 130 ? 15 : 8;
        } else if (m.defId === 'tidal_turbine_t3') {
          supplyKw += 45 + Math.abs(orbit.tideOffset) * 2.1;
        } else {
          supplyKw += -def.powerKw;
        }
      } else if (def.powerKw > 0) {
        demandKw += def.powerKw;
      }
    }

    const net = supplyKw - demandKw;
    let satisfaction = 1;
    if (net >= 0) {
      let add = net;
      for (const b of batteries) {
        const cap = BUILDABLES[b.defId].capacityKws || 0;
        const put = Math.min(cap - (b.storedEnergy || 0), add);
        b.storedEnergy = (b.storedEnergy || 0) + put;
        add -= put;
      }
    } else {
      const need = -net;
      if (totalStored >= need) {
        let rem = need;
        for (const b of batteries) {
          const take = Math.min(b.storedEnergy || 0, rem);
          b.storedEnergy = (b.storedEnergy || 0) - take;
          rem -= take;
        }
      } else {
        satisfaction = demandKw > 0 ? Math.min(1, (supplyKw + totalStored) / demandKw) : 1;
        for (const b of batteries) b.storedEnergy = 0;
      }
    }

    totalStored = batteries.reduce((acc, b) => acc + (b.storedEnergy || 0), 0);

    const counts: Record<MachineState, number> = {
      Idle: 0,
      NoInput: 0,
      Running: 0,
      Throttled: 0,
      OutputBlocked: 0,
      NoPower: 0,
      Fault: 0,
    };

    for (const m of this.machines.values()) {
      const def = BUILDABLES[m.defId];
      if (!def) continue;

      if (m.defId === 'heater_t1' || m.defId === 'outpost_pod_t0' || m.defId === 'hab_room_t0') {
        m.state = satisfaction > 0 ? 'Running' : 'NoPower';
      } else if (m.defId === 'drill_t1') {
        if (satisfaction <= 0) m.state = 'NoPower';
        else if (!m.nodeResource) m.state = 'NoInput';
        else {
          m.state = satisfaction < 1 ? 'Throttled' : 'Running';
          m.progress += satisfaction;
          if (m.progress >= 2) {
            m.progress = 0;
            const outKey = m.nodeResource;
            m.outputBuffer[outKey] = (m.outputBuffer[outKey] || 0) + 1;
            this.pushOutputToNeighbor(m, outKey);
          }
        }
      } else if (m.defId === 'furnace_t1' || m.defId === 'assembler_t1') {
        if (satisfaction <= 0) m.state = 'NoPower';
        else if (!m.recipeId) m.state = 'Idle';
        else {
          const r = RECIPES.find((x) => x.id === m.recipeId);
          if (!r) m.state = 'Idle';
          else {
            if (m.progress === 0) {
              const hasIn = Object.entries(r.inputs).every(([k, q]) => (m.inputBuffer[k] || 0) >= q);
              if (!hasIn) {
                m.state = 'NoInput';
                counts[m.state]++;
                continue;
              }
              for (const [k, q] of Object.entries(r.inputs)) m.inputBuffer[k] -= q;
            }
            m.state = satisfaction < 1 ? 'Throttled' : 'Running';
            m.progress += satisfaction;
            if (m.progress >= r.time) {
              m.progress = 0;
              for (const [ok, oq] of Object.entries(r.outputs)) {
                m.outputBuffer[ok] = (m.outputBuffer[ok] || 0) + oq;
                this.pushOutputToNeighbor(m, ok);
              }
            }
          }
        }
      } else if (def.powerKw < 0) {
        m.state = m.defId === 'solar_t1' && orbit.phase === 'Eclipse' ? 'Idle' : 'Running';
      }

      counts[m.state]++;
    }

    this.lastProdSummary = {
      supplyKw,
      demandKw,
      storedKws: totalStored,
      capacityKws: totalCapacity,
      satisfaction,
      eclipseEnduranceSec: demandKw > supplyKw ? Math.round(totalStored / (demandKw - supplyKw)) : 9999,
      machineCounts: counts,
      activeMachines: counts.Running + counts.Throttled,
    };

    const nearHeater = this.isNearRunningHeater();
    const insideShelter = this.isInsideShelter();
    const activeVeh = this.activeVehicleUid ? this.vehicles.get(this.activeVehicleUid) : null;
    const inPressurizedSub = activeVeh?.defId === 'vehicle_needle_t2';
    const seaY = SEA_LEVEL_Y + (this.playerPos.x < 0 ? orbit.tideOffset * 0.5 : orbit.tideOffset);
    const underwater = this.playerPos.y + 3.2 < seaY && (this.playerPos.x > 890 || this.playerPos.x < -940);
    const depthBelowSea = underwater ? Math.max(0, seaY - this.playerPos.y) : 0;

    let warmthRate = COLD_RATES[orbit.phase];
    if (region === 'FarSide') warmthRate -= 0.3;
    if (region === 'Spine') warmthRate -= 0.2;
    if (warmthRate < 0) warmthRate *= SUIT_SPECS[this.stats.suitTier].coldMult;
    if (nearHeater || insideShelter || inPressurizedSub) warmthRate += 2.2;
    this.stats.warmth = THREE.MathUtils.clamp(this.stats.warmth + warmthRate, 0, 100);
    if (this.stats.warmth <= 0) this.stats.health = Math.max(0, this.stats.health - 1);

    const inFarSideHaze = region === 'FarSide' && this.stats.suitTier < 2;
    if ((underwater && !inPressurizedSub) || (inFarSideHaze && !insideShelter)) {
      const depthDrain = underwater ? depthBelowSea * 0.004 : 0;
      this.stats.oxygen = Math.max(0, this.stats.oxygen - (1.0 + depthDrain));
      if (this.stats.oxygen <= 0) this.stats.health = Math.max(0, this.stats.health - 3);
    } else {
      this.stats.oxygen = Math.min(this.stats.maxOxygen, this.stats.oxygen + 10);
    }

    const suitDepthRating = SUIT_SPECS[this.stats.suitTier].depthRating;
    if (underwater && !this.activeVehicleUid && depthBelowSea > suitDepthRating) {
      const overPct = (depthBelowSea - suitDepthRating) / suitDepthRating;
      this.stats.health = Math.max(0, this.stats.health - (1 + Math.floor(overPct * 10)));
      this.triggerAlert(`CRUSH DEPTH EXCEEDED! (${Math.round(depthBelowSea)}m / ${suitDepthRating}m max)`, 'danger');
    }

    this.stats.hunger = Math.max(0, this.stats.hunger - 0.04);
    this.stats.thirst = Math.max(0, this.stats.thirst - 0.06);
    if (this.stats.hunger <= 0 || this.stats.thirst <= 0) {
      this.stats.health = Math.max(0, this.stats.health - 0.5);
    } else if (this.stats.warmth > 50 && this.stats.hunger > 40 && this.stats.thirst > 40) {
      this.stats.health = Math.min(100, this.stats.health + 0.5);
    }

    if (this.stats.health <= 0) {
      this.stats.health = 100;
      this.stats.warmth = 100;
      this.stats.oxygen = this.stats.maxOxygen;
      this.activeVehicleUid = null;
      this.syncFirstPersonViewmodel();
      this.playerPos.set(642, getGroundHeight(642, -76) + 1, -76);
      this.triggerAlert('Suit critical — Emergency respawn at Cradle Escape Pod', 'danger');
    }

    for (const lm of LANDMARKS) {
      if (!this.discoveredLandmarks.has(lm.id) && Math.hypot(lm.x - this.playerPos.x, lm.z - this.playerPos.z) < 90) {
        this.discoveredLandmarks.add(lm.id);
        this.audio.playUnlockChime();
        this.triggerAlert(`Discovered: ${lm.name}`, 'info');
      }
    }

    if (orbit.phase !== this.prevOrbitPhase) {
      if (orbit.phase === 'Dusk') {
        this.triggerAlert('Dusk approaching — Solar output falling. Prepare Heater!', 'warning');
      } else if (orbit.phase === 'Eclipse') {
        this.audio.playEclipseHorn();
        this.triggerAlert('ECLIPSE BEGUN — Solar power 0 kW. Ridge Stalkers hunting!', 'danger');
      } else if (orbit.phase === 'Dawn') {
        this.triggerAlert('Dawn breaking — Solar arrays online', 'info');
      }
      this.prevOrbitPhase = orbit.phase;
    }

    this.audio.updateAmbience(this.playerPos.x, underwater, orbit.phase === 'Eclipse');
  }

  private pushOutputToNeighbor(source: MachineInstance, itemId: string): void {
    for (const target of this.machines.values()) {
      if (target.uid === source.uid) continue;
      if (Math.hypot(target.x - source.x, target.z - source.z) > 11) continue;
      if (target.defId === 'conveyor_t1' && target.beltItems && target.beltItems.length < 2) {
        if ((source.outputBuffer[itemId] || 0) > 0) {
          source.outputBuffer[itemId]--;
          target.beltItems.push({ itemId, pos: 0 });
          return;
        }
      } else if (target.defId === 'furnace_t1' || target.defId === 'assembler_t1' || target.defId === 'chest_t1') {
        if ((source.outputBuffer[itemId] || 0) > 0) {
          source.outputBuffer[itemId]--;
          target.inputBuffer[itemId] = (target.inputBuffer[itemId] || 0) + 1;
          return;
        }
      }
    }
  }

  private stepBelts(dt: number): void {
    const speed = 4;
    const spacing = 2;
    let beltIdx = 0;

    for (const m of this.machines.values()) {
      if (m.defId !== 'conveyor_t1' || !m.beltItems) continue;
      const inRange = Math.hypot(m.x - this.playerPos.x, m.z - this.playerPos.z) < 120;
      for (let i = 0; i < m.beltItems.length; i++) {
        const item = m.beltItems[i];
        const limit = i === 0 ? 4 : m.beltItems[i - 1].pos - spacing;
        item.pos = Math.min(item.pos + speed * dt, limit);

        if (inRange && beltIdx < MAX_BELT_ITEMS) {
          const localZ = 2 - item.pos;
          const wx = m.x + Math.sin(m.rotY) * localZ;
          const wz = m.z + Math.cos(m.rotY) * localZ;
          _dummy.position.set(wx, m.y + 1.15, wz);
          _dummy.rotation.set(0, this.elapsed + beltIdx, 0);
          _dummy.scale.setScalar(1);
          _dummy.updateMatrix();
          this.beltInstancedMesh.setMatrixAt(beltIdx, _dummy.matrix);
          _color.set(ITEMS[item.itemId]?.color || '#F2C230');
          this.beltInstancedMesh.setColorAt(beltIdx, _color);
          beltIdx++;
        }
      }

      if (m.beltItems.length > 0 && m.beltItems[0].pos >= 3.95) {
        const frontX = m.x - Math.sin(m.rotY) * 4;
        const frontZ = m.z - Math.cos(m.rotY) * 4;
        for (const t of this.machines.values()) {
          if (t.uid === m.uid) continue;
          if (Math.hypot(t.x - frontX, t.z - frontZ) < 5.5) {
            const front = m.beltItems[0];
            if (t.defId === 'conveyor_t1' && t.beltItems && t.beltItems.length < 2) {
              m.beltItems.shift();
              t.beltItems.push({ itemId: front.itemId, pos: 0 });
              break;
            } else if (t.defId === 'furnace_t1' || t.defId === 'assembler_t1' || t.defId === 'chest_t1') {
              m.beltItems.shift();
              t.inputBuffer[front.itemId] = (t.inputBuffer[front.itemId] || 0) + 1;
              break;
            }
          }
        }
      }
    }

    this.beltInstancedMesh.count = beltIdx;
    this.beltInstancedMesh.instanceMatrix.needsUpdate = true;
    if (this.beltInstancedMesh.instanceColor) this.beltInstancedMesh.instanceColor.needsUpdate = true;
  }

  private isNearRunningHeater(): boolean {
    for (const m of this.machines.values()) {
      if (m.defId === 'heater_t1' && (m.state === 'Running' || m.state === 'Throttled')) {
        if (Math.hypot(m.x - this.playerPos.x, m.z - this.playerPos.z) <= 24) return true;
      }
    }
    return false;
  }

  private isInsideShelter(): boolean {
    if (Math.hypot(this.playerPos.x - 650, this.playerPos.z + 80) <= 10) return true;
    for (const m of this.machines.values()) {
      if (m.defId === 'outpost_pod_t0' && Math.hypot(m.x - this.playerPos.x, m.z - this.playerPos.z) <= 8) return true;
      if (m.defId === 'hab_room_t0' && Math.hypot(m.x - this.playerPos.x, m.z - this.playerPos.z) <= 12) return true;
    }
    return false;
  }

  // =================== PER-FRAME UPDATE LOOP ===================

  private tick = () => {
    if (this.disposed) return;

    const now = performance.now();
    const dt = Math.min(0.08, (now - this.lastTime) / 1000);
    this.lastTime = now;

    if (!this.paused) {
      this.elapsed += dt;
      this.orbitSeconds += dt * this.orbitSpeedMultiplier;
      this.waterTimeUniform.value = this.elapsed;
      this.skyMat.uniforms.uTime.value = this.elapsed;

      this.updatePlayerAndVehicle(dt);
      this.updateFirstPersonViewmodel(dt);
      this.updateSkyAndLighting();
      this.updateScanning(dt);
      this.updateBuildGhost();
      this.updateFlares(dt);
      this.updateCreatures(dt);
      this.updateMachineVisuals();
      this.updateParticles(dt);

      if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt * 2.4);
      if (this.toolCooldown > 0) this.toolCooldown = Math.max(0, this.toolCooldown - dt);
      if (this.mouseDown && !this.buildModeId && !this.activeVehicleUid && this.toolCooldown <= 0) {
        const held = this.hotbar[this.selectedSlot]?.itemId;
        if (held === 'cutter' || held === 'knife') {
          this.handlePrimaryAction();
        }
      }

      this.textures.conveyorBelt.offset.y -= dt * 1.3;

      this.simAccum1Hz += dt;
      if (this.simAccum1Hz >= 1.0) {
        this.simAccum1Hz -= 1.0;
        this.step1HzSimulation();
      }

      this.beltAccum10Hz += dt;
      if (this.beltAccum10Hz >= 0.1) {
        this.beltAccum10Hz -= 0.1;
        this.stepBelts(0.1);
      }

      this.autosaveAccum += dt;
      if (this.autosaveAccum >= 120) {
        this.autosaveAccum = 0;
        this.saveGame(this.saveSlot);
      }

      if (this.activeAlert) {
        this.activeAlert.ttl -= dt;
        if (this.activeAlert.ttl <= 0) this.activeAlert = null;
      }

      this.hudEmitAccum += dt;
      if (this.hudEmitAccum >= 0.15) {
        this.hudEmitAccum = 0;
        this.emitHud(false);
      }
    } else {
      // Keep ambient sky clouds, ocean shimmering & gentle factory/particle motion alive behind PDA menus
      const t = performance.now() * 0.001;
      this.waterTimeUniform.value = t;
      this.skyMat.uniforms.uTime.value = t;
      if (this.elapsed < 0.05) {
        this.camera.rotation.y = this.yaw + Math.sin(t * 0.18) * 0.045;
        this.camera.rotation.x = this.pitch + Math.cos(t * 0.14) * 0.015;
      } else {
        this.textures.conveyorBelt.offset.y -= dt * 0.85;
        this.updateMachineVisuals();
        this.updateParticles(dt * 0.5);
      }
    }

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private updatePlayerAndVehicle(dt: number): void {
    const forwardX = -Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);

    let moveF = 0;
    let moveR = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) moveF += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) moveF -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) moveR += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveR -= 1;

    const orbit = this.getOrbitState();
    const seaY = SEA_LEVEL_Y + (this.playerPos.x < 0 ? orbit.tideOffset * 0.5 : orbit.tideOffset);

    let targetFov = 72;
    let bobOffsetY = 0;

    if (this.activeVehicleUid) {
      const v = this.vehicles.get(this.activeVehicleUid);
      if (v) {
        const isSub = v.defId === 'vehicle_needle_t2';
        const baseTopSpeed = v.defId === 'vehicle_mule_t2' ? 60 : v.defId === 'vehicle_dart_t1' ? 40 : 28;
        const topSpeed = v.battery > 1 ? baseTopSpeed : baseTopSpeed * 0.45;
        if (moveR !== 0) {
          v.rotY -= moveR * dt * 1.9;
          this.yaw -= moveR * dt * 1.9;
        }
        const dirX = -Math.sin(v.rotY);
        const dirZ = -Math.cos(v.rotY);
        const targetSpd = moveF * topSpeed;
        v.vx = THREE.MathUtils.damp(v.vx, dirX * targetSpd, 4.5, dt);
        v.vz = THREE.MathUtils.damp(v.vz, dirZ * targetSpd, 4.5, dt);
        v.x = THREE.MathUtils.clamp(v.x + v.vx * dt, -WORLD_SEMI_X + 30, WORLD_SEMI_X - 30);
        v.z = THREE.MathUtils.clamp(v.z + v.vz * dt, -WORLD_SEMI_Z + 30, WORLD_SEMI_Z - 30);

        const movingRatio = Math.min(1, Math.hypot(v.vx, v.vz) / baseTopSpeed);
        if (movingRatio > 0.08) {
          v.battery = Math.max(0, v.battery - dt * 0.35 * movingRatio);
        }
        if (this.isInsideShelter() || orbit.phase === 'Day') {
          const chargeRate = this.isInsideShelter() ? 6.0 : !isSub ? 1.2 : 0;
          if (chargeRate > 0) v.battery = Math.min(v.maxBattery, v.battery + dt * chargeRate);
        }

        const gy = getGroundHeight(v.x, v.z);
        if (isSub) {
          let vert = 0;
          if (this.keys['Space']) vert += 18;
          if (this.keys['KeyC'] || this.keys['ControlLeft']) vert -= 18;
          v.y = THREE.MathUtils.clamp(v.y + vert * dt, gy + 2, seaY - 1.5);
        } else {
          const hover = v.defId === 'vehicle_dart_t1' ? 2.5 + Math.sin(this.elapsed * 3.5) * 0.25 : 0;
          v.y = gy + hover;
        }

        const vMesh = this.vehicleMeshes.get(v.uid);
        if (vMesh) {
          vMesh.position.set(v.x, v.y, v.z);
          vMesh.rotation.y = v.rotY;
        }

        const spdRatio = Math.hypot(v.vx, v.vz) / baseTopSpeed;
        targetFov = 72 + spdRatio * 9;
        this.camRoll = THREE.MathUtils.damp(this.camRoll, -moveR * 0.055 * spdRatio, 8, dt);

        this.playerPos.set(v.x, v.y + (v.defId === 'vehicle_mule_t2' ? 2.6 : 0.8), v.z);
      }
    } else {
      const inWater = this.playerPos.y + 3 < seaY && (this.playerPos.x > 890 || this.playerPos.x < -940);
      const sprinting =
        (this.keys['ShiftLeft'] || this.keys['ShiftRight']) &&
        this.stats.stamina > 2 &&
        (moveF !== 0 || moveR !== 0);

      if (sprinting) {
        this.stats.stamina = Math.max(0, this.stats.stamina - 12 * dt);
        targetFov = 77;
      } else {
        this.stats.stamina = Math.min(100, this.stats.stamina + 6 * dt);
      }

      const speed = inWater ? 14 : sprinting ? 24 : 16;
      const len = Math.hypot(moveF, moveR);
      const nf = len > 0 ? moveF / len : 0;
      const nr = len > 0 ? moveR / len : 0;

      const vx = (forwardX * nf + rightX * nr) * speed;
      const vz = (forwardZ * nf + rightZ * nr) * speed;

      this.playerPos.x = THREE.MathUtils.clamp(this.playerPos.x + vx * dt, -WORLD_SEMI_X + 20, WORLD_SEMI_X - 20);
      this.playerPos.z = THREE.MathUtils.clamp(this.playerPos.z + vz * dt, -WORLD_SEMI_Z + 20, WORLD_SEMI_Z - 20);

      const groundY = getGroundHeight(this.playerPos.x, this.playerPos.z);

      if (inWater) {
        let swimY = 0;
        if (this.keys['Space']) swimY += 12;
        if (this.keys['KeyC'] || this.keys['ControlLeft']) swimY -= 12;
        this.playerVel.y = THREE.MathUtils.damp(this.playerVel.y, swimY, 6, dt);
        this.playerPos.y = Math.max(groundY, this.playerPos.y + this.playerVel.y * dt);
        this.grounded = false;
      } else {
        if (this.keys['Space'] && this.grounded) {
          this.playerVel.y = 28;
          this.grounded = false;
        }
        this.playerVel.y -= 54 * dt;
        this.playerPos.y += this.playerVel.y * dt;
        if (this.playerPos.y <= groundY) {
          this.playerPos.y = groundY;
          this.playerVel.y = 0;
          this.grounded = true;
        }
      }

      // First-person walk/sprint headbob + footsteps + subtle strafe tilt
      if (len > 0 && (this.grounded || inWater)) {
        this.walkBobPhase += dt * (sprinting ? 13 : 9);
        bobOffsetY = Math.sin(this.walkBobPhase) * (sprinting ? 0.22 : 0.13);
        const stepCycle = Math.floor(this.walkBobPhase / Math.PI);
        if (stepCycle !== this.lastFootstepCycle) {
          this.lastFootstepCycle = stepCycle;
          this.audio.playFootstep(inWater);
        }
      }
      this.camRoll = THREE.MathUtils.damp(this.camRoll, -moveR * 0.022, 10, dt);
    }

    // Pure First-Person Camera (smooth FOV + eye height + roll)
    const eyeY = this.playerPos.y + 4.4 + bobOffsetY;
    this.camera.position.set(this.playerPos.x, eyeY, this.playerPos.z);
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = this.camRoll;

    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 8, dt);
      this.camera.updateProjectionMatrix();
    }

    const lookX = this.playerPos.x - Math.sin(this.yaw) * 28 * Math.cos(this.pitch);
    const lookY = eyeY + Math.sin(this.pitch) * 28;
    const lookZ = this.playerPos.z - Math.cos(this.yaw) * 28 * Math.cos(this.pitch);

    this.handlampLight.visible = this.handlampOn && !this.activeVehicleUid;
    this.handlampLight.position.set(this.playerPos.x, eyeY, this.playerPos.z);
    this.handlampLight.target.position.set(lookX, lookY, lookZ);
    this.handlampBeamMesh.visible = this.handlampOn && !this.activeVehicleUid && !this.paused;

    this.vehicleHeadlight.visible = Boolean(this.activeVehicleUid);
    if (this.activeVehicleUid) {
      this.vehicleHeadlight.position.set(this.playerPos.x, eyeY, this.playerPos.z);
      this.vehicleHeadlight.target.position.set(lookX, lookY, lookZ);
    }

    this.sunLight.target.position.copy(this.playerPos);
  }

  private updateFirstPersonViewmodel(dt: number): void {
    if (this.fpEquipDrop > 0) {
      this.fpEquipDrop = Math.max(0, this.fpEquipDrop - dt * 1.4);
    }
    if (this.fpSwingTimer > 0) {
      this.fpSwingTimer = Math.max(0, this.fpSwingTimer - dt);
    }

    if (this.fpToolGroup && this.fpToolGroup.visible) {
      const bobX = Math.cos(this.walkBobPhase * 0.5) * 0.016;
      const bobY = Math.abs(Math.sin(this.walkBobPhase * 0.5)) * -0.018;
      const swing = Math.sin((this.fpSwingTimer / 0.28) * Math.PI);

      this.fpToolGroup.position.set(0.35 + bobX, -0.32 + bobY - this.fpEquipDrop * 0.4, -0.52 - swing * 0.14);
      this.fpToolGroup.rotation.set(-swing * 0.45, -swing * 0.2, 0);

      if (this.fpActiveBeam) {
        const slot = this.hotbar[this.selectedSlot];
        const scanning = slot?.itemId === 'scanner' && this.scanProgress > 0;
        const cutting = slot?.itemId === 'cutter' && this.fpSwingTimer > 0.05;
        this.fpActiveBeam.visible = Boolean(scanning || cutting);
      }
    }
  }

  private updateSkyAndLighting(): void {
    const orbit = this.getOrbitState();
    const elevDeg = getPlanetElevationDeg(this.playerPos.x);
    const elevRad = THREE.MathUtils.degToRad(Math.max(-8, elevDeg));

    this.skyDome.position.copy(this.playerPos);

    // Fixed Tessara sky position along +X
    const skyR = 2600;
    this.tessaraGroup.position.set(
      this.playerPos.x + Math.cos(elevRad) * skyR,
      this.playerPos.y + Math.sin(elevRad) * skyR,
      this.playerPos.z
    );
    this.tessaraGroup.lookAt(this.playerPos);

    const tNorm = (this.orbitSeconds % ORBIT_DURATION) / ORBIT_DURATION;
    const sunAngle = (tNorm - 0.81) * Math.PI * 2;
    const sunX = this.playerPos.x + Math.cos(elevRad) * 2200 * Math.cos(sunAngle);
    const sunY = this.playerPos.y + Math.sin(elevRad) * 2200 + Math.sin(sunAngle) * 700;
    const sunZ = this.playerPos.z + Math.sin(sunAngle) * 2200;
    this.sunMesh.position.set(sunX, sunY, sunZ);
    this.sunLight.position.set(
      this.playerPos.x + Math.cos(sunAngle) * 260,
      Math.max(80, 260 + Math.sin(sunAngle) * 140),
      this.playerPos.z + Math.sin(sunAngle) * 260
    );

    _v3.set(sunX - this.playerPos.x, sunY - this.playerPos.y, sunZ - this.playerPos.z).normalize();
    this.skyMat.uniforms.uSunDir.value.copy(_v3);

    const region = getRegionAt(this.playerPos.x, this.playerPos.z, this.playerPos.y);
    const regCfg = REGION_CONFIG[region];
    const seaY = SEA_LEVEL_Y + (this.playerPos.x < 0 ? orbit.tideOffset * 0.5 : orbit.tideOffset);
    const underwater = this.camera.position.y < seaY && (this.playerPos.x > 890 || this.playerPos.x < -940);

    this.nearWaterMesh.position.y = SEA_LEVEL_Y + orbit.tideOffset;
    this.farWaterMesh.position.y = SEA_LEVEL_Y + orbit.tideOffset * 0.5;

    if (underwater) {
      this.sunLight.intensity = 0.55;
      this.hemiLight.intensity = 0.72;
      this.sunCorona.material.opacity = 0.15;
      _skyZenith.set(0x041e28);
      _skyHorizon.set(0x0b4352);
      this.skyMat.uniforms.uSunStrength.value = 0.15;
      (this.scene.fog as THREE.FogExp2).color.set(0x093542);
      (this.scene.fog as THREE.FogExp2).density = 0.008;
    } else if (orbit.phase === 'Eclipse') {
      this.sunLight.intensity = 0.08;
      this.planetLight.intensity = 0.82;
      this.hemiLight.intensity = 0.24;
      this.sunCorona.material.opacity = 0.09;
      _skyZenith.set(0x040712);
      _skyHorizon.set(0x162044);
      this.skyMat.uniforms.uSunStrength.value = 0.09;
      (this.scene.fog as THREE.FogExp2).color.set(0x0e142d);
      (this.scene.fog as THREE.FogExp2).density = 0.0029;
    } else if (orbit.phase === 'Dusk' || orbit.phase === 'Dawn') {
      this.sunLight.intensity = 0.98;
      this.planetLight.intensity = 0.65;
      this.hemiLight.intensity = 0.7;
      this.sunCorona.material.opacity = 0.5;
      _skyZenith.set(0x131730);
      _skyHorizon.set(0x7c4a48);
      this.skyMat.uniforms.uSunStrength.value = 0.55;
      (this.scene.fog as THREE.FogExp2).color.set(0x523b45);
      (this.scene.fog as THREE.FogExp2).density = 0.0014;
    } else {
      this.sunLight.intensity = region === 'FarSide' ? 0.34 : 2.0;
      this.planetLight.intensity = region === 'FarSide' ? 0.12 : 0.52;
      this.hemiLight.intensity = region === 'FarSide' ? 0.38 : 0.9;
      this.sunCorona.material.opacity = region === 'FarSide' ? 0.2 : 0.7;
      _skyZenith.set(region === 'FarSide' ? 0x05060f : 0x0f1a36);
      _skyHorizon.set(regCfg.fogColor);
      this.skyMat.uniforms.uSunStrength.value = region === 'FarSide' ? 0.2 : 0.8;
      (this.scene.fog as THREE.FogExp2).color.set(regCfg.fogColor);
      (this.scene.fog as THREE.FogExp2).density = 1.35 / regCfg.fogDist;
    }

    this.skyMat.uniforms.uZenith.value.copy(_skyZenith);
    this.skyMat.uniforms.uHorizon.value.copy(_skyHorizon);
  }

  private updateScanning(dt: number): void {
    const slot = this.hotbar[this.selectedSlot];
    if (!this.mouseDown || slot?.itemId !== 'scanner' || this.buildModeId) {
      this.scanProgress = 0;
      this.scanTargetName = null;
      return;
    }

    let target: ScannableWreck | null = null;
    let bestD = 42;
    for (const w of this.wrecks) {
      if (w.scanned) continue;
      const d = Math.hypot(w.x - this.playerPos.x, w.z - this.playerPos.z);
      if (d < bestD) {
        bestD = d;
        target = w;
      }
    }

    if (target) {
      this.scanTargetName = target.name;
      this.scanProgress += dt / 2.2;
      if (Math.random() < 0.15) this.audio.playScanTick(this.scanProgress);
      if (this.scanProgress >= 1) {
        target.scanned = true;
        this.blueprints.add(target.blueprintUnlock);
        if (target.blueprintUnlock === 'cutter') this.blueprints.add('craft_cutter');
        const glow = this.wreckMeshes.get(target.uid)?.getObjectByName('ScanGlow') as THREE.Mesh | undefined;
        if (glow && glow.material instanceof THREE.MeshStandardMaterial) {
          glow.material.color.setHex(0x3ddc84);
          glow.material.emissive.setHex(0x3ddc84);
        }
        const unlockedName =
          BUILDABLES[target.blueprintUnlock]?.name ||
          ITEMS[target.blueprintUnlock]?.name ||
          RECIPES.find((r) => r.unlockBlueprint === target!.blueprintUnlock)?.name ||
          target.blueprintUnlock;
        this.audio.playUnlockChime();
        this.triggerAlert(`BLUEPRINT UNLOCKED: ${unlockedName}`, 'info');
        this.scanProgress = 0;
        this.scanTargetName = null;
        this.emitHud(true);
      }
    } else {
      this.scanProgress = 0;
      this.scanTargetName = null;
    }
  }

  private updateBuildGhost(): void {
    if (!this.buildModeId || !this.buildGhost) return;
    const def = BUILDABLES[this.buildModeId];
    if (!def) return;

    const dist = 16;
    let tx = this.playerPos.x - Math.sin(this.yaw) * dist;
    let tz = this.playerPos.z - Math.cos(this.yaw) * dist;

    let hasNode = true;
    if (def.requiresNode) {
      hasNode = false;
      for (const n of this.nodes.values()) {
        if (n.remaining > 0 && Math.hypot(n.x - tx, n.z - tz) < 12) {
          tx = n.x;
          tz = n.z;
          hasNode = true;
          break;
        }
      }
    } else {
      const grid = def.snapGrid || 2;
      tx = Math.round(tx / grid) * grid;
      tz = Math.round(tz / grid) * grid;
    }

    const ty = getGroundHeight(tx, tz);
    this.buildSnapPos.set(tx, ty, tz);
    this.buildGhost.position.set(tx, ty, tz);
    this.buildGhost.rotation.y = this.buildRotY;

    const waterOk = !def.requiresWater || ty < -4;
    this.buildValid = hasNode && waterOk && this.hasItems(def.cost);
    if (this.buildValid !== this.prevBuildValid) {
      this.prevBuildValid = this.buildValid;
      const col = this.buildValid ? 0x3ddc84 : 0xff4d4d;
      for (const mat of this.buildGhostMats) mat.color.setHex(col);
    }
  }

  private updateFlares(dt: number): void {
    let nearestX = 0;
    let nearestY = 0;
    let nearestZ = 0;
    let nearestDist = 90;
    let nearestIntensity = 0;
    let nearestColor = 0xff6a3d;

    for (let i = this.flares.length - 1; i >= 0; i--) {
      const f = this.flares[i];
      f.ttl -= dt;
      if (f.ttl <= 0) {
        this.scene.remove(f.mesh);
        this.flares.splice(i, 1);
        continue;
      }
      const d = Math.hypot(f.x - this.playerPos.x, f.z - this.playerPos.z);
      if (d < nearestDist) {
        nearestDist = d;
        nearestX = f.x;
        nearestY = f.y + 1.4;
        nearestZ = f.z;
        nearestIntensity = 15 + Math.sin(this.elapsed * 18) * 3;
        nearestColor = 0xff5a40;
      }
    }

    if (nearestIntensity === 0) {
      for (const m of this.machines.values()) {
        if (m.defId === 'heater_t1' && (m.state === 'Running' || m.state === 'Throttled')) {
          const d = Math.hypot(m.x - this.playerPos.x, m.z - this.playerPos.z);
          if (d < nearestDist) {
            nearestDist = d;
            nearestX = m.x;
            nearestY = m.y + 2.6;
            nearestZ = m.z;
            nearestIntensity = 10;
            nearestColor = 0xffa238;
          }
        } else if ((m.defId === 'outpost_pod_t0' || m.defId === 'hab_room_t0') && Math.hypot(m.x - this.playerPos.x, m.z - this.playerPos.z) < 28) {
          nearestX = m.x;
          nearestY = m.y + 6.5;
          nearestZ = m.z;
          nearestIntensity = 6.5;
          nearestColor = 0xfff3d6;
          break;
        }
      }
    }

    this.localWarmLight.intensity = nearestIntensity;
    if (nearestIntensity > 0) {
      this.localWarmLight.color.setHex(nearestColor);
      this.localWarmLight.position.set(nearestX, nearestY, nearestZ);
    }
  }

  private triggerPlayerDamage(amount: number, msg?: string): void {
    const armour = SUIT_SPECS[this.stats.suitTier]?.armour ?? 0;
    const dmg = amount * (1 - armour);
    this.stats.health = Math.max(0, this.stats.health - dmg);
    this.damageFlash = 1.0;
    this.pitch = THREE.MathUtils.clamp(this.pitch + 0.045, -1.25, 1.2);
    this.audio.playDamageHit();
    if (msg) this.triggerAlert(msg, 'danger');
  }

  private updateCreatures(dt: number): void {
    const orbit = this.getOrbitState();
    const isDarkPhase = orbit.phase === 'Dusk' || orbit.phase === 'Eclipse';

    for (const c of this.creatures) {
      if (c.hp <= 0) continue;
      const mesh = this.creatureMeshes.get(c.uid);
      if (!mesh) continue;

      const dPlayer = Math.hypot(c.x - this.playerPos.x, c.z - this.playerPos.z);

      if (c.kind === 'ridge_stalker') {
        mesh.visible = isDarkPhase;
        if (!isDarkPhase) continue;

        const nearFlare = this.flares.some((f) => Math.hypot(f.x - c.x, f.z - c.z) < 42);
        if (nearFlare) {
          c.state = 'retreat';
          c.stateTimer = 3;
        }
      }

      c.stateTimer -= dt;

      if (c.kind === 'plodder' || c.kind === 'skitter') {
        if (c.kind === 'skitter' && dPlayer < 5.5 && !this.activeVehicleUid && c.state !== 'flee') {
          this.triggerPlayerDamage(7, 'Bitten by Sand Skitter! Strike back with Knife [4]!');
          c.state = 'flee';
          c.stateTimer = 4;
        }
        if (c.state === 'flee' || (c.kind === 'plodder' && dPlayer < 16)) {
          c.state = 'flee';
          const ang = Math.atan2(c.x - this.playerPos.x, c.z - this.playerPos.z);
          c.rotY = ang + Math.PI;
          c.x += Math.sin(ang) * 10 * dt;
          c.z += Math.cos(ang) * 10 * dt;
          if (c.stateTimer <= 0) {
            c.state = 'patrol';
            c.stateTimer = 6;
          }
        } else {
          if (c.stateTimer <= 0) {
            c.patrolAngle += (Math.random() - 0.5) * 2.5;
            c.stateTimer = 5 + Math.random() * 5;
          }
          c.x += Math.sin(c.patrolAngle) * 3.5 * dt;
          c.z += Math.cos(c.patrolAngle) * 3.5 * dt;
          c.rotY = c.patrolAngle + Math.PI;
        }
        c.y = getGroundHeight(c.x, c.z);
      } else if (c.kind === 'ridge_stalker' || c.kind === 'cave_lurker') {
        const detectRange = this.handlampOn ? 110 : 48;
        if (c.state === 'retreat') {
          const ang = Math.atan2(c.x - this.playerPos.x, c.z - this.playerPos.z);
          c.x += Math.sin(ang) * 24 * dt;
          c.z += Math.cos(ang) * 24 * dt;
          c.rotY = ang + Math.PI;
          if (c.stateTimer <= 0) {
            c.state = 'patrol';
            c.stateTimer = 4;
          }
        } else if (c.state === 'telegraph') {
          c.rotY = Math.atan2(this.playerPos.x - c.x, this.playerPos.z - c.z) + Math.PI;
          if (c.stateTimer <= 0) {
            c.state = 'lunge';
            c.stateTimer = 0.7;
          }
        } else if (c.state === 'lunge') {
          const ang = Math.atan2(this.playerPos.x - c.x, this.playerPos.z - c.z);
          c.x += Math.sin(ang) * 28 * dt;
          c.z += Math.cos(ang) * 28 * dt;
          if (dPlayer < 6) {
            this.triggerPlayerDamage(22, 'Struck by Stalker! Throw a Road Flare [3] to repel it!');
            c.state = 'retreat';
            c.stateTimer = 5;
          } else if (c.stateTimer <= 0) {
            c.state = 'retreat';
            c.stateTimer = 4;
          }
        } else if (dPlayer < detectRange) {
          c.state = 'telegraph';
          c.stateTimer = 1.2;
          this.audio.playCreatureGrowl(false);
        } else {
          c.patrolAngle += dt * 0.4;
          c.x = c.homeX + Math.cos(c.patrolAngle) * 35;
          c.z = c.homeZ + Math.sin(c.patrolAngle) * 35;
          c.rotY = -c.patrolAngle;
        }
        c.y = getGroundHeight(c.x, c.z);
      } else if (c.kind === 'warden_leviathan') {
        c.patrolAngle += dt * 0.22;
        const targetX = 1260 + Math.cos(c.patrolAngle) * 120;
        const targetZ = Math.sin(c.patrolAngle) * 120;
        const detect = this.handlampOn ? 115 : 55;
        if (dPlayer < detect && this.playerPos.y < -40) {
          const ang = Math.atan2(this.playerPos.x - c.x, this.playerPos.z - c.z);
          c.x += Math.sin(ang) * 19 * dt;
          c.z += Math.cos(ang) * 19 * dt;
          c.y = THREE.MathUtils.damp(c.y, this.playerPos.y, 2, dt);
          c.rotY = ang + Math.PI;
          if (!c.alerted) {
            c.alerted = true;
            this.audio.playCreatureGrowl(true);
            this.triggerAlert('WARDEN LEVIATHAN DETECTED YOU — Kill lights [F] or weave into Trench!', 'danger');
          }
          if (dPlayer < 16) {
            this.stats.health = Math.max(0, this.stats.health - 30 * dt);
            this.damageFlash = Math.max(this.damageFlash, 0.6);
          }
        } else {
          c.alerted = false;
          c.x = THREE.MathUtils.damp(c.x, targetX, 2, dt);
          c.z = THREE.MathUtils.damp(c.z, targetZ, 2, dt);
          c.y = -115 + Math.sin(this.elapsed * 0.7) * 14;
          c.rotY = -c.patrolAngle;
        }
      }

      mesh.position.set(c.x, c.y, c.z);
      mesh.rotation.y = c.rotY;

      if (dPlayer > 240 && c.kind !== 'warden_leviathan') continue;

      // Procedural articulated limb, tail, and serpentine undulation via cached rig refs
      const rig = mesh.userData.rig as CreatureRigRefs | undefined;
      if (rig) {
        const strideRate = c.kind === 'skitter' ? 12 : c.kind === 'plodder' ? 4.5 : 8.5;
        const swing = Math.sin(this.elapsed * strideRate + c.patrolAngle) * (c.kind === 'skitter' ? 0.45 : 0.35);
        if (rig.legFL) rig.legFL.rotation.x = swing;
        if (rig.legBR) rig.legBR.rotation.x = swing;
        if (rig.legFR) rig.legFR.rotation.x = -swing;
        if (rig.legBL) rig.legBL.rotation.x = -swing;
        if (rig.tail) rig.tail.rotation.y = Math.sin(this.elapsed * 3.5 + c.patrolAngle) * 0.25;

        if (rig.segs.length > 0) {
          for (let sIdx = 0; sIdx < rig.segs.length; sIdx++) {
            const seg = rig.segs[sIdx];
            if (seg) {
              seg.position.x = Math.sin(this.elapsed * 2.4 - sIdx * 0.65) * (1.2 + sIdx * 0.45);
              seg.position.y = 8 + Math.cos(this.elapsed * 1.9 - sIdx * 0.5) * 0.9;
            }
          }
        }
      }
    }
  }

  private updateMachineVisuals(): void {
    for (const [uid, m] of this.machines) {
      const mesh = this.machineMeshes.get(uid);
      if (!mesh) continue;
      if (Math.hypot(m.x - this.playerPos.x, m.z - this.playerPos.z) > 220) continue;
      const cap = BUILDABLES[m.defId]?.capacityKws || 1;
      updateMachineModelVisuals(mesh, m.state, this.elapsed, (m.storedEnergy || 0) / cap);
    }

    if (this.lanternCore) this.lanternCore.rotation.y = this.elapsed * 0.6;
    if (this.lanternRing) {
      this.lanternRing.rotation.x = this.elapsed * 0.4;
      this.lanternRing.rotation.y = -this.elapsed * 0.3;
    }
  }

  private emitHud(force: boolean): void {
    const orbit = this.getOrbitState();
    const region = getRegionAt(this.playerPos.x, this.playerPos.z, this.playerPos.y);
    const seaY = SEA_LEVEL_Y + (this.playerPos.x < 0 ? orbit.tideOffset * 0.5 : orbit.tideOffset);
    const underwater = this.playerPos.y + 3.2 < seaY && (this.playerPos.x > 890 || this.playerPos.x < -940);
    const inter = this.getNearestInteractable();

    const camBearing = THREE.MathUtils.radToDeg(Math.atan2(-Math.sin(this.yaw), -Math.cos(this.yaw)));
    const relBearing = ((90 - camBearing + 540) % 360) - 180;

    let act = 1;
    let questTitle = 'Act 1 · Planetshine Plains';
    let questStep = 'Use Scanner [1] on Meridian wreckage near the Cradle to unlock the Cutter & Fabricator.';
    if (this.storyFlags.lantern_resolved) {
      act = 4;
      questTitle = 'Act 4 · The Tidally Locked Future';
      questStep = `Ending unlocked: ${this.ending?.toUpperCase()}. Explore Orrin and expand your industry.`;
    } else if (this.storyFlags.relay_alpha) {
      act = 3;
      questTitle = 'Act 3 · The Near Sea Trench';
      questStep = 'Craft a Pressure Suit (T2) or Needle Sub, then dive into The Trench (+1260, 0) to reach The Lantern.';
    } else if (this.storyFlags.built_furnace || this.blueprints.has('vehicle_dart_t1')) {
      act = 2;
      questTitle = 'Act 2 · Terminator Belt';
      questStep = 'Follow the distress ping west to Relay Alpha (+240, +210) and Terminus Gate (+70, -190).';
    } else if (this.storyFlags.built_pod && this.storyFlags.built_heater) {
      questTitle = 'Act 1 · First Industry';
      questStep = 'Mine Ferrite & build a Furnace [B] to smelt Iron Ingots. Scan the Meridian Wreck Field (+785, +58).';
    } else if (this.blueprints.has('cutter')) {
      questStep = 'Press [B] to build an Outpost Pod & Thermal Heater before the first Eclipse (34:00)!';
    }

    const activeVeh = this.activeVehicleUid ? this.vehicles.get(this.activeVehicleUid) : null;
    const insideShelter = this.isInsideShelter();
    const inPressurizedSub = activeVeh?.defId === 'vehicle_needle_t2';
    const inFarSideHaze = region === 'FarSide' && this.stats.suitTier < 2;
    const airStatus: HudSnapshot['airStatus'] =
      insideShelter || inPressurizedSub
        ? 'pressurized'
        : underwater
        ? 'submerged'
        : inFarSideHaze
        ? 'toxic_haze'
        : 'breathable';

    if (!force && this.paused) return;

    this.onHudUpdate({
      stats: { ...this.stats },
      orbitSeconds: this.orbitSeconds,
      orbitPhase: orbit.phase,
      phaseProgress: orbit.progress,
      timeToEclipseSec: orbit.timeToEclipse,
      tideOffset: orbit.tideOffset,
      tideTrend: orbit.tideTrend,
      region,
      playerPos: {
        x: Math.round(this.playerPos.x),
        y: Math.round(this.playerPos.y),
        z: Math.round(this.playerPos.z),
        rotY: this.yaw,
      },
      planetElevationDeg: Math.round(getPlanetElevationDeg(this.playerPos.x)),
      planetBearingDeg: Math.round(relBearing),
      underwater,
      depthBelowSea: underwater ? Math.round(seaY - this.playerPos.y) : 0,
      airStatus,
      nearHeater: this.isNearRunningHeater(),
      insideShelter,
      handlampOn: this.handlampOn,
      firstPerson: this.firstPerson,
      inVehicle: activeVeh
        ? {
            defId: activeVeh.defId,
            name: BUILDABLES[activeVeh.defId].name,
            speed: Math.round(Math.hypot(activeVeh.vx, activeVeh.vz)),
            batteryPct: Math.round(activeVeh.battery),
          }
        : null,
      hotbar: this.hotbar.map((s) => (s ? { ...s } : null)),
      selectedSlot: this.selectedSlot,
      inventory: this.inventory.map((s) => ({ ...s })),
      blueprints: Array.from(this.blueprints),
      interactionPrompt: inter ? inter.label : null,
      dismantlePrompt:
        !this.activeVehicleUid && !this.buildModeId && this.getNearestDismantleable()
          ? `[X] Dismantle ${BUILDABLES[this.getNearestDismantleable()!.defId]?.name ?? 'Structure'}`
          : null,
      targetInfo: this.getTargetInfo(),
      damageFlash: this.damageFlash,
      scanProgress: this.scanProgress,
      scanTargetName: this.scanTargetName,
      alertBanner: this.activeAlert ? { text: this.activeAlert.text, tone: this.activeAlert.tone } : null,
      buildModeId: this.buildModeId,
      buildValid: this.buildValid,
      production: { ...this.lastProdSummary },
      story: {
        act,
        questTitle,
        questStep,
        flags: { ...this.storyFlags },
        ending: this.ending,
      },
      saveSlot: this.saveSlot,
      orbitSpeedMultiplier: this.orbitSpeedMultiplier,
      mouseSensitivity: this.mouseSensitivity,
      muted: this.audio.isMuted(),
      discoveredLandmarks: Array.from(this.discoveredLandmarks),
      builtStructures: Array.from(this.machines.values()).map((m) => ({
        uid: m.uid,
        defId: m.defId,
        x: m.x,
        z: m.z,
      })),
      vehiclesSummary: Array.from(this.vehicles.values()).map((v) => ({
        uid: v.uid,
        defId: v.defId,
        x: v.x,
        z: v.z,
      })),
      pointerLocked: this.pointerLocked,
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.renderer.domElement.removeEventListener('mousedown', this.onMouseDown);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onWebGlContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onWebGlContextRestored);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    window.removeEventListener('resize', this.onResize);
    this.audio.dispose();
    this.textures.dispose();
    this.renderer.dispose();
  }
}
