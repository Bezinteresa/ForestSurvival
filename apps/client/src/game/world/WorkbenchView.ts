import * as THREE from 'three';
import { WORKBENCH_CONFIG, type WorkbenchSnapshot } from '@forest-survival/shared';

export class WorkbenchView {
  private readonly root = new THREE.Group();
  private readonly material = new THREE.MeshStandardMaterial({ color: 0x76c6d5, transparent: true, opacity: 0.3, roughness: 1 });
  private readonly top: THREE.Mesh;
  private obstructing = false;

  constructor(scene: THREE.Scene, private readonly obstacles: THREE.Object3D[]) {
    const { position, halfSize } = WORKBENCH_CONFIG;
    this.root.position.set(position.x, position.y - halfSize.y, position.z);
    this.top = new THREE.Mesh(new THREE.BoxGeometry(halfSize.x * 2, 0.16, halfSize.z * 2), this.material);
    this.top.position.y = halfSize.y * 2 - 0.08;
    this.root.add(this.top);
    for (const x of [-0.58, 0.58]) for (const z of [-0.3, 0.3]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.95, 0.12), this.material);
      leg.position.set(x, 0.475, z);
      this.root.add(leg);
    }
    scene.add(this.root);
  }

  update(state: WorkbenchSnapshot): void {
    this.material.color.setHex(state.built ? 0x9b7951 : 0x76c6d5);
    this.material.opacity = state.built ? 1 : 0.3;
    if (this.material.transparent === state.built) { this.material.transparent = !state.built; this.material.needsUpdate = true; }
    this.material.depthWrite = state.built;
    if (state.built && !this.obstructing) { this.obstacles.push(...this.root.children); this.obstructing = true; }
    if (!state.built && this.obstructing) {
      for (const child of this.root.children) { const index = this.obstacles.indexOf(child); if (index >= 0) this.obstacles.splice(index, 1); }
      this.obstructing = false;
    }
  }
}
