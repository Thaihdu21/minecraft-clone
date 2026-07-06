'use strict';
/* ============ renderer.js — Three.js scene, sky, weather, particles ============ */
class Renderer {
  constructor() {
    this.canvas = document.getElementById('gl');
    this.r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false });
    this.r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 600);
    this.scene.fog = new THREE.Fog(0x87ceeb, 20, 100);
    /* atlas texture */
    this.atlasTex = new THREE.CanvasTexture(Atlas.canvas);
    this.atlasTex.magFilter = THREE.NearestFilter;
    this.atlasTex.minFilter = THREE.NearestFilter;
    this.materials = {
      op: new THREE.MeshLambertMaterial({ map: this.atlasTex, vertexColors: true, side: THREE.DoubleSide }),
      cut: new THREE.MeshLambertMaterial({ map: this.atlasTex, vertexColors: true, side: THREE.DoubleSide, alphaTest: 0.4, transparent: true }),
      wat: new THREE.MeshLambertMaterial({ map: this.atlasTex, vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.75, depthWrite: false })
    };
    /* lights */
    this.ambient = new THREE.AmbientLight(0xffffff, 0.7);
    this.sun = new THREE.DirectionalLight(0xffffff, 0.9);
    this.scene.add(this.ambient, this.sun);
    /* sky */
    this.skyGroup = new THREE.Group();
    this.sunMesh = new THREE.Mesh(new THREE.PlaneGeometry(34, 34),
      new THREE.MeshBasicMaterial({ color: 0xffe27a, fog: false }));
    this.moonMesh = new THREE.Mesh(new THREE.PlaneGeometry(24, 24),
      new THREE.MeshBasicMaterial({ color: 0xd8dcee, fog: false }));
    this.skyGroup.add(this.sunMesh, this.moonMesh);
    const starGeo = new THREE.BufferGeometry(), starPos = [];
    for (let i = 0; i < 500; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.acos(Math.random() * 2 - 1);
      starPos.push(400 * Math.sin(b) * Math.cos(a), Math.abs(400 * Math.cos(b)), 400 * Math.sin(b) * Math.sin(a));
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, transparent: true, opacity: 0, fog: false, sizeAttenuation: false }));
    this.skyGroup.add(this.stars);
    this.scene.add(this.skyGroup);
    /* clouds */
    this.clouds = new THREE.Group();
    for (let i = 0; i < 18; i++) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(24 + Math.random() * 30, 14 + Math.random() * 16),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
      c.rotation.x = -Math.PI / 2;
      c.position.set((Math.random() - 0.5) * 500, 76 + Math.random() * 6, (Math.random() - 0.5) * 500);
      this.clouds.add(c);
    }
    this.scene.add(this.clouds);
    /* particles */
    const PMAX = this.PMAX = 800;
    this.pGeo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(PMAX * 3).fill(-9999);
    this.pCol = new Float32Array(PMAX * 3);
    this.pVel = new Float32Array(PMAX * 3);
    this.pLife = new Float32Array(PMAX);
    this.pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    this.pGeo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.pts = new THREE.Points(this.pGeo,
      new THREE.PointsMaterial({ size: 0.15, vertexColors: true, transparent: true }));
    this.pts.frustumCulled = false;
    this.scene.add(this.pts);
    this.pHead = 0;
    /* rain */
    const RMAX = this.RMAX = 700;
    this.rGeo = new THREE.BufferGeometry();
    this.rPos = new Float32Array(RMAX * 3).fill(-9999);
    this.rGeo.setAttribute('position', new THREE.BufferAttribute(this.rPos, 3));
    this.rain = new THREE.Points(this.rGeo,
      new THREE.PointsMaterial({ color: 0x88aadd, size: 0.12, transparent: true, opacity: 0.7 }));
    this.rain.frustumCulled = false; this.rain.visible = false;
    this.scene.add(this.rain);
    /* block highlight */
    this.highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
      new THREE.LineBasicMaterial({ color: 0x000000 }));
    this.scene.add(this.highlight);
    this.flashT = 0;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }
  resize() {
    this.r.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
  burst(x, y, z, col, n) {
    for (let i = 0; i < n; i++) {
      const p = this.pHead = (this.pHead + 1) % this.PMAX;
      this.pPos[p * 3] = x; this.pPos[p * 3 + 1] = y; this.pPos[p * 3 + 2] = z;
      this.pVel[p * 3] = (Math.random() - 0.5) * 5;
      this.pVel[p * 3 + 1] = Math.random() * 5;
      this.pVel[p * 3 + 2] = (Math.random() - 0.5) * 5;
      this.pCol[p * 3] = col[0] * (0.7 + Math.random() * 0.3);
      this.pCol[p * 3 + 1] = col[1] * (0.7 + Math.random() * 0.3);
      this.pCol[p * 3 + 2] = col[2] * (0.7 + Math.random() * 0.3);
      this.pLife[p] = 0.6 + Math.random() * 0.5;
    }
    this.pGeo.attributes.color.needsUpdate = true;
  }
  update(dt, tod, camPos, weather) {
    /* particles */
    for (let i = 0; i < this.PMAX; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      this.pVel[i * 3 + 1] -= 12 * dt;
      this.pPos[i * 3] += this.pVel[i * 3] * dt;
      this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt;
      this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
      if (this.pLife[i] <= 0) this.pPos[i * 3 + 1] = -9999;
    }
    this.pGeo.attributes.position.needsUpdate = true;
    /* rain */
    const raining = weather !== 'clear';
    this.rain.visible = raining;
    if (raining) {
      for (let i = 0; i < this.RMAX; i++) {
        let y = this.rPos[i * 3 + 1];
        if (y < -100 || y < camPos.y - 10 || Math.abs(this.rPos[i * 3] - camPos.x) > 30) {
          this.rPos[i * 3] = camPos.x + (Math.random() - 0.5) * 55;
          this.rPos[i * 3 + 1] = camPos.y + 20 + Math.random() * 15;
          this.rPos[i * 3 + 2] = camPos.z + (Math.random() - 0.5) * 55;
        } else this.rPos[i * 3 + 1] = y - 28 * dt;
      }
      this.rGeo.attributes.position.needsUpdate = true;
      if (weather === 'thunder' && Math.random() < dt * 0.12) {
        this.flashT = 0.18; Sound.thunder();
      }
    }
    this.flashT -= dt;
    /* sky */
    const a = tod * Math.PI * 2;                 // tod 0 = dawn, .25 = noon
    const sunH = Math.sin(a);
    let dayF = Math.max(0, Math.min(1, sunH * 2 + 0.25));
    Game.dayFactor = dayF;
    const storm = raining ? 0.6 : 1;
    const day = new THREE.Color(0x87ceeb), night = new THREE.Color(0x0a0e24);
    const sky = night.clone().lerp(day, dayF).multiplyScalar(storm);
    if (this.flashT > 0) sky.setScalar(1);
    this.scene.background = sky;
    this.scene.fog.color.copy(sky);
    const R = Game.renderDist * 16;
    this.scene.fog.near = R * 0.45; this.scene.fog.far = R * 0.95;
    this.camera.far = R * 3; this.camera.updateProjectionMatrix();
    this.ambient.intensity = 0.25 + 0.6 * dayF * storm;
    this.sun.intensity = Math.max(0, sunH) * storm;
    this.sun.position.set(Math.cos(a) * 100, Math.sin(a) * 100, 30);
    this.skyGroup.position.copy(camPos);
    this.sunMesh.position.set(Math.cos(a) * 380, Math.sin(a) * 380, 0);
    this.moonMesh.position.set(-Math.cos(a) * 380, -Math.sin(a) * 380, 0);
    this.sunMesh.lookAt(camPos); this.moonMesh.lookAt(camPos);
    this.stars.material.opacity = Math.max(0, 1 - dayF * 2);
    /* clouds drift */
    this.clouds.position.y = 0;
    this.clouds.children.forEach(c => {
      c.position.x += dt * 1.5;
      if (c.position.x - camPos.x > 260) c.position.x -= 520;
      if (c.position.x - camPos.x < -260) c.position.x += 520;
      if (c.position.z - camPos.z > 260) c.position.z -= 520;
      if (c.position.z - camPos.z < -260) c.position.z += 520;
    });
  }
  render() { this.r.render(this.scene, this.camera); }
}
