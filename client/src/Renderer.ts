import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { GameState } from '@shared/types';
import { GRID_SIZE, WALL_COUNT } from '@shared/constants';

const HALF = GRID_SIZE / 2;
const PADDING = 3;
const SPARK_COUNT = 18;
const SPARK_POOL  = 108;
const SPARK_LIFETIME = 0.7; // seconds

// Food sparkle colors: red → orange → yellow
const FOOD_COLORS = [
  new THREE.Color(1.0, 0.15, 0.08),
  new THREE.Color(1.0, 0.45, 0.08),
  new THREE.Color(1.0, 0.75, 0.15),
  new THREE.Color(1.0, 1.0,  0.30),
];

// Death explosion colors: green → cyan → white
const DEATH_COLORS = [
  new THREE.Color(0.15, 1.0, 0.45),
  new THREE.Color(0.40, 1.0, 0.80),
  new THREE.Color(0.80, 1.0, 0.80),
  new THREE.Color(1.0,  1.0, 1.0 ),
];

// Portal warp colors: purple → magenta → white
const PORTAL_COLORS = [
  new THREE.Color(0.7, 0.15, 1.0),
  new THREE.Color(0.9, 0.3,  1.0),
  new THREE.Color(1.0, 0.5,  1.0),
  new THREE.Color(1.0, 0.85, 1.0),
];

function cellToWorld(x: number, y: number): [number, number] {
  return [x - HALF + 0.5, y - HALF + 0.5];
}

interface Spark {
  mesh: THREE.Mesh;
  mat:  THREE.MeshBasicMaterial;
  vel:  THREE.Vector3;
  peak: THREE.Color;
  life: number;
}

export class Renderer {
  private renderer: THREE.WebGLRenderer;
  private scene:    THREE.Scene;

  private orthoCamera:  THREE.OrthographicCamera;
  private perspCamera:  THREE.PerspectiveCamera;
  private camera:       THREE.Camera;

  private composer:    EffectComposer;
  private renderPass!: RenderPass;
  private bloomPass!:  UnrealBloomPass;

  private keyLight!:  THREE.DirectionalLight;
  private fillLight!: THREE.DirectionalLight;

  private bodyMesh:   THREE.InstancedMesh;
  private headMesh:   THREE.Mesh;
  private foodMesh:   THREE.Mesh;
  private wallMesh:   THREE.InstancedMesh;
  private portalMeshA: THREE.Mesh;
  private portalMeshB: THREE.Mesh;
  private dummy = new THREE.Object3D();

  private sparks: Spark[] = [];

  // Camera params — updated by debug panel (perspective only)
  private camElevation  = 22;
  private camAzimuth    = 90;
  private camZoom       = 50;
  private camFov        = 70;
  private boxHeightMult = 1.0;

  private is3D = false;

  // Death explosion state
  private deathInProgress = false;
  private deathAliveFrom  = 0;
  private deathTimers: ReturnType<typeof setTimeout>[] = [];

