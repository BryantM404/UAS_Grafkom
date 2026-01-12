import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

let scene, camera, renderer, controls, cameraPivot;
let playerGroup, playerModel, mixer;
let animations = {};
let currentAction;

let moveForward = false,
  moveBackward = false,
  moveLeft = false,
  moveRight = false;
let canJump = false;
let velocity = new THREE.Vector3();

let terrainObjects = [];
const raycaster = new THREE.Raycaster();
const downVector = new THREE.Vector3(0, -1, 0);

let prevTime = performance.now();

const playerScale = 0.8;
const jumpPower = 20;
const gravity = 50;
const moveSpeed = 14;

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 50, 600);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
  );
  cameraPivot = new THREE.Object3D();
  scene.add(cameraPivot);
  cameraPivot.add(camera);
  camera.position.set(0, 4, 8);

  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(50, 300, 50);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  scene.add(sun);

  playerGroup = new THREE.Group();
  playerGroup.position.set(0, 10, 0);
  scene.add(playerGroup);

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
          if (c.material) {
            c.material.side = THREE.DoubleSide;
            c.material.shadowSide = THREE.DoubleSide;
          }
        }
      });
      scene.add(valley);
      terrainObjects.push(valley);

      const groundGeo = new THREE.PlaneGeometry(3000, 3000);
      const groundMat = new THREE.MeshStandardMaterial({
        color: 0x4e7537,
        roughness: 1,
      });
      const infiniteFloor = new THREE.Mesh(groundGeo, groundMat);
      infiniteFloor.rotation.x = -Math.PI / 2;
      infiniteFloor.position.y = -2.5;
      infiniteFloor.receiveShadow = true;
      scene.add(infiniteFloor);
      terrainObjects.push(infiniteFloor);

      loader.load("assets/Animated Woman.glb", (gltf) => {
        playerModel = gltf.scene;
        playerModel.scale.set(playerScale, playerScale, playerScale);
        playerModel.position.y = 0;
        playerModel.traverse((c) => {
          if (c.isMesh) c.castShadow = true;
        });
        playerGroup.add(playerModel);

        mixer = new THREE.AnimationMixer(playerModel);
        gltf.animations.forEach((clip) => {
          animations[clip.name.toLowerCase()] = mixer.clipAction(clip);
        });
        fadeToAction("idle");

        document.getElementById("loading").style.display = "none";
      });
    },
    undefined,
    (error) => {
      console.error("Terjadi kesalahan saat memuat valley:", error);
      document.getElementById("loading").innerText = "Gagal Memuat Model";
    }
  );

  controls = new PointerLockControls(cameraPivot, document.body);
  controls.minPolarAngle = 0.5;
  controls.maxPolarAngle = Math.PI - 0.5;

  document.addEventListener("click", () => controls.lock());

  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyW") moveForward = true;
    if (e.code === "KeyS") moveBackward = true;
    if (e.code === "KeyA") moveLeft = true;
    if (e.code === "KeyD") moveRight = true;
    if (e.code === "Space" && canJump) {
      velocity.y = jumpPower;
      canJump = false;
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "KeyW") moveForward = false;
    if (e.code === "KeyS") moveBackward = false;
    if (e.code === "KeyA") moveLeft = false;
    if (e.code === "KeyD") moveRight = false;
  });

  window.addEventListener("resize", onWindowResize);

  animate();
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function fadeToAction(name, duration = 0.2) {
  let targetKey = Object.keys(animations).find((k) => k.includes(name));
  if (!targetKey) return;
  const action = animations[targetKey];
  if (action === currentAction) return;
  if (currentAction) currentAction.fadeOut(duration);
  action.reset().fadeIn(duration).play();
  currentAction = action;
}

function animate() {
  requestAnimationFrame(animate);
  const time = performance.now();
  const delta = Math.min((time - prevTime) / 1000, 0.05);

  if (mixer) mixer.update(delta);

  if (controls && controls.isLocked && playerGroup) {
    velocity.y -= gravity * delta;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
      cameraPivot.quaternion
    );
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(
      forward,
      new THREE.Vector3(0, 1, 0)
    );

    let moveDir = new THREE.Vector3(0, 0, 0);
    if (moveForward) moveDir.add(forward);
    if (moveBackward) moveDir.sub(forward);
    if (moveLeft) moveDir.sub(right);
    if (moveRight) moveDir.add(right);

    let targetX = playerGroup.position.x;
    let targetZ = playerGroup.position.z;

    if (moveDir.length() > 0) {
      moveDir.normalize();
      targetX += moveDir.x * moveSpeed * delta;
      targetZ += moveDir.z * moveSpeed * delta;
      playerModel.rotation.y = Math.atan2(moveDir.x, moveDir.z);
    }

    playerGroup.position.x = targetX;
    playerGroup.position.z = targetZ;

    const nextPos = playerGroup.position.clone();
    const potentialY = nextPos.y + velocity.y * delta;

    let onGround = false;
    let groundHeight = -999;

    if (terrainObjects.length > 0) {
      const rayOrigin = new THREE.Vector3(
        nextPos.x,
        nextPos.y + 50,
        nextPos.z
      );
      raycaster.set(rayOrigin, downVector);
      const intersects = raycaster.intersectObjects(terrainObjects, true);

      if (intersects.length > 0) {
        const hit = intersects[0];
        if (hit.point.y > potentialY - 1.0 && velocity.y <= 0) {
          groundHeight = hit.point.y;
          onGround = true;
        }
      }
    }

    if (onGround) {
      playerGroup.position.y = groundHeight;
      velocity.y = 0;
      canJump = true;
    } else {
      playerGroup.position.y = potentialY;
      canJump = false;
    }

    if (!canJump) fadeToAction("jump");
    else if (moveDir.length() > 0) fadeToAction("run");
    else fadeToAction("idle");

    if (playerGroup.position.y < -50) {
      playerGroup.position.set(0, 10, 0);
      velocity.y = 0;
    }

    cameraPivot.position.set(
      playerGroup.position.x,
      playerGroup.position.y + 1,
      playerGroup.position.z
    );
    document.getElementById("height").innerText = Math.max(
      0,
      Math.floor(playerGroup.position.y)
    );
  }

  prevTime = time;
  renderer.render(scene, camera);
}

init();