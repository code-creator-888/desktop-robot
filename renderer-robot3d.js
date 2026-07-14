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
      robot3D.state.targetX = nx * 0.82;
      robot3D.state.targetY = -ny * 0.5;
      robot3D.state.targetZ = nx * 0.18;
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
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
      if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
      } else if ('outputEncoding' in renderer && THREE.sRGBEncoding) {
        renderer.outputEncoding = THREE.sRGBEncoding;
      }
      renderer.domElement.className = 'robot-3d-canvas';
      robot3DHost.replaceChildren(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
      camera.position.set(0, 0.02, 6.8);

      const rig = new THREE.Group();
      rig.scale.setScalar(1.38);
      scene.add(rig);

      const ambient = new THREE.AmbientLight(0xffffff, 1.1);
      scene.add(ambient);

      const keyLight = new THREE.DirectionalLight(0xffffff, 3.4);
      keyLight.position.set(2.4, 3.4, 4.8);
      scene.add(keyLight);

      const cyanLight = new THREE.DirectionalLight(0x66f5ff, 1.9);
      cyanLight.position.set(-2.8, 1.6, 3.2);
      scene.add(cyanLight);

      const violetRimLight = new THREE.DirectionalLight(0xb56cff, 2.2);
      violetRimLight.position.set(1.8, 2.1, -4.6);
      scene.add(violetRimLight);

      function createRoundedRectangleShape(width, height, radius) {
        const x = -width / 2;
        const y = -height / 2;
        const roundedRadius = Math.min(radius, width / 2, height / 2);
        const shape = new THREE.Shape();
        shape.moveTo(x + roundedRadius, y);
        shape.lineTo(x + width - roundedRadius, y);
        shape.quadraticCurveTo(x + width, y, x + width, y + roundedRadius);
        shape.lineTo(x + width, y + height - roundedRadius);
        shape.quadraticCurveTo(x + width, y + height, x + width - roundedRadius, y + height);
        shape.lineTo(x + roundedRadius, y + height);
        shape.quadraticCurveTo(x, y + height, x, y + height - roundedRadius);
        shape.lineTo(x, y + roundedRadius);
        shape.quadraticCurveTo(x, y, x + roundedRadius, y);
        return shape;
      }

      function createRoundedExtrudedGeometry(width, height, depth, radius, bevelSize, bevelSegments) {
        const geometry = new THREE.ExtrudeGeometry(createRoundedRectangleShape(width, height, radius), {
          depth,
          bevelEnabled: true,
          bevelThickness: bevelSize,
          bevelSize,
          bevelSegments,
          curveSegments: 16
        });
        geometry.center();
        return geometry;
      }

      const pearlMaterial = new THREE.MeshStandardMaterial({
        color: 0xeafcff,
        roughness: 0.16,
        metalness: 0.38
      });
      const darkGlassMaterial = new THREE.MeshStandardMaterial({
        color: 0x07111f,
        roughness: 0.22,
        metalness: 0.48,
        emissive: 0x051827,
        emissiveIntensity: 0.42
      });
      const cyanMaterial = new THREE.MeshStandardMaterial({
        color: 0x7df9ff,
        roughness: 0.08,
        metalness: 0.04,
        emissive: 0x22d6ff,
        emissiveIntensity: 1.25
      });
      const violetMaterial = new THREE.MeshStandardMaterial({
        color: 0xc493ff,
        roughness: 0.12,
        metalness: 0.08,
        emissive: 0x8758ff,
        emissiveIntensity: 0.95
      });
      const graphiteMaterial = new THREE.MeshStandardMaterial({
        color: 0x263445,
        roughness: 0.36,
        metalness: 0.34
      });
      const transparentCyanMaterial = new THREE.MeshBasicMaterial({
        color: 0x9dfcff,
        transparent: true,
        opacity: 0.26,
        depthWrite: false
      });
      const transparentVioletMaterial = new THREE.MeshBasicMaterial({
        color: 0xa67cff,
        transparent: true,
        opacity: 0.32,
        depthWrite: false
      });

      const bodyShell = new THREE.Group();
      bodyShell.name = 'bodyShell';
      rig.add(bodyShell);

      const hologramRing = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.03, 10, 92), transparentCyanMaterial);
      hologramRing.position.set(0, 0.02, -0.52);
      hologramRing.rotation.x = Math.PI / 2;
      rig.add(hologramRing);

      const orbitRing = new THREE.Mesh(new THREE.TorusGeometry(1.06, 0.022, 8, 82), transparentVioletMaterial);
      orbitRing.position.set(0, 0.14, 0.04);
      orbitRing.rotation.x = Math.PI / 2.35;
      orbitRing.rotation.z = -0.38;
      rig.add(orbitRing);

      const headShell = new THREE.Mesh(
        createRoundedExtrudedGeometry(2.02, 1.32, 0.92, 0.32, 0.075, 9),
        pearlMaterial
      );
      headShell.position.set(0, 0.62, 0);
      bodyShell.add(headShell);

      const faceScreen = new THREE.Mesh(
        createRoundedExtrudedGeometry(1.58, 0.7, 0.11, 0.2, 0.024, 5),
        darkGlassMaterial
      );
      faceScreen.position.set(0, 0.66, 0.55);
      bodyShell.add(faceScreen);

      const visorGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 0.48), transparentCyanMaterial);
      visorGlass.position.set(0, 0.72, 0.63);
      visorGlass.rotation.z = -0.07;
      bodyShell.add(visorGlass);

      const eyeGeometry = new THREE.SphereGeometry(0.18, 30, 18);
      const eyeLeft = new THREE.Mesh(eyeGeometry, cyanMaterial);
      eyeLeft.scale.set(1.28, 0.5, 0.28);
      eyeLeft.position.set(-0.4, 0.73, 0.68);
      bodyShell.add(eyeLeft);

      const eyeRight = new THREE.Mesh(eyeGeometry.clone(), cyanMaterial);
      eyeRight.scale.set(1.28, 0.5, 0.28);
      eyeRight.position.set(0.4, 0.73, 0.68);
      bodyShell.add(eyeRight);

      const expressionLine = new THREE.Mesh(
        createRoundedExtrudedGeometry(0.46, 0.06, 0.04, 0.03, 0.008, 3),
        violetMaterial
      );
      expressionLine.position.set(0, 0.43, 0.68);
      bodyShell.add(expressionLine);

      const torsoShell = new THREE.Mesh(
        createRoundedExtrudedGeometry(1.4, 0.92, 0.78, 0.22, 0.06, 7),
        pearlMaterial
      );
      torsoShell.position.set(0, -0.68, 0);
      bodyShell.add(torsoShell);

      const frontPanel = new THREE.Mesh(
        createRoundedExtrudedGeometry(0.94, 0.52, 0.08, 0.15, 0.018, 4),
        darkGlassMaterial
      );
      frontPanel.position.set(0, -0.67, 0.47);
      bodyShell.add(frontPanel);

      const gravityCore = new THREE.Mesh(new THREE.SphereGeometry(0.17, 28, 18), violetMaterial);
      gravityCore.position.set(0, -0.66, 0.57);
      bodyShell.add(gravityCore);

      const finGeometry = createRoundedExtrudedGeometry(0.22, 1.02, 0.18, 0.1, 0.025, 5);
      const finLeft = new THREE.Mesh(finGeometry, transparentVioletMaterial);
      finLeft.position.set(-1.03, -0.08, -0.08);
      finLeft.rotation.z = -0.42;
      finLeft.rotation.y = -0.24;
      rig.add(finLeft);

      const finRight = new THREE.Mesh(finGeometry.clone(), transparentVioletMaterial);
      finRight.position.set(1.03, -0.08, -0.08);
      finRight.rotation.z = 0.42;
      finRight.rotation.y = 0.24;
      rig.add(finRight);

      const thrusterGeometry = new THREE.CapsuleGeometry(0.16, 0.52, 8, 18);
      const thrusterLeft = new THREE.Mesh(thrusterGeometry, graphiteMaterial);
      thrusterLeft.position.set(-0.92, -0.78, 0.08);
      thrusterLeft.rotation.z = 0.18;
      bodyShell.add(thrusterLeft);

      const thrusterRight = new THREE.Mesh(thrusterGeometry.clone(), graphiteMaterial);
      thrusterRight.position.set(0.92, -0.78, 0.08);
      thrusterRight.rotation.z = -0.18;
      bodyShell.add(thrusterRight);

      const glowGeometry = new THREE.SphereGeometry(0.11, 20, 12);
      const thrusterGlowLeft = new THREE.Mesh(glowGeometry, cyanMaterial);
      thrusterGlowLeft.position.set(-0.94, -1.1, 0.22);
      bodyShell.add(thrusterGlowLeft);

      const thrusterGlowRight = new THREE.Mesh(glowGeometry.clone(), cyanMaterial);
      thrusterGlowRight.position.set(0.94, -1.1, 0.22);
      bodyShell.add(thrusterGlowRight);

      const footGeometry = createRoundedExtrudedGeometry(0.52, 0.18, 0.46, 0.09, 0.025, 4);
      const footLeft = new THREE.Mesh(footGeometry, graphiteMaterial);
      footLeft.position.set(-0.38, -1.34, 0.1);
      bodyShell.add(footLeft);

      const footRight = new THREE.Mesh(footGeometry.clone(), graphiteMaterial);
      footRight.position.set(0.38, -1.34, 0.1);
      bodyShell.add(footRight);

      const antennaStem = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.036, 0.38, 18), graphiteMaterial);
      antennaStem.position.set(0.32, 1.46, 0.02);
      antennaStem.rotation.z = -0.28;
      bodyShell.add(antennaStem);

      const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), cyanMaterial);
      antennaTip.position.set(0.38, 1.64, 0.03);
      bodyShell.add(antennaTip);

      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(1.34, 54),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32 })
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(0, -1.53, -0.68);
      rig.add(shadow);

      robot3D = {
        renderer,
        scene,
        camera,
        rig,
        bodyShell,
        shadow,
        hologramRing,
        orbitRing,
        visorGlass,
        eyeLeft,
        eyeRight,
        gravityCore,
        antennaTip,
        finLeft,
        finRight,
        thrusterGlowLeft,
        thrusterGlowRight,
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
        const pulse = (Math.sin(timestamp * 0.006) + 1) * 0.5;
        state.currentX += (state.targetX - state.currentX) * 0.08;
        state.currentY += (state.targetY - state.currentY) * 0.08;
        state.currentZ += (state.targetZ - state.currentZ) * 0.08;
        state.currentLift += (state.targetLift - state.currentLift) * 0.08;

        robot3D.rig.rotation.y = state.currentX;
        robot3D.rig.rotation.x = state.currentY;
        robot3D.rig.rotation.z = state.currentZ;
        robot3D.rig.position.y = state.currentLift + Math.sin(timestamp * 0.0016) * 0.05;
        robot3D.bodyShell.rotation.y = Math.sin(timestamp * 0.0012) * 0.06;
        robot3D.hologramRing.rotation.z = timestamp * 0.0016;
        robot3D.orbitRing.rotation.z = -timestamp * 0.0019;
        robot3D.visorGlass.material.opacity = 0.2 + pulse * 0.16;
        robot3D.eyeLeft.scale.x = 1.28 + pulse * 0.12;
        robot3D.eyeRight.scale.x = 1.28 + pulse * 0.12;
        robot3D.gravityCore.scale.setScalar(0.92 + pulse * 0.3);
        robot3D.antennaTip.scale.setScalar(0.9 + pulse * 0.18);
        robot3D.thrusterGlowLeft.scale.setScalar(0.78 + pulse * 0.36);
        robot3D.thrusterGlowRight.scale.setScalar(1.04 - pulse * 0.24);
        robot3D.finLeft.rotation.z = -0.42 + Math.sin(timestamp * 0.002) * 0.045;
        robot3D.finRight.rotation.z = 0.42 - Math.sin(timestamp * 0.002) * 0.045;
        robot3D.shadow.scale.setScalar(1 - Math.min(0.28, Math.abs(state.currentX) * 0.34 + Math.abs(state.currentY) * 0.24));

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