  private prevScore      = 0;
  private lastFoodPos    = { x: 0, y: 0 };
  private lastRenderTime = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x03030e);

    this.orthoCamera = this.buildOrthoCamera();
    this.perspCamera = this.buildPerspCamera();
    this.camera      = this.orthoCamera; // default: 2D

    // Key light — visible only in 3D mode
    this.keyLight = new THREE.DirectionalLight(0xffffff, 5.0);
    this.keyLight.position.set(5, -14, 22);
    this.keyLight.visible = false;
    this.scene.add(this.keyLight);

    // Fill light — visible only in 3D mode
    this.fillLight = new THREE.DirectionalLight(0x3355aa, 1.2);
    this.fillLight.position.set(-4, 10, 8);
    this.fillLight.visible = false;
    this.scene.add(this.fillLight);

    // Ambient — always on; carries the 2D neon look
    this.scene.add(new THREE.AmbientLight(0x111133, 1.5));

    this.buildFloor();
    this.buildGrid();
    this.buildBorder();
    this.buildSparks();

    // Snake body
    const bodyGeo = new THREE.BoxGeometry(0.80, 0.80, 0.78);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x00cc77,
      emissive: new THREE.Color(0x004422),
      emissiveIntensity: 1.0,
      roughness: 0.35,
      metalness: 0.65,
    });
    this.bodyMesh = new THREE.InstancedMesh(bodyGeo, bodyMat, GRID_SIZE * GRID_SIZE);
    this.bodyMesh.count = 0;
    this.bodyMesh.scale.z = 0.05; // flat in 2D default
    this.scene.add(this.bodyMesh);

    // Snake head — taller, brighter
    const headGeo = new THREE.BoxGeometry(0.88, 0.88, 1.0);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x00ffaa,
      emissive: new THREE.Color(0x007744),
      emissiveIntensity: 1.0,
      roughness: 0.2,
      metalness: 0.75,
    });
    this.headMesh = new THREE.Mesh(headGeo, headMat);
    this.headMesh.scale.z = 0.05; // flat in 2D default
    this.scene.add(this.headMesh);

    // Food — main bloom target
    const foodGeo = new THREE.BoxGeometry(0.58, 0.58, 0.65);
    const foodMat = new THREE.MeshStandardMaterial({
      color: 0xff2255,
      emissive: new THREE.Color(0xff1144),
      emissiveIntensity: 2.5,
      roughness: 0.15,
      metalness: 0.5,
    });
    this.foodMesh = new THREE.Mesh(foodGeo, foodMat);
    this.scene.add(this.foodMesh);

    // Random wall obstacles — amber/orange so they read clearly as hazards
    const wallGeo = new THREE.BoxGeometry(0.82, 0.82, 0.60);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      emissive: new THREE.Color(0xff4400),
      emissiveIntensity: 2.8,
      roughness: 0.25,
      metalness: 0.5,
    });
    this.wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, WALL_COUNT * 2);
    this.wallMesh.count = 0;
    this.wallMesh.scale.z = 0.05;
    this.scene.add(this.wallMesh);

    // Portal rings — flat ring geometry with additive purple glow
    const portalGeo = new THREE.RingGeometry(0.28, 0.46, 10);
    const portalMat = new THREE.MeshBasicMaterial({
      color: 0xcc44ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.portalMeshA = new THREE.Mesh(portalGeo, portalMat.clone());
    this.portalMeshB = new THREE.Mesh(portalGeo, portalMat.clone());
    this.portalMeshA.visible = false;
    this.portalMeshB.visible = false;
    this.scene.add(this.portalMeshA);
    this.scene.add(this.portalMeshB);

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.7, 0.4, 0.55
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', this.onResize);
  }

  private buildOrthoCamera(): THREE.OrthographicCamera {
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    cam.position.set(0, 0, 100);
    cam.lookAt(0, 0, 0);
    this.applyOrthoFrustum(cam);
    return cam;
  }

  private buildPerspCamera(): THREE.PerspectiveCamera {
    const aspect = window.innerWidth / window.innerHeight;
    const cam = new THREE.PerspectiveCamera(this.camFov, aspect, 0.5, 400);
    this.positionCamera(cam);
    return cam;
  }

  private applyOrthoFrustum(cam: THREE.OrthographicCamera = this.orthoCamera): void {
    const aspect = window.innerWidth / window.innerHeight;
    const size   = HALF + PADDING + 1; // 24 world units half-extent
    if (aspect >= 1) {
      cam.left   = -size * aspect;
      cam.right  =  size * aspect;
      cam.top    =  size;
      cam.bottom = -size;
    } else {
      cam.left   = -size;
      cam.right  =  size;
      cam.top    =  size / aspect;
      cam.bottom = -size / aspect;
    }
    cam.updateProjectionMatrix();
  }

  private positionCamera(cam: THREE.PerspectiveCamera = this.perspCamera): void {
    const el = this.camElevation * Math.PI / 180;
    const az = this.camAzimuth   * Math.PI / 180;
    const d  = this.camZoom;
    cam.position.set(
      d * Math.cos(el) * Math.cos(az),
      -d * Math.cos(el) * Math.sin(az),
      d * Math.sin(el)
    );
    cam.lookAt(0, HALF * 0.15, 0);
    cam.updateProjectionMatrix();
  }

  // ── Debug panel setters ──────────────────────────────────────────────────

  set3DMode(enabled: boolean): void {
    this.is3D = enabled;
    this.camera = enabled ? this.perspCamera : this.orthoCamera;
    this.renderPass.camera = this.camera;
    this.keyLight.visible  = enabled;
    this.fillLight.visible = enabled;
    const zScale = enabled ? this.boxHeightMult : 0.05;
    this.bodyMesh.scale.z = zScale;
    this.headMesh.scale.z = zScale;
    this.wallMesh.scale.z = zScale;
  }

  setCamera(elevation: number, azimuth: number, zoom: number): void {
    this.camElevation = elevation;
    this.camAzimuth   = azimuth;
    this.camZoom      = zoom;
    this.positionCamera();
  }

  setFov(fov: number): void {
    this.camFov = fov;
    this.perspCamera.fov = fov;
    this.perspCamera.updateProjectionMatrix();
  }

  setBoxHeight(mult: number): void {
    this.boxHeightMult = mult;
    if (this.is3D) {
      this.bodyMesh.scale.z = mult;
      this.headMesh.scale.z = mult;
      this.wallMesh.scale.z = mult;
    }
  }

  // Project a grid cell to CSS screen coordinates for floating UI labels
  projectCell(cx: number, cy: number): { x: number; y: number } {
    const [wx, wy] = cellToWorld(cx, cy);
    const v = new THREE.Vector3(wx, wy, 0.3);
    v.project(this.camera);
    return {
      x: (v.x + 1) / 2 * window.innerWidth,
      y: (-v.y + 1) / 2 * window.innerHeight,
    };
  }

  setBloom(strength: number, threshold: number): void {
    this.bloomPass.strength  = strength;
    this.bloomPass.threshold = threshold;
  }

  private buildFloor(): void {
    const geo = new THREE.PlaneGeometry(GRID_SIZE + 12, GRID_SIZE + 12);
    const mat = new THREE.MeshStandardMaterial({ color: 0x060614, roughness: 0.95, metalness: 0.1 });
    const floor = new THREE.Mesh(geo, mat);
    floor.position.z = -0.42;
    this.scene.add(floor);
  }

  private buildGrid(): void {
    const pts: number[] = [];
    const z = -0.15;
    for (let i = 0; i <= GRID_SIZE; i++) {
      const p = i - HALF;
      pts.push(p, -HALF, z,  p,  HALF, z);
      pts.push(-HALF, p, z,  HALF, p, z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x1a2878,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.scene.add(new THREE.LineSegments(geo, mat));
  }

  private buildBorder(): void {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3377ff,
      emissive: new THREE.Color(0x2266ff),
      emissiveIntensity: 2.0,
      roughness: 0.1,
      metalness: 0.8,
    });
    const h = HALF;
    const t = 0.14;
    const sides: [number, number, number, number][] = [
      [0,  h, GRID_SIZE + t * 2, t],
      [0, -h, GRID_SIZE + t * 2, t],
      [-h, 0, t, GRID_SIZE],
      [ h, 0, t, GRID_SIZE],
    ];
    for (const [x, y, w, hh] of sides) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, hh, 0.35), mat);
      mesh.position.set(x, y, 0.05);
      this.scene.add(mesh);
    }
  }

  private buildSparks(): void {
    const geo = new THREE.SphereGeometry(0.1, 5, 4);
    for (let i = 0; i < SPARK_POOL; i++) {
      const peak = FOOD_COLORS[Math.floor(Math.random() * FOOD_COLORS.length)].clone();
      const mat = new THREE.MeshBasicMaterial({
        color: peak.clone(),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.sparks.push({ mesh, mat, vel: new THREE.Vector3(), peak, life: 0 });
    }
  }

  private spawnBurst(
    wx: number, wy: number,
    count: number,
    colors: THREE.Color[],
    speedScale = 1.0,
  ): void {
    let spawned = 0;
    for (const s of this.sparks) {
      if (spawned >= count) break;
      if (s.life > 0) continue;
      s.peak.copy(colors[Math.floor(Math.random() * colors.length)]);
      s.mesh.position.set(wx, wy, 0.3);
      const angle = Math.random() * Math.PI * 2;
      const speed = (5 + Math.random() * 8) * speedScale;
      s.vel.set(
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        (3 + Math.random() * 6) * speedScale,
      );
      s.life = SPARK_LIFETIME * (0.7 + Math.random() * 0.6);
      s.mesh.visible = true;
      spawned++;
    }
  }

  // ── Public: chain-explode snake on death ─────────────────────────────────

  explodeSnakeDeath(segments: { x: number; y: number }[], onDone: () => void): void {
    this.deathInProgress = true;
    this.deathAliveFrom  = 0;
    this.foodMesh.visible = false;

    const DELAY = 55;

    this.deathTimers = segments.map((seg, i) =>
      setTimeout(() => {
        const [wx, wy] = cellToWorld(seg.x, seg.y);
        this.spawnBurst(wx, wy, i === 0 ? 22 : 12, DEATH_COLORS, 1.1);
        this.deathAliveFrom = i + 1;
      }, i * DELAY)
    );

    this.deathTimers.push(
      setTimeout(() => {
        this.deathInProgress = false;
        this.deathAliveFrom  = 0;
        this.foodMesh.visible = true;
        onDone();
      }, segments.length * DELAY + 450)
    );
  }

  private updateSparks(dt: number): void {
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vel.z -= 18 * dt;
      s.mesh.position.x += s.vel.x * dt;
      s.mesh.position.y += s.vel.y * dt;
      s.mesh.position.z += s.vel.z * dt;
      const t     = Math.max(0, s.life / SPARK_LIFETIME);
      const eased = t * t;
      s.mat.color.copy(s.peak).multiplyScalar(eased);
      s.mat.opacity = eased;
      if (s.life <= 0) {
        s.mesh.visible = false;
        s.mat.opacity  = 0;
      }
    }
  }

  render(state: GameState, time: number): void {
    const dt = Math.min((time - this.lastRenderTime) / 1000, 0.05);
    this.lastRenderTime = time;

    const { snake, food } = state;

    // Detect eat — food sparkles at where food was before respawn
    if (state.score !== this.prevScore) {
      const [wx, wy] = cellToWorld(this.lastFoodPos.x, this.lastFoodPos.y);
      this.spawnBurst(wx, wy, SPARK_COUNT, FOOD_COLORS);
      this.prevScore = state.score;
    }
    this.lastFoodPos = { ...food.position };

    this.updateSparks(dt);

    // ── Snake rendering — respects death explosion progress ──────────────
    const aliveFrom = this.deathInProgress ? this.deathAliveFrom : 0;

    this.headMesh.visible = aliveFrom === 0 && snake.segments.length > 0;
    if (this.headMesh.visible) {
      const [hx, hy] = cellToWorld(snake.segments[0].x, snake.segments[0].y);
      this.headMesh.position.set(hx, hy, 0.06);
    }

    const bodyStart = aliveFrom === 0 ? 1 : aliveFrom;
    const bodyCount = Math.max(0, snake.segments.length - bodyStart);
    for (let i = 0; i < bodyCount; i++) {
      const seg = snake.segments[bodyStart + i];
      const [wx, wy] = cellToWorld(seg.x, seg.y);
      this.dummy.position.set(wx, wy, 0);
      this.dummy.updateMatrix();
      this.bodyMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.bodyMesh.count = bodyCount;
    this.bodyMesh.instanceMatrix.needsUpdate = true;

    // Food — pulse + slow rotation
    const [fx, fy] = cellToWorld(food.position.x, food.position.y);
    const pulse  = 0.82 + 0.18 * Math.sin(time * 0.005);
    const foodZ  = this.is3D ? pulse * this.boxHeightMult : 0.05;
    this.foodMesh.position.set(fx, fy, 0.06);
    this.foodMesh.scale.set(pulse, pulse, foodZ);
    if (this.is3D) this.foodMesh.rotation.z = time * 0.001;

    // Walls
    for (let i = 0; i < state.walls.length; i++) {
      const w = state.walls[i];
      const [wx, wy] = cellToWorld(w.x, w.y);
      this.dummy.position.set(wx, wy, 0);
      this.dummy.updateMatrix();
      this.wallMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.wallMesh.count = state.walls.length;
    this.wallMesh.instanceMatrix.needsUpdate = true;

    // Portals
    if (state.portals) {
      const { a, b } = state.portals;
      const [ax, ay] = cellToWorld(a.x, a.y);
      const [bx, by] = cellToWorld(b.x, b.y);
      const scaleA = 0.85 + 0.15 * Math.sin(time * 0.003);
      const scaleB = 0.85 + 0.15 * Math.sin(time * 0.003 + Math.PI);
      this.portalMeshA.visible = true;
      this.portalMeshA.position.set(ax, ay, 0.12);
      this.portalMeshA.rotation.z =  time * 0.0018;
      this.portalMeshA.scale.setScalar(scaleA);
      this.portalMeshB.visible = true;
      this.portalMeshB.position.set(bx, by, 0.12);
      this.portalMeshB.rotation.z = -time * 0.0018;
      this.portalMeshB.scale.setScalar(scaleB);
    } else {
      this.portalMeshA.visible = false;
      this.portalMeshB.visible = false;
    }

    // Portal warp burst — fires the frame the teleport happens
    if (state.portalUsed && state.portals) {
      const { a, b } = state.portals;
      const [ax, ay] = cellToWorld(a.x, a.y);
      const [bx, by] = cellToWorld(b.x, b.y);
      this.spawnBurst(ax, ay, 10, PORTAL_COLORS, 0.75);
      this.spawnBurst(bx, by, 10, PORTAL_COLORS, 0.75);
    }

    this.composer.render();
  }

  private onResize = (): void => {
    if (this.is3D) {
      this.perspCamera.aspect = window.innerWidth / window.innerHeight;
      this.perspCamera.updateProjectionMatrix();
    } else {
      this.applyOrthoFrustum();
    }
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  };

  destroy(): void {
    for (const t of this.deathTimers) clearTimeout(t);
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }
}
