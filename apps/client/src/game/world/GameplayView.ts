import * as THREE from 'three';
import { CAMP_STORAGE, TEST_MATERIAL_NODES, TEST_BERRY_BUSHES, TRAINING_DUMMY, isTool, type ToolId, type MaterialId, type FoodId } from '@forest-survival/shared';
import type { GameFrame } from '../core/GameView';
import { CAMPFIRE_CONFIG } from '@forest-survival/shared';
import { CampfireView } from './CampfireView';
import { WorkbenchView } from './WorkbenchView';
import { WORKBENCH_CONFIG } from '@forest-survival/shared';

export class GameplayView {
  private readonly campfire: CampfireView;
  private readonly workbench: WorkbenchView;
  private readonly axe = new THREE.Group();
  private readonly firstPersonAxe = new THREE.Group();
  private readonly dummy = new THREE.Group();
  private readonly selection = new THREE.Box3Helper(new THREE.Box3(), 0xd9ed9b);
  private readonly bushes = new Map<string, THREE.Group>();
  private readonly lootMeshes = new Map<string, THREE.Object3D>();
  private lootGeometry: THREE.BoxGeometry | undefined;
  private readonly lootMaterials = new Map<MaterialId | FoodId, THREE.MeshStandardMaterial>();

  constructor(
    private readonly scene: THREE.Scene,
    player: THREE.Group,
    camera: THREE.PerspectiveCamera,
    private readonly trees: Map<string, THREE.Group>,
    private readonly cameraObstacles: THREE.Object3D[],
  ) {
    this.campfire = new CampfireView(scene, cameraObstacles);
    this.workbench = new WorkbenchView(scene, cameraObstacles);
    this.buildAxe(this.axe);
    this.axe.position.set(0.52, -0.05, 0.15);
    player.add(this.axe);
    this.buildAxe(this.firstPersonAxe);
    // Low in the right corner: the tool head must not cover the crosshair or a third of the view.
    this.firstPersonAxe.scale.setScalar(0.6);
    this.firstPersonAxe.position.set(0.36, -0.6, -0.85);
    this.firstPersonAxe.rotation.z = 0.15;
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
    for (const node of TEST_MATERIAL_NODES) {
      const group = new THREE.Group();
      group.position.set(node.position.x, node.position.y, node.position.z);
      const geometry = node.kind === 'scrap-pile' ? new THREE.BoxGeometry(1.4, 2, 1.1) : new THREE.DodecahedronGeometry(1, 0);
      const body = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: node.kind === 'coal-vein' ? 0x414953 : node.kind === 'rock' ? 0x7c8588 : 0x8d6250, roughness: 0.9, metalness: node.kind === 'scrap-pile' ? 0.4 : 0 }));
      body.scale.set(node.radius, node.height / 2, node.radius);
      body.position.y = node.height / 2;
      group.add(body);
      scene.add(group);
      this.trees.set(node.id, group);
      this.cameraObstacles.push(body);
    }
    for (const bush of TEST_BERRY_BUSHES) {
      const root = new THREE.Group();
      root.position.set(bush.position.x, bush.position.y, bush.position.z);
      const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 7), new THREE.MeshStandardMaterial({ color: 0x385e35, roughness: 1 }));
      leaves.position.y = 0.35;
      leaves.scale.y = 0.65;
      root.add(leaves);
      const fruit = new THREE.Group();
      for (let index = 0; index < bush.stock; index++) {
        const berry = new THREE.Mesh(new THREE.SphereGeometry(0.08, 7, 6), new THREE.MeshStandardMaterial({ color: 0xc34562, roughness: 0.8 }));
        berry.position.set((index - 1) * 0.2, 0.57, 0.12);
        fruit.add(berry);
      }
      root.add(fruit);
      scene.add(root);
      this.bushes.set(bush.id, fruit);
    }
    const storage = CAMP_STORAGE;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(storage.halfSize.x * 2, storage.halfSize.y * 2, storage.halfSize.z * 2), new THREE.MeshStandardMaterial({ color: 0x9f854f, roughness: 1 }));
    crate.position.set(storage.position.x, storage.position.y, storage.position.z);
    scene.add(crate);
    this.cameraObstacles.push(crate);
    this.selection.visible = false;
    scene.add(this.selection);
  }

  update(frame: GameFrame): void {
    const gameplay = frame.gameplay;
    const hasAxe = gameplay.equippedItem !== 'none';
    if (gameplay.equippedItem !== 'none') {
      this.shapeTool(this.axe, gameplay.equippedItem);
      this.shapeTool(this.firstPersonAxe, gameplay.equippedItem);
    }
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
    for (const bush of gameplay.bushes) {
      const fruit = this.bushes.get(bush.id);
      fruit?.children.forEach((berry, index) => { berry.visible = index < bush.remaining; });
    }
    this.dummy.visible = !gameplay.dummy.dead;
    if (gameplay.dummy.dead) this.removeObstacles(this.dummy);

    for (const mesh of this.lootMeshes.values()) mesh.visible = false;
    for (const item of gameplay.loot) {
      let mesh = this.lootMeshes.get(item.id);
      if (!mesh) {
        if (isTool(item.itemId)) {
          const axe = new THREE.Group();
          this.buildAxe(axe);
          this.shapeTool(axe, item.itemId);
          axe.rotation.z = Math.PI / 2;
          axe.scale.setScalar(0.65);
          mesh = axe;
        } else {
          this.lootGeometry ??= new THREE.BoxGeometry(0.55, 0.22, 0.28);
          let material = this.lootMaterials.get(item.itemId);
          if (!material) {
            material = new THREE.MeshStandardMaterial({ color: { wood: 0xc69d60, stone: 0x9aa5aa, scrap: 0xb7785b, coal: 0x414953, berries: 0xc34562 }[item.itemId], roughness: 1 });
            this.lootMaterials.set(item.itemId, material);
          }
          mesh = new THREE.Mesh(this.lootGeometry, material);
        }
        mesh.name = item.id;
        this.lootMeshes.set(item.id, mesh);
        this.scene.add(mesh);
      }
      mesh.visible = true;
      mesh.position.set(item.position.x, item.position.y, item.position.z);
    }

    const selected = gameplay.interaction;
    this.campfire.update(gameplay.campfire);
    this.workbench.update(gameplay.workbench);
    this.selection.visible = !!selected;
    if (selected?.kind === 'tree' || selected?.kind === 'resource') {
      const resource = gameplay.resources.find((entry) => entry.id === selected.id);
      if (resource) this.selection.box.setFromCenterAndSize(new THREE.Vector3(resource.position.x, resource.trunkHeight / 2, resource.position.z), new THREE.Vector3(resource.radius * 2 + 0.1, resource.trunkHeight, resource.radius * 2 + 0.1));
    } else if (selected?.kind === 'bush') {
      const bush = gameplay.bushes.find((entry) => entry.id === selected.id);
      if (bush) this.selection.box.setFromCenterAndSize(new THREE.Vector3(bush.position.x, bush.position.y + 0.4, bush.position.z), new THREE.Vector3(1, 0.8, 1));
    } else if (selected?.kind === 'campfire') {
      const fire = CAMPFIRE_CONFIG;
      this.selection.box.setFromCenterAndSize(new THREE.Vector3(fire.position.x, fire.position.y + 0.6, fire.position.z), new THREE.Vector3(fire.radius * 2, 1.2, fire.radius * 2));
    } else if (selected?.kind === 'workbench') {
      const { position, halfSize } = WORKBENCH_CONFIG;
      this.selection.box.setFromCenterAndSize(new THREE.Vector3(position.x, position.y, position.z), new THREE.Vector3(halfSize.x * 2, halfSize.y * 2, halfSize.z * 2));
    } else if (selected?.kind === 'storage') {
      this.selection.box.setFromCenterAndSize(new THREE.Vector3(CAMP_STORAGE.position.x, CAMP_STORAGE.position.y, CAMP_STORAGE.position.z), new THREE.Vector3(1.3, 1.1, 0.9));
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

  private shapeTool(root: THREE.Group, tool: ToolId): void {
    const head = root.getObjectByName('tool-head');
    if (!head) return;
    head.scale.set(tool === 'pickaxe' ? 2 : 1, tool === 'pickaxe' ? 0.4 : 1, 1);
    head.position.x = tool === 'pickaxe' ? 0 : 0.12;
  }

  private buildAxe(root: THREE.Group): void {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 7), new THREE.MeshStandardMaterial({ color: 0x765033, roughness: 1 }));
    handle.position.y = 0.2;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.23, 0.12), new THREE.MeshStandardMaterial({ color: 0xbac2c4, roughness: 0.65, metalness: 0.2 }));
    blade.name = 'tool-head';
    blade.position.set(0.12, 0.55, 0);
    root.add(handle, blade);
  }
}
