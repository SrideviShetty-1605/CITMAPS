(function registerThreeScene(app) {
  const ROTATION_SENSITIVITY = 0.014;
  const PITCH_SENSITIVITY = 0.006;

  const sceneState = {
    isReady: false,
    container: null,
    overlay: null,
    labelLayer: null,
    renderer: null,
    scene: null,
    camera: null,
    root: null,
    floorPlane: null,
    meshes: {},
    pickMeshes: [],
    corridorMeshes: [],
    labelEls: {},
    routeGroup: null,
    routeTracer: null,
    routeVectors: [],
    activePointers: new Map(),
    lastPinchDistance: null,
    raycaster: null,
    pointer: null,
    hoveredSpaceId: null,
    pointerDown: false,
    activePointerId: null,
    dragDistance: 0,
    lastPointerX: 0,
    lastPointerY: 0,
    yaw: 0,
    pitch: 0.82,
    distance: 1860,
    target: null
  };

  function hasThree() {
    return typeof window.THREE !== "undefined";
  }

  function cssValue(variableName, fallback) {
    return getComputedStyle(document.documentElement).getPropertyValue(variableName).trim() || fallback;
  }

  function cssColor(variableName, fallback) {
    return new THREE.Color(cssValue(variableName, fallback));
  }

  function toWorldPosition(x, y, liftY = 0) {
    const { width, height } = app.data.meta.viewBox;
    return new THREE.Vector3(x - width / 2, liftY, y - height / 2);
  }

  function getHeightForSpace(space) {
    if (space.sceneHeight) {
      return space.sceneHeight;
    }

    const heights = {
      classroom: 46,
      lab: 58,
      faculty: 52,
      office: 34,
      facility: 24,
      library: 42,
      garden: 8,
      washroom: 24,
      stairs: 30,
      lift: 36
    };

    return heights[space.type] || 26;
  }

  function getSceneLabelText(space) {
    return space.name;
  }

  function getSpaceShapes(space) {
    return app.utils.getSpaceShapes(space);
  }

  function projectToScreen(worldPosition, bounds) {
    const projected = worldPosition.clone().project(sceneState.camera);

    return {
      x: (projected.x * 0.5 + 0.5) * bounds.width,
      y: (-projected.y * 0.5 + 0.5) * bounds.height,
      z: projected.z,
      isVisible:
        projected.z > -1 &&
        projected.z < 1 &&
        projected.x >= -1.05 &&
        projected.x <= 1.05 &&
        projected.y >= -1.05 &&
        projected.y <= 1.05
    };
  }

  function getProjectedSpaceBounds(space, mesh, bounds) {
    const corners = [];
    const liftY = mesh.userData.height + 4;

    getSpaceShapes(space).forEach((shape) => {
      [
        { x: shape.x, y: shape.y },
        { x: shape.x + shape.width, y: shape.y },
        { x: shape.x, y: shape.y + shape.height },
        { x: shape.x + shape.width, y: shape.y + shape.height }
      ].forEach((corner) => {
        const projected = projectToScreen(toWorldPosition(corner.x, corner.y, liftY), bounds);

        if (projected.isVisible) {
          corners.push(projected);
        }
      });
    });

    if (!corners.length) {
      return null;
    }

    const xValues = corners.map((corner) => corner.x);
    const yValues = corners.map((corner) => corner.y);

    return {
      minX: Math.min(...xValues),
      maxX: Math.max(...xValues),
      minY: Math.min(...yValues),
      maxY: Math.max(...yValues)
    };
  }

  function estimateWrappedLineCount(text, charsPerLine) {
    const words = text.trim().split(/\s+/).filter(Boolean);

    if (!words.length) {
      return 1;
    }

    if (words.some((word) => word.length > charsPerLine)) {
      return Number.POSITIVE_INFINITY;
    }

    let lines = 1;
    let currentLength = 0;

    words.forEach((word) => {
      if (!currentLength) {
        currentLength = word.length;
        return;
      }

      if (currentLength + 1 + word.length <= charsPerLine) {
        currentLength += 1 + word.length;
        return;
      }

      lines += 1;
      currentLength = word.length;
    });

    return lines;
  }

  function getLabelMetrics(text, width, height) {
    const clampedWidth = Math.max(28, width);
    const clampedHeight = Math.max(16, height);

    for (let fontSize = 12; fontSize >= 5.5; fontSize -= 0.5) {
      const charsPerLine = Math.max(3, Math.floor(clampedWidth / (fontSize * 0.6)));
      const lineCount = estimateWrappedLineCount(text, charsPerLine);
      const lineHeight = fontSize * 1.12;

      if (lineCount * lineHeight <= clampedHeight) {
        return { fontSize, lineHeight };
      }
    }

    return {
      fontSize: 5.5,
      lineHeight: 6.2
    };
  }

  function createOutlinedBox(width, height, depth, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    const edgeLines = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16 })
    );
    mesh.add(edgeLines);
    return mesh;
  }

  function createFloor() {
    const { width, height } = app.data.meta.viewBox;
    const planeMaterial = new THREE.MeshStandardMaterial({
      color: cssColor("--svg-base", "#faf7f1"),
      roughness: 0.94,
      metalness: 0.02
    });

    sceneState.floorPlane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), planeMaterial);
    sceneState.floorPlane.rotation.x = -Math.PI / 2;
    sceneState.floorPlane.position.y = 0;
    sceneState.root.add(sceneState.floorPlane);

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(width + 100, 18, height + 100),
      new THREE.MeshStandardMaterial({
        color: cssColor("--page-bg-alt", "#fffaf2"),
        roughness: 1,
        metalness: 0.03
      })
    );
    base.position.y = -14;
    sceneState.root.add(base);

    const borderFrame = new THREE.Mesh(
      new THREE.BoxGeometry(width + 28, 12, height + 28),
      new THREE.MeshStandardMaterial({
        color: cssColor("--panel-border", "#cbd5e1"),
        roughness: 0.92,
        metalness: 0.02,
        transparent: true,
        opacity: 0.34
      })
    );
    borderFrame.position.y = -5;
    sceneState.root.add(borderFrame);
  }

  function createCorridors() {
    app.data.corridors.forEach((corridor) => {
      app.utils.getCorridorShapes(corridor).forEach((shape) => {
        const material = new THREE.MeshStandardMaterial({
          color: cssColor("--svg-corridor", "#d5e8e2"),
          roughness: 0.78,
          metalness: 0.05,
          emissive: cssColor("--svg-corridor", "#d5e8e2"),
          emissiveIntensity: 0.08,
          transparent: true,
          opacity: 0.86
        });
        const mesh = createOutlinedBox(shape.width, 12, shape.height, material);
        const world = toWorldPosition(shape.x + shape.width / 2, shape.y + shape.height / 2, 6);

        const insetPlate = new THREE.Mesh(
          new THREE.BoxGeometry(Math.max(shape.width - 12, 8), 1.6, Math.max(shape.height - 12, 8)),
          new THREE.MeshStandardMaterial({
            color: cssColor("--svg-corridor", "#d5e8e2"),
            roughness: 0.64,
            metalness: 0.04,
            transparent: true,
            opacity: 0.34
          })
        );

        insetPlate.position.y = 6.4;
        mesh.position.copy(world);
        mesh.add(insetPlate);
        sceneState.root.add(mesh);
        sceneState.corridorMeshes.push(mesh);
      });
    });
  }

  function createSpaces() {
    sceneState.pickMeshes = [];

    app.data.spaces.forEach((space) => {
      const height = getHeightForSpace(space);
      const group = new THREE.Group();
      const centerX = space.x + space.width / 2;
      const centerY = space.y + space.height / 2;
      const world = toWorldPosition(centerX, centerY, height / 2 + 10);

      group.position.copy(world);
      group.userData.spaceId = space.id;
      group.userData.height = height;

      getSpaceShapes(space).forEach((shape) => {
        const material = new THREE.MeshStandardMaterial({
          color: app.typeConfig[space.type]?.sceneColor || "#7cb7cf",
          roughness: 0.56,
          metalness: 0.08,
          transparent: true,
          opacity: space.type === "garden" ? 0.72 : 0.88
        });
        const mesh = createOutlinedBox(shape.width, height, shape.height, material);
        const offset = toWorldPosition(shape.x + shape.width / 2, shape.y + shape.height / 2, 0);

        mesh.position.set(offset.x - world.x, 0, offset.z - world.z);
        mesh.userData.spaceId = space.id;
        group.add(mesh);
        sceneState.pickMeshes.push(mesh);
      });

      sceneState.root.add(group);
      sceneState.meshes[space.id] = group;
    });
  }

  function createLabels() {
    sceneState.labelLayer.innerHTML = "";
    sceneState.labelEls = {};

    app.data.spaces.forEach((space) => {
      if (space.showSceneLabel === false) {
        return;
      }

      const el = document.createElement("div");
      el.className = "scene-label";
      el.textContent = getSceneLabelText(space);
      el.title = space.name;
      sceneState.labelLayer.appendChild(el);
      sceneState.labelEls[space.id] = el;
    });
  }

  function createLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 1.1);
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    const fill = new THREE.DirectionalLight(0x8fd8ff, 0.45);

    key.position.set(260, 760, 540);
    fill.position.set(-420, 280, -320);

    sceneState.scene.add(ambient, key, fill);
  }

  function clearRouteObjects() {
    if (!sceneState.routeGroup) {
      return;
    }

    sceneState.root.remove(sceneState.routeGroup);
    const geometries = new Set();
    const materials = new Set();

    sceneState.routeGroup.traverse((child) => {
      if (child.geometry) {
        geometries.add(child.geometry);
      }

      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => materials.add(material));
        } else {
          materials.add(child.material);
        }
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());

    sceneState.routeGroup = null;
    sceneState.routeTracer = null;
    sceneState.routeVectors = [];
  }

  function getPinchDistance() {
    const pointers = [...sceneState.activePointers.values()];

    if (pointers.length < 2) {
      return null;
    }

    const [first, second] = pointers;
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function updateHighlights() {
    if (!sceneState.isReady || !hasThree()) {
      return;
    }

    const selectedId = app.state.selectedLocationId;
    const startId = app.state.startLocationId;
    const hoveredId = sceneState.hoveredSpaceId;
    const highlight = cssColor("--highlight", "#f97316");
    const accent = cssColor("--accent", "#0f9f9c");

    Object.entries(sceneState.meshes).forEach(([spaceId, mesh]) => {
      const space = app.utils.getSpaceById(spaceId);
      const baseColor = new THREE.Color(app.typeConfig[space.type]?.sceneColor || "#7cb7cf");

      mesh.traverse((child) => {
        if (!child.isMesh || !child.material?.color) {
          return;
        }

        child.material.color.copy(baseColor);
        child.material.emissive.set(0x000000);
        child.material.emissiveIntensity = 0;
      });

      mesh.scale.set(1, 1, 1);

      if (spaceId === startId) {
        mesh.traverse((child) => {
          if (!child.isMesh || !child.material?.emissive) {
            return;
          }

          child.material.emissive.copy(accent);
          child.material.emissiveIntensity = 0.32;
        });
      }

      if (spaceId === selectedId) {
        mesh.traverse((child) => {
          if (!child.isMesh || !child.material?.emissive) {
            return;
          }

          child.material.emissive.copy(highlight);
          child.material.emissiveIntensity = 0.48;
        });
        mesh.scale.set(1.02, 1.08, 1.02);
      } else if (spaceId === hoveredId) {
        mesh.traverse((child) => {
          if (!child.isMesh || !child.material?.emissive) {
            return;
          }

          child.material.emissive.copy(highlight);
          child.material.emissiveIntensity = 0.2;
        });
        mesh.scale.set(1.03, 1.08, 1.03);
      }
    });

    Object.entries(sceneState.labelEls).forEach(([spaceId, el]) => {
      el.classList.toggle("is-start", spaceId === startId);
      el.classList.toggle("is-destination", spaceId === selectedId);
      el.classList.toggle("is-hover", spaceId === hoveredId);
    });
  }

  function updateRoute() {
    if (!sceneState.isReady || !hasThree()) {
      return;
    }

    clearRouteObjects();

    const route = app.state.route;

    if (!route?.points?.length) {
      sceneState.overlay.textContent = "Drag to rotate a full 360 degrees, pinch with two fingers to zoom, and click any 3D room block or sidebar result to route there.";
      return;
    }

    const routeHeight = 78;
    const points = route.points.map((point) => toWorldPosition(point.x, point.y, routeHeight));
    const routeSegments = new THREE.Group();
    const routeColor = cssColor("--svg-route", "#ff6a00");
    const routeMaterial = new THREE.MeshStandardMaterial({
      color: routeColor,
      emissive: routeColor,
      emissiveIntensity: 1.35,
      roughness: 0.18,
      metalness: 0,
      depthTest: false,
      toneMapped: false
    });
    const routeGlowMaterial = new THREE.MeshBasicMaterial({
      color: routeColor,
      transparent: true,
      opacity: 0.24,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });

    points.slice(1).forEach((point, index) => {
      const from = points[index];
      const to = point;
      const segmentVector = new THREE.Vector3().subVectors(to, from);
      const segmentLength = segmentVector.length();
      const midpoint = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
      const glow = new THREE.Mesh(
        new THREE.BoxGeometry(24, 14, Math.max(segmentLength, 1)),
        routeGlowMaterial
      );
      const segment = new THREE.Mesh(
        new THREE.BoxGeometry(12, 7, Math.max(segmentLength, 1)),
        routeMaterial
      );
      glow.position.copy(midpoint);
      glow.lookAt(to.x, midpoint.y, to.z);
      segment.position.copy(midpoint);
      segment.lookAt(to.x, midpoint.y, to.z);
      routeSegments.add(glow);
      routeSegments.add(segment);
    });

    const startMarker = new THREE.Mesh(
      new THREE.SphereGeometry(9, 20, 20),
      new THREE.MeshStandardMaterial({
        color: cssColor("--accent", "#0f9f9c"),
        emissive: cssColor("--accent", "#0f9f9c"),
        emissiveIntensity: 0.4
      })
    );
    const endMarker = new THREE.Mesh(
      new THREE.SphereGeometry(9, 20, 20),
      new THREE.MeshStandardMaterial({
        color: routeColor,
        emissive: routeColor,
        emissiveIntensity: 0.85,
        toneMapped: false
      })
    );
    const tracer = new THREE.Mesh(
      new THREE.SphereGeometry(7, 18, 18),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: routeColor,
        emissiveIntensity: 0.95,
        toneMapped: false
      })
    );

    startMarker.position.copy(points[0]);
    endMarker.position.copy(points[points.length - 1]);
    tracer.position.copy(points[0]);

    sceneState.routeGroup = new THREE.Group();
    sceneState.routeGroup.add(routeSegments, startMarker, endMarker, tracer);
    sceneState.root.add(sceneState.routeGroup);
    sceneState.routeTracer = tracer;
    sceneState.routeVectors = points;
    sceneState.overlay.textContent = `${route.startSpace.name} to ${route.endSpace.name} in ${app.utils.formatDistance(route.distanceMeters)}. Rotate the model to follow the glowing path.`;
  }

  function updateCamera() {
    const radius = Math.cos(sceneState.pitch) * sceneState.distance;
    sceneState.camera.position.set(
      Math.sin(sceneState.yaw) * radius,
      Math.sin(sceneState.pitch) * sceneState.distance + 180,
      Math.cos(sceneState.yaw) * radius
    );
    sceneState.camera.lookAt(sceneState.target);
  }

  function syncLabels() {
    if (!sceneState.isReady || !sceneState.camera) {
      return;
    }

    const bounds = sceneState.container.getBoundingClientRect();

    Object.entries(sceneState.labelEls).forEach(([spaceId, el]) => {
      const mesh = sceneState.meshes[spaceId];
      const space = app.utils.getSpaceById(spaceId);

      if (!mesh || !space) {
        el.style.display = "none";
        return;
      }

      const labelBounds = getProjectedSpaceBounds(space, mesh, bounds);

      if (!labelBounds) {
        el.style.display = "none";
        return;
      }

      const labelX = space.labelX ?? space.x + space.width / 2;
      const labelY = space.labelY ?? space.y + space.height / 2;
      const projectedLabel = projectToScreen(
        toWorldPosition(labelX, labelY, mesh.userData.height + 6),
        bounds
      );

      if (!projectedLabel.isVisible) {
        el.style.display = "none";
        return;
      }

      const availableWidth = Math.max(28, labelBounds.maxX - labelBounds.minX - 8);
      const availableHeight = Math.max(16, labelBounds.maxY - labelBounds.minY - 8);
      const metrics = getLabelMetrics(space.name, availableWidth, availableHeight);
      const halfWidth = availableWidth / 2;
      const halfHeight = availableHeight / 2;
      const screenX = app.utils.clamp(projectedLabel.x, labelBounds.minX + halfWidth, labelBounds.maxX - halfWidth);
      const screenY = app.utils.clamp(projectedLabel.y, labelBounds.minY + halfHeight, labelBounds.maxY - halfHeight);
      const scale =
        spaceId === app.state.selectedLocationId
          ? 1.06
          : spaceId === sceneState.hoveredSpaceId
            ? 1.04
            : 1;

      el.style.display = "block";
      el.style.width = `${availableWidth}px`;
      el.style.maxWidth = `${availableWidth}px`;
      el.style.fontSize = `${metrics.fontSize}px`;
      el.style.lineHeight = `${metrics.lineHeight}px`;
      el.style.padding = availableWidth < 56 ? "0.14rem 0.2rem" : "0.2rem 0.32rem";
      el.style.transform = `translate(-50%, -50%) translate(${screenX}px, ${screenY}px) scale(${scale})`;
    });
  }

  function updateRouteTracer(timestamp) {
    if (!sceneState.routeTracer || sceneState.routeVectors.length < 2) {
      return;
    }

    const segments = sceneState.routeVectors.slice(1).map((point, index) => ({
      from: sceneState.routeVectors[index],
      to: point,
      length: sceneState.routeVectors[index].distanceTo(point)
    }));
    const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
    const duration = Math.max(3200, totalLength * 3.4);
    const travel = ((timestamp % duration) / duration) * totalLength;
    let covered = 0;
    let currentPoint = sceneState.routeVectors[0];

    for (const segment of segments) {
      if (covered + segment.length >= travel) {
        const ratio = (travel - covered) / segment.length;
        currentPoint = segment.from.clone().lerp(segment.to, ratio);
        break;
      }

      covered += segment.length;
    }

    sceneState.routeTracer.position.copy(currentPoint);
  }

  function resize() {
    if (!sceneState.renderer || !sceneState.container) {
      return;
    }

    const width = sceneState.container.clientWidth;
    const height = sceneState.container.clientHeight;

    sceneState.camera.aspect = width / Math.max(height, 1);
    sceneState.camera.updateProjectionMatrix();
    sceneState.renderer.setSize(width, height, false);
    sceneState.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    syncLabels();
  }

  function applyTheme() {
    if (!sceneState.isReady) {
      return;
    }

    sceneState.scene.background = cssColor("--page-bg", "#f3efe6");

    if (sceneState.floorPlane) {
      sceneState.floorPlane.material.color.copy(cssColor("--svg-base", "#faf7f1"));
    }

    sceneState.corridorMeshes.forEach((mesh) => {
      mesh.material.color.copy(cssColor("--svg-corridor", "#d5e8e2"));
      if (mesh.material.emissive) {
        mesh.material.emissive.copy(cssColor("--svg-corridor", "#d5e8e2"));
      }

      mesh.children.forEach((child) => {
        if (child.material?.color) {
          child.material.color.copy(cssColor("--svg-corridor", "#d5e8e2"));
        }
      });
    });

    updateHighlights();
    updateRoute();
  }

  function bindPointerControls() {
    if (!sceneState.container) {
      return;
    }

    sceneState.container.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      sceneState.activePointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        pointerType: event.pointerType
      });

      if (event.pointerType === "touch" && sceneState.activePointers.size >= 2) {
        sceneState.pointerDown = false;
        sceneState.activePointerId = null;
        sceneState.lastPinchDistance = getPinchDistance();
        return;
      }

      sceneState.pointerDown = true;
      sceneState.activePointerId = event.pointerId;
      sceneState.dragDistance = 0;
      sceneState.lastPointerX = event.clientX;
      sceneState.lastPointerY = event.clientY;
      sceneState.container.classList.add("is-dragging");
      try {
        sceneState.container.setPointerCapture(event.pointerId);
      } catch (error) {
        void error;
      }
    });

    window.addEventListener("pointerup", (event) => {
      sceneState.activePointers.delete(event.pointerId);

      if (sceneState.pointerDown && sceneState.dragDistance < 6) {
        handleSelectionClick(event);
      }

      sceneState.pointerDown = false;
      sceneState.activePointerId = null;
      sceneState.lastPinchDistance = sceneState.activePointers.size >= 2 ? getPinchDistance() : null;
      sceneState.container.classList.remove("is-dragging");

      try {
        sceneState.container.releasePointerCapture(event.pointerId);
      } catch (error) {
        void error;
      }
    });

    sceneState.container.addEventListener("pointermove", (event) => {
      if (sceneState.activePointers.has(event.pointerId)) {
        sceneState.activePointers.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
          pointerType: event.pointerType
        });
      }

      if (event.pointerType === "touch" && sceneState.activePointers.size >= 2) {
        event.preventDefault();
        const nextPinchDistance = getPinchDistance();

        if (nextPinchDistance && sceneState.lastPinchDistance) {
          const distanceDelta = nextPinchDistance - sceneState.lastPinchDistance;
          sceneState.distance = app.utils.clamp(sceneState.distance - distanceDelta * 3.2, 780, 2800);
        }

        sceneState.lastPinchDistance = nextPinchDistance;
        return;
      }

      if (!sceneState.pointerDown) {
        updateHoveredSpace(event);
      }

      if (!sceneState.pointerDown || event.pointerId !== sceneState.activePointerId) {
        return;
      }

      event.preventDefault();
      const deltaX = event.clientX - sceneState.lastPointerX;
      const deltaY = event.clientY - sceneState.lastPointerY;

      sceneState.lastPointerX = event.clientX;
      sceneState.lastPointerY = event.clientY;
      sceneState.dragDistance += Math.abs(deltaX) + Math.abs(deltaY);
      sceneState.yaw -= deltaX * ROTATION_SENSITIVITY;
      sceneState.pitch = app.utils.clamp(sceneState.pitch + deltaY * PITCH_SENSITIVITY, 0.12, 1.38);
    });

    sceneState.container.addEventListener(
      "wheel",
      (event) => {
        if (!event.ctrlKey) {
          return;
        }

        event.preventDefault();
        sceneState.distance = app.utils.clamp(sceneState.distance + event.deltaY * 1.4, 780, 2800);
      },
      { passive: false }
    );

    sceneState.container.addEventListener("pointerleave", () => {
      if (sceneState.pointerDown) {
        return;
      }

      sceneState.hoveredSpaceId = null;
      sceneState.activePointers.clear();
      sceneState.lastPinchDistance = null;
      sceneState.container.classList.remove("is-dragging");
      updateHighlights();
      syncLabels();
    });

    sceneState.container.addEventListener("pointercancel", (event) => {
      sceneState.activePointers.delete(event.pointerId);
      sceneState.pointerDown = false;
      sceneState.activePointerId = null;
      sceneState.lastPinchDistance = null;
      sceneState.container.classList.remove("is-dragging");
    });
  }

  function getSpaceIdFromPointer(event) {
    if (!sceneState.isReady || !sceneState.raycaster || !sceneState.pointer) {
      return null;
    }

    const bounds = sceneState.container.getBoundingClientRect();
    const normalizedX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    const normalizedY = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);

    sceneState.pointer.set(normalizedX, normalizedY);
    sceneState.raycaster.setFromCamera(sceneState.pointer, sceneState.camera);

    const hits = sceneState.raycaster.intersectObjects(sceneState.pickMeshes, false);

    if (!hits.length) {
      return null;
    }

    return hits[0].object.userData.spaceId || null;
  }

  function updateHoveredSpace(event) {
    const hoveredSpaceId = getSpaceIdFromPointer(event);

    if (hoveredSpaceId === sceneState.hoveredSpaceId) {
      return;
    }

    sceneState.hoveredSpaceId = hoveredSpaceId;
    updateHighlights();
    syncLabels();
  }

  function handleSelectionClick(event) {
    const targetSpaceId = getSpaceIdFromPointer(event);

    if (targetSpaceId) {
      app.actions.selectDestination(targetSpaceId);
    }
  }

  function refocus() {
    sceneState.yaw = 0;
    sceneState.pitch = 0.78;
    sceneState.distance = 1780;
  }

  function animate(timestamp) {
    if (!sceneState.isReady || !sceneState.renderer) {
      return;
    }

    updateCamera();
    updateRouteTracer(timestamp);
    syncLabels();
    sceneState.renderer.render(sceneState.scene, sceneState.camera);
    requestAnimationFrame(animate);
  }

  function initialize() {
    const fallback = document.getElementById("sceneFallback");
    const focusButton = document.getElementById("focusScene");

    sceneState.container = document.getElementById("threeStage");
    sceneState.overlay = document.getElementById("sceneOverlay");
    sceneState.labelLayer = document.getElementById("sceneLabelLayer");
    sceneState.isReady = false;

    if (!sceneState.container || !sceneState.overlay || !sceneState.labelLayer) {
      if (fallback) {
        fallback.textContent = "The 3D viewer container is missing from the page. Refresh once to load the latest layout.";
      }

      if (focusButton) {
        focusButton.disabled = true;
      }

      return;
    }

    if (!hasThree()) {
      if (focusButton) {
        focusButton.disabled = true;
      }

      if (fallback) {
        fallback.textContent = "Three.js could not be loaded. Refresh the page and make sure the local 3D library file is being served.";
      }
      return;
    }

    fallback?.remove();
    if (focusButton) {
      focusButton.disabled = false;
    }

    sceneState.scene = new THREE.Scene();
    sceneState.scene.background = cssColor("--page-bg", "#f3efe6");
    sceneState.camera = new THREE.PerspectiveCamera(42, 1, 1, 6000);
    sceneState.target = new THREE.Vector3(0, 80, 0);
    sceneState.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    sceneState.raycaster = new THREE.Raycaster();
    sceneState.pointer = new THREE.Vector2();
    sceneState.container.appendChild(sceneState.renderer.domElement);

    sceneState.root = new THREE.Group();
    sceneState.scene.add(sceneState.root);

    createLights();
    createFloor();
    createCorridors();
    createSpaces();
    createLabels();

    sceneState.isReady = true;
    updateHighlights();
    updateRoute();
    refocus();
    resize();
    bindPointerControls();
    window.addEventListener("resize", resize);
    requestAnimationFrame(animate);
  }

  app.threeScene = {
    initialize,
    applyTheme,
    updateRoute,
    updateHighlights,
    syncLabels,
    refocus,
    resize
  };
})(window.CITmaps);
