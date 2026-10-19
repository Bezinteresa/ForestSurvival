import * as THREE from 'three';
import { TEST_WORLD } from '@forest-survival/shared';
import { GameplayView } from './GameplayView';
import { DayNightView } from './DayNightView';
import { getCameraPlacement } from '../player/CameraController';
import { resolveCameraCollision } from '../player/CameraCollision';
import type { GameFrame, GameView } from '../core/GameView';

export class SceneView implements GameView {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 150);
  private readonly player = new THREE.Group();
  private readonly cameraObstacles: THREE.Object3D[] = [];
  private readonly trees = new Map<string, THREE.Group>();
  private gameplayView: GameplayView | undefined;
  private dayNightView: DayNightView | undefined;
  get canvas(): HTMLCanvasElement { return this.renderer.domElement; }
  private readonly debugLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x65ffe1, depthTest: false }));
  private observer: ResizeObserver | undefined;
  private destroyed = false;
  private readonly onContextLost: (event: Event) => void;

  static create(host: HTMLElement, onError: (error: unknown) => void): SceneView {
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'default' });
    } catch (cause) {
      throw new Error('Не удалось запустить 3D. Проверьте поддержку WebGL 2 и аппаратное ускорение браузера.', { cause });
    }
    return new SceneView(host, renderer, onError);
  }

  private constructor(private readonly host: HTMLElement, private readonly renderer: THREE.WebGLRenderer, onError: (error: unknown) => void) {
    this.onContextLost = (event) => {
      event.preventDefault();
      onError(new Error('Браузер потерял 3D-контекст. Закройте лишние вкладки и запустите сцену снова.'));
    };
    try {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.domElement.setAttribute('aria-label', 'Тестовая лесная поляна');
      renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
      host.appendChild(renderer.domElement);
      this.populate();
      this.observer = new ResizeObserver(this.resize);
      this.observer.observe(host);
      this.resize();
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  render(frame: GameFrame): void {
    if (this.destroyed) return;
    this.player.position.set(frame.playerPosition.x, frame.playerPosition.y, frame.playerPosition.z);
    this.player.rotation.y = frame.playerYaw;
    this.gameplayView?.update(frame);
    this.dayNightView?.update(frame.clock);
    const placement = getCameraPlacement(frame.playerPosition, frame.camera);
    const position = frame.camera.firstPerson ? placement.position : resolveCameraCollision(placement.target, placement.position, this.cameraObstacles);
    this.camera.position.set(position.x, position.y, position.z);
    if (frame.camera.firstPerson) this.camera.lookAt(placement.target.x, placement.target.y, placement.target.z);
    else {
      const dx = position.x - placement.target.x, dy = position.y - placement.target.y, dz = position.z - placement.target.z;
      if (Math.hypot(dx, dy, dz) < 0.001) this.camera.lookAt(position.x + Math.sin(frame.camera.yaw), position.y - Math.tan(frame.camera.pitch), position.z - Math.cos(frame.camera.yaw));
      else this.camera.lookAt(placement.target.x, placement.target.y, placement.target.z);
    }
    // A camera pushed against an obstacle shows the view as from the eyes instead of a head filling the screen.
    this.player.visible = !frame.camera.firstPerson && this.camera.position.distanceTo(this.player.position) > 1.4;
    this.debugLines.visible = !!frame.debugGeometry;
    if (frame.debugGeometry) {
      const vertices = frame.debugGeometry.vertices;
      const attribute = this.debugLines.geometry.getAttribute('position');
      if (attribute && attribute.array.length === vertices.length) {
        (attribute.array as Float32Array).set(vertices);
        attribute.needsUpdate = true;
      } else {
        this.debugLines.geometry.dispose();
        this.debugLines.geometry = new THREE.BufferGeometry();
        this.debugLines.geometry.setAttribute('position', new THREE.BufferAttribute(vertices.slice(), 3));
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.observer?.disconnect();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.Line) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private readonly resize = (): void => {
    if (this.destroyed) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.renderer.render(this.scene, this.camera);
  };

  private populate(): void {
    this.dayNightView = new DayNightView(this.scene);
    this.camera.position.set(18, 16, 23);
    this.camera.lookAt(0, 0.6, 0);

    const floor = TEST_WORLD.ground;
    const ground = this.mesh(new THREE.BoxGeometry(floor.halfSize.x * 2, floor.halfSize.y * 2, floor.halfSize.z * 2), 0x65824c);
    ground.position.set(floor.position.x, floor.position.y, floor.position.z);
    this.scene.add(ground);
    this.cameraObstacles.push(ground);

    const clearing = this.mesh(new THREE.CylinderGeometry(5.8, 5.8, 0.025, 40), 0x9b9563);
    clearing.position.y = 0.014;
    this.scene.add(clearing);

    for (const wall of TEST_WORLD.walls) {
      const mesh = this.mesh(new THREE.BoxGeometry(wall.halfSize.x * 2, wall.halfSize.y * 2, wall.halfSize.z * 2), wall.id.startsWith('border') ? 0x455544 : 0x8b7962);
      mesh.name = wall.id;
      mesh.position.set(wall.position.x, wall.position.y, wall.position.z);
      this.scene.add(mesh);
      this.cameraObstacles.push(mesh);
    }
    for (const tree of TEST_WORLD.trees) {
      const group = new THREE.Group();
      group.name = tree.id;
      group.position.set(tree.position.x, 0, tree.position.z);
      const trunk = this.mesh(new THREE.CylinderGeometry(tree.radius, tree.radius, tree.trunkHeight, 7), 0x6c4930);
      trunk.position.y = tree.trunkHeight / 2;
      const crown = this.mesh(new THREE.ConeGeometry(1.7, 3.3, 7), 0x2e573c);
      // The crown starts above head height so a player chopping the trunk stands under it, not inside it.
      crown.position.y = tree.trunkHeight + 1.35;
      const upperCrown = this.mesh(new THREE.ConeGeometry(1.2, 2.6, 7), 0x3a6943);
      upperCrown.position.y = tree.trunkHeight + 2.45;
      group.add(trunk, crown, upperCrown);
      this.scene.add(group);
      this.trees.set(tree.id, group);
      // The raised crown blocks the camera like any obstacle; standing at the trunk no longer puts the camera ray inside it.
      this.cameraObstacles.push(trunk, crown, upperCrown);
    }
    this.player.name = 'local-player';
    const body = this.mesh(new THREE.BoxGeometry(0.64, 0.72, 0.38), 0xc99e4d);
    const head = this.mesh(new THREE.BoxGeometry(0.43, 0.43, 0.43), 0xe8c394);
    head.position.y = 0.6;
    this.player.add(body, head);
    for (const x of [-0.18, 0.18]) {
      const leg = this.mesh(new THREE.BoxGeometry(0.24, 0.5, 0.3), 0x354951);
      leg.position.set(x, -0.61, 0);
      const arm = this.mesh(new THREE.BoxGeometry(0.2, 0.68, 0.28), 0xe8c394);
      arm.position.set(x * 2.6, -0.04, 0);
      this.player.add(leg, arm);
    }
    const backpack = this.mesh(new THREE.BoxGeometry(0.46, 0.5, 0.22), 0x4d6444);
    backpack.position.set(0, 0, -0.29);
    this.player.add(backpack);
    this.scene.add(this.player);
    this.debugLines.visible = false;
    this.debugLines.renderOrder = 10;
    this.debugLines.frustumCulled = false;
    this.scene.add(this.debugLines);
    this.scene.add(this.camera);
    this.gameplayView = new GameplayView(this.scene, this.player, this.camera, this.trees, this.cameraObstacles);
    this.scene.updateMatrixWorld(true);
  }

  private mesh(geometry: THREE.BufferGeometry, color: number): THREE.Mesh {
    return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 1 }));
  }
}
