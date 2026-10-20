import * as THREE from 'three';
import { BUILD_SITES, BUILDING_DEFINITIONS, type BuildingPreview, type BuildingSnapshot } from '@forest-survival/shared';

export class CampBuildingView {
  private readonly markers = new Map<string, THREE.Mesh>();
  private readonly meshes = new Map<string, THREE.Group>();
  private readonly ghostMaterial = new THREE.MeshStandardMaterial({ color: 0x65dd91, transparent: true, opacity: 0.45, depthWrite: false });
  private readonly ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.ghostMaterial);

  constructor(private readonly scene: THREE.Scene, private readonly obstacles: THREE.Object3D[]) {
    const material = new THREE.MeshStandardMaterial({ color: 0x568e9c, transparent: true, opacity: 0.35, depthWrite: false });
    const geometry = new THREE.RingGeometry(0.55, 0.65, 20);
    for (const site of BUILD_SITES) {
      const marker = new THREE.Mesh(geometry, material);
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(site.position.x, 0.025, site.position.z);
      this.markers.set(site.id, marker); scene.add(marker);
    }
    this.ghost.visible = false; scene.add(this.ghost);
  }

  update(buildings: readonly BuildingSnapshot[], preview?: BuildingPreview): void {
    for (const entry of buildings) {
      this.markers.get(entry.siteId)!.visible = false;
      if (this.meshes.has(entry.id)) continue;
      const root = new THREE.Group();
      root.position.set(entry.position.x, 0, entry.position.z);
      root.rotation.y = entry.rotation * Math.PI / 2;
      const material = new THREE.MeshStandardMaterial({ color: entry.kind === 'storage' ? 0x9f854f : 0x87633d, roughness: 1 });
      const add = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material); mesh.position.set(x, y, z); root.add(mesh); this.obstacles.push(mesh);
      };
      if (entry.kind === 'storage') { const size = BUILDING_DEFINITIONS.storage.halfSize; add(0, size.y, 0, size.x * 2, size.y * 2, size.z * 2); }
      else {
        for (const x of [-1, 1]) add(x, 0.6, 0, 0.16, 1.2, 0.4);
        for (const y of [0.25, 0.6, 0.95]) add(0, y, 0, 2.4, 0.22, 0.2);
      }
      this.scene.add(root); this.meshes.set(entry.id, root);
    }
    this.ghost.visible = !!preview?.box;
    if (preview?.box) {
      const box = preview.box;
      this.ghost.position.set(box.position.x, box.position.y, box.position.z);
      this.ghost.scale.set(box.halfSize.x * 2, box.halfSize.y * 2, box.halfSize.z * 2);
      this.ghostMaterial.color.setHex(preview.result.accepted ? 0x65dd91 : 0xe46860);
    }
  }
}
