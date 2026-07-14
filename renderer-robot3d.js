(function () {
  function createRobot3DController(deps) {
    const { petEl, petStage, robot3DHost, container } = deps;
    let robot3D = null;
    let robot3DResizeObserver = null;
    let robot3DWindowResizeHandler = null;

    function resizeRobot3D() {
  if (!robot3D) return;
  const width = petStage.clientWidth || petEl.width || 64;
  const height = petStage.clientHeight || petEl.height || 64;
  robot3D.renderer.setSize(width, height, false);
  robot3D.camera.aspect = width / height;
  robot3D.camera.updateProjectionMatrix();
}


    function setRobot3DTarget(nx, ny, lift) {
  if (!robot3D) return;
  robot3D.state.targetX = nx * 0.6;
  robot3D.state.targetY = -ny * 0.42;
  robot3D.state.targetZ = nx * 0.14;
  robot3D.state.targetLift = lift * 0.08;
}


    function resetRobot3DTarget() {
  if (!robot3D) return;
  robot3D.state.targetX = 0;
  robot3D.state.targetY = 0;
  robot3D.state.targetZ = 0;
  robot3D.state.targetLift = 0;
}


    function disposeRobot3D() {
  if (robot3DResizeObserver) {
    robot3DResizeObserver.disconnect();
    robot3DResizeObserver = null;
  }
  if (robot3DWindowResizeHandler) {
    window.removeEventListener('resize', robot3DWindowResizeHandler);
    robot3DWindowResizeHandler = null;
  }
  if (robot3D) {
    if (robot3D.animationId) {
      cancelAnimationFrame(robot3D.animationId);
      robot3D.animationId = null;
    }
    robot3D.renderer.dispose();
    robot3D = null;
  }
  container.classList.remove('robot-3d-ready');
}


    function initRobot3D() {
  disposeRobot3D();
  if (!robot3DHost) return null;
  const THREE = window.THREE;
  if (!window.THREE || typeof THREE.WebGLRenderer !== 'function') {
    console.warn('[robot-3d] THREE unavailable, fallback to 2D rendering.');
    return null;
  }

  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  } catch (error) {
    console.warn('[robot-3d] WebGL unavailable, fallback to 2D rendering.', error);
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  } else if ('outputEncoding' in renderer && THREE.sRGBEncoding) {
    renderer.outputEncoding = THREE.sRGBEncoding;
  }
  renderer.domElement.className = 'robot-3d-canvas';
  robot3DHost.replaceChildren(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0.15, 8);

  const rig = new THREE.Group();
  scene.add(rig);

  const ambient = new THREE.AmbientLight(0xffffff, 1.8);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(2.5, 3.5, 5);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x89d8ff, 0.9);
  fillLight.position.set(-2.5, 1.8, 3);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0x1f8fff, 0.65);
  rimLight.position.set(0, 1.5, -4);
  scene.add(rimLight);

  const textureLoader = new THREE.TextureLoader();
  const texture = textureLoader.load('assets/robot.svg', () => {
    resizeRobot3D();
  });
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;

  const shellMaterial = new THREE.MeshStandardMaterial({ color: 0xcfe2ea, roughness: 0.45, metalness: 0.08 });
  const sideMaterial = new THREE.MeshStandardMaterial({ color: 0xa3bcc9, roughness: 0.65, metalness: 0.06 });
  const backMaterial = new THREE.MeshStandardMaterial({ color: 0x7d97a4, roughness: 0.9, metalness: 0.02 });
  const frontMaterial = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    roughness: 0.45,
    metalness: 0.12,
    emissive: 0x08131a,
    emissiveIntensity: 0.08
  });

  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(2.85, 3.25, 1.05),
    [sideMaterial, sideMaterial, shellMaterial, sideMaterial, shellMaterial, backMaterial]
  );
  shell.position.y = -0.05;
  rig.add(shell);

  const front = new THREE.Mesh(new THREE.PlaneGeometry(2.95, 3.35), frontMaterial);
  front.position.z = 0.545;
  front.position.y = -0.05;
  rig.add(front);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.55, 40),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.24 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, -1.88, -0.65);
  rig.add(shadow);

  robot3D = {
    renderer,
    scene,
    camera,
    rig,
    shadow,
    animationId: null,
    state: {
      targetX: 0,
      targetY: 0,
      targetZ: 0,
      targetLift: 0,
      currentX: 0,
      currentY: 0,
      currentZ: 0,
      currentLift: 0
    }
  };

  resizeRobot3D();
  container.classList.add('robot-3d-ready');

  if (typeof ResizeObserver === 'function') {
    robot3DResizeObserver = new ResizeObserver(() => {
      if (robot3D) resizeRobot3D();
    });
    robot3DResizeObserver.observe(robot3DHost);
  } else {
    robot3DWindowResizeHandler = () => {
      if (robot3D) resizeRobot3D();
    };
    window.addEventListener('resize', robot3DWindowResizeHandler);
  }

  const animate = (timestamp) => {
    if (!robot3D) return;
    const state = robot3D.state;
    state.currentX += (state.targetX - state.currentX) * 0.08;
    state.currentY += (state.targetY - state.currentY) * 0.08;
    state.currentZ += (state.targetZ - state.currentZ) * 0.08;
    state.currentLift += (state.targetLift - state.currentLift) * 0.08;

    robot3D.rig.rotation.y = state.currentX;
    robot3D.rig.rotation.x = state.currentY;
    robot3D.rig.rotation.z = state.currentZ;
    robot3D.rig.position.y = state.currentLift + Math.sin(timestamp * 0.0016) * 0.05;
    robot3D.shadow.scale.setScalar(1 - Math.min(0.28, Math.abs(state.currentX) * 0.35 + Math.abs(state.currentY) * 0.25));

    robot3D.renderer.render(robot3D.scene, robot3D.camera);
    robot3D.animationId = requestAnimationFrame(animate);
  };

  robot3D.animationId = requestAnimationFrame(animate);
  return robot3D;
}



    return {
      initRobot3D,
      disposeRobot3D,
      resizeRobot3D,
      setRobot3DTarget,
      resetRobot3DTarget
    };
  }

  window.Robot3D = {
    createRobot3DController
  };
})();
