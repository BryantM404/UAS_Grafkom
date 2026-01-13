import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

  let scene, camera, renderer, controls, cameraPivot;
  let playerGroup, playerModel, mixer;
  let animations = {};
  let currentAction;

  let moveForward = false;
  let moveBackward = false;
  let moveLeft = false;
  let moveRight = false;
  let isSprinting = false;
  let canJump = false;
  let velocity = new THREE.Vector3();

let islandColliders = [];
let terrainObjects = [];
const raycaster = new THREE.Raycaster();
const downVector = new THREE.Vector3(0, -1, 0);

// Reusable boxes for collision detection (performance optimization)
let footBox = new THREE.Box3();
let bodyBox = new THREE.Box3();

let prevTime = performance.now();

const playerScale = 0.8;
const jumpPower = 20;
const gravity = 50;
const moveSpeed = 14;
const sprintSpeed = 18;
const playerRadius = 0.3;
const playerHeight = 1.6;
const maxStepHeight = 1.6;

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 50, 600);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2 for performance
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // Update shadows manually when needed
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.gammaFactor = 2.2;
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

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(50, 300, 50);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 4096; // Reduced from 16384
  sun.shadow.mapSize.height = 4096; // Reduced from 16384
  sun.shadow.radius = 8; // Reduced from 12
  sun.shadow.bias = -0.00005;
  sun.shadow.normalBias = 0.02;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 1000;
  sun.shadow.camera.left = -100;
  sun.shadow.camera.right = 100;
  sun.shadow.camera.top = 100;
  sun.shadow.camera.bottom = -100;
  scene.add(sun);

  playerGroup = new THREE.Group();
  playerGroup.position.set(0, 195, 0);
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
          c.castShadow = false; // Only receive shadow
          if (c.material) {
            c.material.side = THREE.DoubleSide;
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
      infiniteFloor.castShadow = false;
      scene.add(infiniteFloor);
      terrainObjects.push(infiniteFloor);

      loader.load("assets/Animated Woman.glb", (gltf) => {
        playerModel = gltf.scene;
        playerModel.scale.set(playerScale, playerScale, playerScale);
        playerModel.position.y = 0;
        playerModel.traverse((c) => {
          if (c.isMesh) {
            c.castShadow = true;
            c.receiveShadow = false;
          }
        });
        playerGroup.add(playerModel);

        mixer = new THREE.AnimationMixer(playerModel);
        gltf.animations.forEach((clip) => {
          animations[clip.name.toLowerCase()] = mixer.clipAction(clip);
        });
        fadeToAction("idle");

        loadValley(loader);
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
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") isSprinting = true;
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
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") isSprinting = false;
  });

  window.addEventListener("resize", onWindowResize);

  animate();
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function loadValley(loader) {
        const groundGeo = new THREE.PlaneGeometry(3000, 3000);
        const groundMat = new THREE.MeshStandardMaterial({
          color: 0x62a348, 
          roughness: 1,
        });
        const infiniteFloor = new THREE.Mesh(groundGeo, groundMat);
        infiniteFloor.rotation.x = -Math.PI / 2;
        infiniteFloor.position.y = -2.5;
        infiniteFloor.receiveShadow = true;
        scene.add(infiniteFloor);
        terrainObjects.push(infiniteFloor);

        loader.load("assets/Valley Terrain.glb", (gltf) => {
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

          valley.updateMatrixWorld(true);
          valley.traverse((c) => {
            if (c.isMesh) {
              c.receiveShadow = true;
              c.castShadow = true;
              if (c.material) c.material.side = THREE.DoubleSide;
            }
          });
          scene.add(valley);
          terrainObjects.push(valley);

          loadBigIsland(loader);
        });
      }

      function loadBigIsland(loader) {
        loader.load("assets/Pulau2.glb", (gltf) => {
          const bigIsland = gltf.scene;
          bigIsland.position.set(0, 185, 0);

          const scale = 60;
          bigIsland.scale.set(scale, scale, scale);

          bigIsland.traverse((c) => {
            if (c.isMesh) {
              c.castShadow = true;
              c.receiveShadow = true;
              if (c.material) c.material.side = THREE.DoubleSide;
            }
          });

          scene.add(bigIsland);
          terrainObjects.push(bigIsland);

          loadIslands(loader);
          loadUpperPlatforms(loader);
        });
      }

      function loadIslands(loader) {
        loader.load("assets/Island.glb", (gltf) => {
          document.getElementById("loading").style.display = "none";
          const model = gltf.scene;

          const totalPlatforms = 300;
          const heightStep = 3.5;
          const startHeight = 1.5;

          for (let i = 0; i < totalPlatforms; i++) {
            let angle = i * 0.25;
            let y = startHeight + i * heightStep;

            let baseRadius = 45 + Math.sin(i * 0.5) * 10;
            if (y > 160 && y < 190) {
              const progress = (y - 160) / (190 - 160);
              baseRadius = THREE.MathUtils.lerp(baseRadius, 15, progress);
            }

            const x = Math.cos(angle) * baseRadius;
            const z = Math.sin(angle) * baseRadius;

            if (y > 190) continue;

            let scaleVal = Math.max(4, 7 - i * 0.01);
            if (i % 20 === 0) scaleVal = 12;

            createIsland(model, x, y, z, [scaleVal, 1, scaleVal]);
          }
        });
      }

      function loadUpperPlatforms(loader) {
        loader.load("assets/Flower.glb", (gltf) => {
          const sourceModel = gltf.scene;
          sourceModel.rotation.x = -Math.PI / 15; // rotate flower 

          const count = 20;
          const startY = 190; 
          const heightInc = 1.5;
          const zDistance = 5.0;

          const colliderGeo = new THREE.BoxGeometry(2.5, 0.2, 8.0);
          const colliderMat = new THREE.MeshBasicMaterial({
            visible: false,
          });

          for (let i = 0; i < count; i++) {
            const y = startY + i * heightInc;
            const currentZ = 20 + i * zDistance;
            const currentX = Math.sin(i * 0.25) * 35;

            const nextZ = 20 + (i + 1) * zDistance;
            const nextX = Math.sin((i + 1) * 0.25) * 35;

            const container = new THREE.Group();
            container.position.set(currentX, y, currentZ);
            container.lookAt(nextX, y, nextZ);

            const p = sourceModel.clone();
            const s = 2.5;
            p.scale.set(s, s, s);
            p.position.z = 2.5;
            container.add(p);

            p.traverse((c) => {
              if (c.isMesh) {
                c.castShadow = true;
                c.receiveShadow = true;
                if (c.material) c.material.side = THREE.DoubleSide;
              }
            });

            const collider = new THREE.Mesh(colliderGeo, colliderMat);
            collider.position.z = 2.5;
            container.add(collider);

            scene.add(container);
            terrainObjects.push(container);
          }

          loadSecondIsland(loader);
          loadTrees(loader);
          loadRocks(loader);
        });
      }

      function loadSecondIsland(loader) {
        loader.load("assets/Swamp Island.glb", (gltf) => {
          const finalIsland = gltf.scene;
          finalIsland.rotation.y = -Math.PI / 2; 
          const endY = 190 + 20 * 1.5;     
          finalIsland.position.set(
            Math.sin(20 * 0.25) * 35,
            endY + 6,                    
            20 + 20 * 5.0 + 20             
);

          const scale = 8;
          finalIsland.scale.set(scale, scale, scale);

          finalIsland.traverse((c) => {
            if (c.isMesh) {
              c.castShadow = true;
              c.receiveShadow = true;
              if (c.material) c.material.side = THREE.DoubleSide;
            }
          });

          scene.add(finalIsland);
          terrainObjects.push(finalIsland);
        });
      }

      function createIsland(sourceModel, x, y, z, scale) {
        const p = sourceModel.clone();
        p.position.set(x, y, z);
        p.scale.set(scale[0], scale[1], scale[2]);
        p.traverse((c) => {
          if (c.isMesh) {
            c.receiveShadow = true;
            c.castShadow = true;
          }
        });
        scene.add(p);
        islandColliders.push(new THREE.Box3().setFromObject(p));
      }

      function loadTrees(loader) {
      loader.load("assets/Tree.glb", (gltf) => {
        const treeModel = gltf.scene;

        const treeCount = 500;          // jumlah pohon
        const minRadius = 100; 
        const maxRadius = 800;
        const groundY = -2.5;

        for (let i = 0; i < treeCount; i++) {
          const tree = treeModel.clone();

          // biar ngacak dan diluar snowy hills
          const angle = Math.random() * Math.PI * 2;
          const radius = minRadius + Math.random() * (maxRadius - minRadius);
          const x = Math.cos(angle) * radius;
          const z = Math.sin(angle) * radius;

          // Pohon ditempatkan di dasar tanah
          const y = groundY;

          const scale = 1.5 + Math.random() * 1.5; // 1.5–3
          tree.scale.set(scale, scale, scale);

          tree.position.set(x, y, z);

          tree.traverse((c) => {
            if (c.isMesh) {
              c.castShadow = true;
              c.receiveShadow = true;
              if (c.material) c.material.side = THREE.DoubleSide;
            }
          });

          scene.add(tree);
          // terrainObjects.push(tree);
        }
      });
    }

      function loadRocks(loader) {
      loader.load("assets/Resource Gold.glb", (gltf) => {
        const rockModel = gltf.scene;

        const rockCount = 100;         
        const minRadius = 120;        
        const maxRadius = 400;        
        const groundY = -2.5;        

        for (let i = 0; i < rockCount; i++) {
          const rock = rockModel.clone();

          // diluar snowy hills
          const angle = Math.random() * Math.PI * 2;
          const radius = minRadius + Math.random() * (maxRadius - minRadius);
          const x = Math.cos(angle) * radius;
          const z = Math.sin(angle) * radius;

          const y = groundY + 0.5;

          const scale = 20 + Math.random() * 5; 
          rock.scale.set(scale, scale, scale);

          rock.position.set(x, y, z);

          rock.traverse((c) => {
            if (c.isMesh) {
              c.castShadow = true;
              c.receiveShadow = true;
              if (c.material) c.material.side = THREE.DoubleSide;
            }
          });

          scene.add(rock);
          terrainObjects.push(rock);
        }
      });
    }

function fadeToAction(name, duration = 0.2) {
  let targetKey = Object.keys(animations).find((k) => k.includes(name));
  if (!targetKey) return;
  const action = animations[targetKey];
  if (action === currentAction) return;
  if (currentAction) currentAction.fadeOut(duration);
  action.reset().fadeIn(duration).play();
  currentAction = action;
  return action;
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
      const currentSpeed = isSprinting ? sprintSpeed : moveSpeed;
      targetX += moveDir.x * currentSpeed * delta;
      targetZ += moveDir.z * currentSpeed * delta;
      playerModel.rotation.y = Math.atan2(moveDir.x, moveDir.z);
    }


          let isBlocked = false;

          if (terrainObjects.length > 0) {

            const rayOriginTop = new THREE.Vector3(
              targetX,
              playerGroup.position.y + 2.5, 
              targetZ
            );
            raycaster.set(rayOriginTop, downVector);
            const intersects = raycaster.intersectObjects(terrainObjects, true);

            if (intersects.length > 0) {
              const groundHeightAtTarget = intersects[0].point.y;
              const currentHeight = playerGroup.position.y;
              const heightDiff = groundHeightAtTarget - currentHeight;

              if (heightDiff > maxStepHeight) {
                isBlocked = true;
              }
            }
          }

          if (!isBlocked) {
            playerGroup.position.x = targetX;
            playerGroup.position.z = targetZ;
          }

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

    // Reuse pre-allocated boxes instead of creating new ones
    footBox.setFromCenterAndSize(
      new THREE.Vector3(nextPos.x, potentialY + 0.5, nextPos.z),
      new THREE.Vector3(0.6, 1.0, 0.6)
    );

    bodyBox.setFromCenterAndSize(
      new THREE.Vector3(nextPos.x, potentialY + 0.8, nextPos.z),
      new THREE.Vector3(0.6, 1.6, 0.6)
    );

          for (let box of islandColliders) {
            if (footBox.intersectsBox(box)) {
              if (
                velocity.y <= 0 &&
                playerGroup.position.y >= box.max.y - 0.5
              ) {
                if (box.max.y > groundHeight) {
                  groundHeight = box.max.y;
                  onGround = true;
                }
              }
            }
            if (bodyBox.intersectsBox(box)) {
              const overlapY = Math.min(
                bodyBox.max.y - box.min.y,
                box.max.y - bodyBox.min.y
              );
              if (overlapY > 0.2 && playerGroup.position.y < box.max.y - 0.1) {
                playerGroup.position.x -= targetX - playerGroup.position.x;
                playerGroup.position.z -= targetZ - playerGroup.position.z;
              }
              if (velocity.y > 0 && playerGroup.position.y < box.min.y) {
                velocity.y = -2;
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

    if (!canJump) {
      fadeToAction("jump");
      if (currentAction) currentAction.timeScale = 1.0;
    } else if (moveDir.length() > 0) {
      const runAction = fadeToAction("run");
      if (runAction) {
        runAction.timeScale = isSprinting ? 1.5 : 1.0;
      } else if (currentAction) {
        currentAction.timeScale = isSprinting ? 1.5 : 1.0;
      }
    } else {
      fadeToAction("idle");
      if (currentAction) currentAction.timeScale = 1.0;
    }

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