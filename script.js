import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

let scene, camera, renderer, controls;

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 50, 600);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
  );
  camera.position.set(0, 50, 100);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.minDistance = 5;
  controls.maxDistance = 500;

  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(50, 300, 50);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  scene.add(sun);

  const groundGeo = new THREE.PlaneGeometry(3000, 3000);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x546a46,
    roughness: 1,
  });
  const infiniteFloor = new THREE.Mesh(groundGeo, groundMat);
  infiniteFloor.rotation.x = -Math.PI / 2;
  infiniteFloor.position.y = -2.5;
  infiniteFloor.receiveShadow = true;
  scene.add(infiniteFloor);

  const loader = new GLTFLoader();
  loader.load(
    "assets/Valley Terrain.glb",
    (gltf) => {
      const valley = gltf.scene;
      const box = new THREE.Box3().setFromObject(valley);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);

      const targetSize = 180;
      const scaleFactor = targetSize / Math.max(size.x, size.z);
      valley.scale.set(scaleFactor, scaleFactor, scaleFactor);
      valley.position.x = -center.x * scaleFactor;
      valley.position.z = -center.z * scaleFactor;
      valley.position.y = -box.min.y * scaleFactor - 4.5;

      valley.traverse((c) => {
        if (c.isMesh) {
          c.receiveShadow = true;
          c.castShadow = true;
          if (c.material) c.material.side = THREE.DoubleSide;
        }
      });
      scene.add(valley);
      document.getElementById("loading").style.display = "none";
    },
    undefined,
    (error) => {
      console.error("Terjadi kesalahan saat memuat valley:", error);
      document.getElementById("loading").innerText = "Gagal Memuat Model";
    }
  );

  window.addEventListener("resize", onWindowResize);

  animate();
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
init();