import * as THREE from 'three';
import { CAMPFIRE_CONFIG, type CampfireSnapshot } from '@forest-survival/shared';

export class CampfireView {
  private readonly flame = new THREE.Group();
  private readonly zone = new THREE.Mesh(new THREE.RingGeometry(0.99, 1.01, 64), new THREE.MeshBasicMaterial({ color: 0xe6c677, side: THREE.DoubleSide, transparent: true, opacity: 0.65, depthWrite: false }));

  constructor(scene: THREE.Scene, cameraObstacles: THREE.Object3D[]) {
    const fire = CAMPFIRE_CONFIG;
    const root = new THREE.Group();
    root.position.set(fire.position.x, fire.position.y, fire.position.z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(fire.radius, fire.radius, fire.baseHeight, 10), new THREE.MeshStandardMaterial({ color: 0x665c50, roughness: 1 }));
    base.position.y = fire.baseHeight / 2;
    root.add(base);
    cameraObstacles.push(base);
    for (const angle of [-0.6, 0.6]) {
      const log = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.12, 0.18), new THREE.MeshStandardMaterial({ color: 0x68472e, roughness: 1 }));
      log.position.y = fire.baseHeight + 0.04;
      log.rotation.y = angle;
      root.add(log);
    }
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 7), new THREE.MeshBasicMaterial({ color: 0xe9903c }));
    outer.position.y = fire.baseHeight + 0.4;
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 7), new THREE.MeshBasicMaterial({ color: 0xffd77d }));
    inner.position.set(0, fire.baseHeight + 0.28, 0.12);
    this.flame.add(outer, inner);
    root.add(this.flame);
    this.zone.rotation.x = -Math.PI / 2;
    this.zone.position.y = 0.04;
    this.zone.scale.setScalar(fire.safeRadius);
    root.add(this.zone);
    scene.add(root);
  }

  update(snapshot: CampfireSnapshot): void {
    this.flame.visible = snapshot.lit;
    this.zone.visible = snapshot.safeRadius > 0;
    this.zone.scale.setScalar(snapshot.safeRadius);
  }
}
