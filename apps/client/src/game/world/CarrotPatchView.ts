import * as THREE from 'three';
import type { CarrotPatchSnapshot } from '@forest-survival/shared';

/** Render finite wild plants from snapshots; the session owns all stock and item IDs. */
export class CarrotPatchView {
  private readonly patches = new Map<string, THREE.Group[]>();
  constructor(private readonly scene: THREE.Scene) {}

  update(patches: readonly (CarrotPatchSnapshot & { readonly growth?: number })[]): void {
    for (const patch of patches) {
      let plants = this.patches.get(patch.id);
      if (!plants) {
        const root = new THREE.Group();
        root.position.set(patch.position.x, patch.position.y, patch.position.z);
        const soil = new THREE.Mesh(new THREE.CircleGeometry(0.6, 14), new THREE.MeshStandardMaterial({ color: 0x66503a, roughness: 1 }));
        soil.rotation.x = -Math.PI / 2; soil.position.y = 0.015; root.add(soil);
        const orange = new THREE.MeshStandardMaterial({ color: 0xe88a32, roughness: 1 });
        const green = new THREE.MeshStandardMaterial({ color: 0x6d9b46, roughness: 1 });
        const vegetable = new THREE.ConeGeometry(0.1, 0.3, 7);
        const leaf = new THREE.BoxGeometry(0.05, 0.3, 0.06);
        plants = [];
        for (let index = 0; index < patch.stock; index++) {
          const plant = new THREE.Group();
          const angle = index / patch.stock * Math.PI * 2;
          plant.position.set(Math.cos(angle) * 0.3, 0, Math.sin(angle) * 0.3);
          const carrot = new THREE.Mesh(vegetable, orange);
          carrot.rotation.z = Math.PI; carrot.position.y = 0.16; plant.add(carrot);
          for (const tilt of [-0.55, 0, 0.55]) {
            const blade = new THREE.Mesh(leaf, green);
            blade.rotation.z = tilt; blade.position.set(Math.sin(tilt) * 0.1, 0.4, 0); plant.add(blade);
          }
          root.add(plant); plants.push(plant);
        }
        this.scene.add(root); this.patches.set(patch.id, plants);
      }
      plants.forEach((plant, index) => { plant.visible = index < patch.remaining; plant.scale.setScalar(patch.growth ?? 1); });
    }
  }
}
