import * as THREE from 'three';
import { TRAINING_DUMMY } from '@forest-survival/shared';
import type { GameFrame } from '../core/GameView';

export class GameplayView {
  private readonly axe = new THREE.Group();
  private readonly firstPersonAxe = new THREE.Group();
  private readonly dummy = new THREE.Group();
  private readonly selection = new THREE.Box3Helper(new THREE.Box3(), 0xd9ed9b);
  private readonly lootMeshes = new Map<string, THREE.Object3D>();
  private lootGeometry: THREE.BoxGeometry | undefined;
  private lootMaterial: THREE.MeshStandardMaterial | undefined;

  constructor(
    private readonly scene: THREE.Scene,
    player: THREE.Group,
    camera: THREE.PerspectiveCamera,
    private readonly trees: Map<string, THREE.Group>,
    private readonly cameraObstacles: THREE.Object3D[],
  ) {
    this.buildAxe(this.axe);
    this.axe.position.set(0.52, -0.05, 0.15);
    player.add(this.axe);
    this.buildAxe(this.firstPersonAxe);
    this.firstPersonAxe.scale.setScalar(0.75);
    this.firstPersonAxe.position.set(0.32, -0.4, -0.65);
    camera.add(this.firstPersonAxe);
    this.firstPersonAxe.visible = false;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.2, 0.4), new THREE.MeshStandardMaterial({ color: 0x967358, roughness: 1 }));
    body.position.y = 0.75;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshStandardMaterial({ color: 0xc5a67e, roughness: 1 }));
    head.position.y = 1.55;
    this.dummy.add(body, head);
    this.dummy.position.set(TRAINING_DUMMY.position.x, 0, TRAINING_DUMMY.position.z);
    scene.add(this.dummy);
    this.cameraObstacles.push(body, head);
    this.selection.visible = false;
    scene.add(this.selection);
  }

  update(frame: GameFrame): void {
    const gameplay = frame.gameplay;
    const hasAxe = gameplay.equippedItem === 'axe';
    this.axe.visible = hasAxe && !frame.camera.firstPerson;
    this.firstPersonAxe.visible = hasAxe && frame.camera.firstPerson;
    const progress = gameplay.attack.progress;
    const swing = gameplay.attack.phase === 'idle' ? 0 : progress < 0.25 ? -progress * 3.2 : Math.sin((progress - 0.25) / 0.75 * Math.PI) * 1.4;
    this.axe.rotation.x = swing;
    this.firstPersonAxe.rotation.x = -swing;

    for (const resource of gameplay.resources) {
      const group = this.trees.get(resource.id);
      if (!group) continue;
      group.visible = !resource.exhausted;
      if (resource.exhausted) this.removeObstacles(group);
      const trunk = group.children[0];
      if (trunk instanceof THREE.Mesh && trunk.material instanceof THREE.MeshStandardMaterial) {
        trunk.material.emissive.setHex(gameplay.lastHit?.targetId === resource.id && frame.simulationTime - gameplay.lastHit.at < 0.14 ? 0x634224 : 0x000000);
      }
    }
    this.dummy.visible = !gameplay.dummy.dead;
    if (gameplay.dummy.dead) this.removeObstacles(this.dummy);

    for (const mesh of this.lootMeshes.values()) mesh.visible = false;
    for (const item of gameplay.loot) {
      let mesh = this.lootMeshes.get(item.id);
      if (!mesh) {
        if (item.itemId === 'axe') {
          const axe = new THREE.Group();
          this.buildAxe(axe);
          axe.rotation.z = Math.PI / 2;
          axe.scale.setScalar(0.65);
          mesh = axe;
        } else {
          this.lootGeometry ??= new THREE.BoxGeometry(0.55, 0.22, 0.28);
          this.lootMaterial ??= new THREE.MeshStandardMaterial({ color: 0xc69d60, roughness: 1 });
          mesh = new THREE.Mesh(this.lootGeometry, this.lootMaterial);
        }
        mesh.name = item.id;
        this.lootMeshes.set(item.id, mesh);
        this.scene.add(mesh);
      }
      mesh.visible = true;
      mesh.position.set(item.position.x, item.position.y, item.position.z);
    }

    const selected = gameplay.interaction;
    this.selection.visible = !!selected;
    if (selected?.kind === 'tree') {
      const resource = gameplay.resources.find((entry) => entry.id === selected.id);
      if (resource) this.selection.box.setFromCenterAndSize(new THREE.Vector3(resource.position.x, resource.trunkHeight / 2, resource.position.z), new THREE.Vector3(resource.radius * 2 + 0.1, resource.trunkHeight, resource.radius * 2 + 0.1));
    } else if (selected?.kind === 'dummy') {
      this.selection.box.setFromCenterAndSize(new THREE.Vector3(TRAINING_DUMMY.position.x, 0.9, TRAINING_DUMMY.position.z), new THREE.Vector3(0.9, 1.8, 0.6));
    } else if (selected?.kind === 'pickup') {
      const item = gameplay.loot.find((entry) => entry.id === selected.id);
      if (item) this.selection.box.setFromCenterAndSize(new THREE.Vector3(item.position.x, item.position.y, item.position.z), new THREE.Vector3(0.65, 0.3, 0.38));
    }
  }

  private removeObstacles(group: THREE.Group): void {
    for (const child of group.children) {
      const index = this.cameraObstacles.indexOf(child);
      if (index >= 0) this.cameraObstacles.splice(index, 1);
    }
  }

  private buildAxe(root: THREE.Group): void {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 7), new THREE.MeshStandardMaterial({ color: 0x765033, roughness: 1 }));
    handle.position.y = 0.2;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.23, 0.12), new THREE.MeshStandardMaterial({ color: 0xbac2c4, roughness: 0.65, metalness: 0.2 }));
    blade.position.set(0.12, 0.55, 0);
    root.add(handle, blade);
  }
}
