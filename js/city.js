// ============================================================
// CityCore - Three.js City Renderer v2
// Interactive: right-click build, hover range, projectiles
// ============================================================

const CityRenderer = (() => {
    let scene, camera, renderer, clock;
    let buildingMeshes = {};
    let enemyMeshes = {};
    let projectileMeshes = [];
    let ghostMesh = null;
    let ghostValid = false;
    let rangeRing = null;
    let hoveredEntity = null; // {type:'tower'|'enemy', data}
    let groundPlane;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-999, -999);
    const mouseNDC = new THREE.Vector2(-999, -999);

    const GRID_SIZE = 12;
    let selectedBuildingType = null;

    // Expose for UI
    function getSelectedBuildingType() { return selectedBuildingType; }
    function setSelectedBuildingType(type) { selectedBuildingType = type; }

    function init() {
        const container = document.getElementById('city-canvas');
        const w = container.clientWidth;
        const h = container.clientHeight;

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0a1a);
        scene.fog = new THREE.FogExp2(0x0a0a1a, 0.02);

        camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 200);
        camera.position.set(12, 14, 12);
        camera.lookAt(0, 0, 0);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2;
        container.appendChild(renderer.domElement);

        clock = new THREE.Clock();
        setupLighting();
        createGround();
        createGridLines();
        createGhost();
        createRangeRing();

        // Events
        renderer.domElement.addEventListener('mousemove', onMouseMove);
        renderer.domElement.addEventListener('contextmenu', onRightClick);
        renderer.domElement.addEventListener('mouseleave', onMouseLeave);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('resize', onResize);

        animate();
    }

    function setupLighting() {
        scene.add(new THREE.AmbientLight(0x404060, 0.6));

        const sun = new THREE.DirectionalLight(0xfff0dd, 1.0);
        sun.position.set(10, 20, 8);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 60;
        sun.shadow.camera.left = -15;
        sun.shadow.camera.right = 15;
        sun.shadow.camera.top = 15;
        sun.shadow.camera.bottom = -15;
        scene.add(sun);

        const fill = new THREE.DirectionalLight(0x4488ff, 0.3);
        fill.position.set(-8, 10, -6);
        scene.add(fill);

        const rim = new THREE.DirectionalLight(0xff8844, 0.2);
        rim.position.set(0, 5, -12);
        scene.add(rim);

        const warm = new THREE.PointLight(0xffaa44, 0.4, 25);
        warm.position.set(0, 3, 0);
        scene.add(warm);
    }

    function createGround() {
        const groundGeo = new THREE.PlaneGeometry(GRID_SIZE + 6, GRID_SIZE + 6);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a2332, roughness: 0.9, metalness: 0.1 });
        groundPlane = new THREE.Mesh(groundGeo, groundMat);
        groundPlane.rotation.x = -Math.PI / 2;
        groundPlane.position.y = -0.02;
        groundPlane.receiveShadow = true;
        groundPlane.name = 'ground';
        scene.add(groundPlane);

        const platGeo = new THREE.BoxGeometry(GRID_SIZE + 0.2, 0.15, GRID_SIZE + 0.2);
        const platMat = new THREE.MeshStandardMaterial({ color: 0x253040, roughness: 0.8 });
        const platform = new THREE.Mesh(platGeo, platMat);
        platform.position.y = 0;
        platform.receiveShadow = true;
        scene.add(platform);
    }

    function createGridLines() {
        const offset = GRID_SIZE / 2;
        const mat = new THREE.LineBasicMaterial({ color: 0x2a3a4a, transparent: true, opacity: 0.3 });
        const pts = [];
        for (let i = 0; i <= GRID_SIZE; i++) {
            const p = i - offset;
            pts.push(new THREE.Vector3(p, 0.08, -offset), new THREE.Vector3(p, 0.08, offset));
            pts.push(new THREE.Vector3(-offset, 0.08, p), new THREE.Vector3(offset, 0.08, p));
        }
        scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }

    // ============================================================
    // Ghost Preview (building placement)
    // ============================================================

    function createGhost() {
        const geo = new THREE.BoxGeometry(0.85, 0.6, 0.85);
        const mat = new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.35, depthWrite: false });
        ghostMesh = new THREE.Mesh(geo, mat);
        ghostMesh.visible = false;
        ghostMesh.position.y = 0.4;
        scene.add(ghostMesh);
    }

    function updateGhost() {
        if (!selectedBuildingType) {
            ghostMesh.visible = false;
            return;
        }
        // Raycast to ground
        raycaster.setFromCamera(mouseNDC, camera);
        const hits = raycaster.intersectObject(groundPlane);
        if (hits.length === 0) { ghostMesh.visible = false; return; }

        const gp = getGridPosFromWorld(hits[0].point.x, hits[0].point.z);
        if (!gp) { ghostMesh.visible = false; return; }

        ghostValid = !isCellOccupied(gp.x, gp.z);
        const wp = getWorldPosFromGrid(gp.x, gp.z);
        ghostMesh.position.x = wp.x;
        ghostMesh.position.z = wp.z;
        ghostMesh.visible = true;

        // Color based on validity
        const color = ghostValid ? 0x4ade80 : 0xef4444;
        ghostMesh.material.color.setHex(color);
    }

    // ============================================================
    // Range Ring
    // ============================================================

    function createRangeRing() {
        const geo = new THREE.RingGeometry(0.1, 5, 64);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x4ade80,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        rangeRing = new THREE.Mesh(geo, mat);
        rangeRing.rotation.x = -Math.PI / 2;
        rangeRing.position.y = 0.1;
        rangeRing.visible = false;
        scene.add(rangeRing);
    }

    function showRange(worldX, worldZ, radius, color) {
        rangeRing.visible = true;
        rangeRing.position.x = worldX;
        rangeRing.position.z = worldZ;
        rangeRing.material.color.setHex(color);
        rangeRing.scale.set(radius / 5, radius / 5, 1);
        // Update ring inner/outer to match
        const inner = radius - 0.05;
        const outer = radius;
        rangeRing.geometry.dispose();
        rangeRing.geometry = new THREE.RingGeometry(inner, outer, 64);
        rangeRing.scale.set(1, 1, 1);
    }

    function hideRange() {
        rangeRing.visible = false;
    }

    // ============================================================
    // Mouse Events
    // ============================================================

    function getCanvasOffset(e) {
        const rect = renderer.domElement.getBoundingClientRect();
        return {
            x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
            y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
        };
    }

    function onMouseMove(e) {
        const ndc = getCanvasOffset(e);
        mouseNDC.copy(ndc);
        mouse.set(e.clientX, e.clientY);

        // Hover detection
        raycaster.setFromCamera(ndc, camera);

        // Check towers
        hoveredEntity = null;
        const towerGroups = GameState.buildings
            .filter(b => b.type === 'torre')
            .map(b => buildingMeshes[b.id])
            .filter(Boolean);

        if (towerGroups.length > 0) {
            const hits = raycaster.intersectObjects(towerGroups.flatMap(g => g.children), true);
            if (hits.length > 0) {
                // Find which tower group
                let obj = hits[0].object;
                while (obj.parent && !obj.userData.buildingId) obj = obj.parent;
                if (obj.userData.buildingId) {
                    const building = GameState.buildings.find(b => b.id === obj.userData.buildingId);
                    if (building) {
                        const wp = getWorldPosFromGrid(building.gridPos.x, building.gridPos.z);
                        const range = BUILDING_TYPES.torre.range * building.level * 0.5;
                        showRange(wp.x, wp.z, range, 0x4ade80);
                        hoveredEntity = { type: 'tower', data: building };
                    }
                }
            }
        }

        // Check enemies
        if (!hoveredEntity) {
            const enemyGroups = Object.values(enemyMeshes);
            if (enemyGroups.length > 0) {
                const hits = raycaster.intersectObjects(enemyGroups.flatMap(g => g.children), true);
                if (hits.length > 0) {
                    let obj = hits[0].object;
                    while (obj.parent && !obj.userData.enemyId) obj = obj.parent;
                    if (obj.userData.enemyId) {
                        const enemy = GameState.wave.enemies.find(e => e.id === obj.userData.enemyId);
                        if (enemy && enemy.alive) {
                            showRange(enemy.x, enemy.z, 0.8, 0xef4444);
                            hoveredEntity = { type: 'enemy', data: enemy };
                        }
                    }
                }
            }
        }

        if (!hoveredEntity) hideRange();

        updateGhost();
    }

    function onRightClick(e) {
        e.preventDefault();

        if (!selectedBuildingType) return;

        const ndc = getCanvasOffset(e);
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObject(groundPlane);
        if (hits.length === 0) return;

        const gp = getGridPosFromWorld(hits[0].point.x, hits[0].point.z);
        if (!gp || isCellOccupied(gp.x, gp.z)) return;

        const result = buildBuilding(selectedBuildingType, gp.x, gp.z);
        if (result.success) {
            const type = BUILDING_TYPES[selectedBuildingType];
            if (window.UI && window.UI.showToast) {
                window.UI.showToast(`${type.emoji} ${type.name} construida`, 'success');
            }
            if (window.UI && window.UI.refreshBuildPanel) {
                window.UI.refreshBuildPanel();
            }
        } else {
            if (window.UI && window.UI.showToast) {
                window.UI.showToast(result.error, 'error');
            }
        }
    }

    function onMouseLeave() {
        mouseNDC.set(-999, -999);
        ghostMesh.visible = false;
        hoveredEntity = null;
        hideRange();
    }

    function onKeyDown(e) {
        if (e.key === 'Escape' && selectedBuildingType) {
            selectedBuildingType = null;
            ghostMesh.visible = false;
            if (window.UI && window.UI.clearSelection) window.UI.clearSelection();
        }
    }

    // ============================================================
    // Building Meshes
    // ============================================================

    function createBuildingMesh(building) {
        const type = BUILDING_TYPES[building.type];
        const group = new THREE.Group();
        const wp = getWorldPosFromGrid(building.gridPos.x, building.gridPos.z);
        group.position.set(wp.x, 0.08, wp.z);
        group.userData.buildingId = building.id;

        const levelScale = 1 + (building.level - 1) * 0.15;
        const mat = new THREE.MeshStandardMaterial({
            color: type.color, roughness: 0.6, metalness: 0.3,
            emissive: type.color, emissiveIntensity: 0.1,
        });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.8, metalness: 0.2 });

        switch (type.shape) {
            case 'house': {
                const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8 * levelScale, 0.7), mat);
                base.position.y = 0.4 * levelScale; base.castShadow = true; group.add(base);
                const roof = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.5 * levelScale, 4),
                    new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.7 }));
                roof.position.y = 0.8 * levelScale + 0.25 * levelScale;
                roof.rotation.y = Math.PI / 4; roof.castShadow = true; group.add(roof);
                break;
            }
            case 'tower': {
                const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2 * levelScale, 8), mat);
                cyl.position.y = levelScale; cyl.castShadow = true; group.add(cyl);
                const top = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.15, 8), darkMat);
                top.position.y = 2 * levelScale; top.castShadow = true; group.add(top);
                const beacon = new THREE.PointLight(0xff4444, 0.6, 4);
                beacon.position.y = 2.3 * levelScale; group.add(beacon);
                break;
            }
            case 'mine': {
                const dome = new THREE.Mesh(
                    new THREE.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
                    new THREE.MeshStandardMaterial({ color: 0x22d3ee, roughness: 0.4, metalness: 0.6, emissive: 0x22d3ee, emissiveIntensity: 0.15 })
                );
                dome.position.y = 0; dome.castShadow = true; group.add(dome);
                for (let i = 0; i < 3; i++) {
                    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), new THREE.MeshBasicMaterial({ color: 0x88ffff }));
                    spark.position.set((Math.random() - 0.5) * 0.5, 0.3 + Math.random() * 0.3, (Math.random() - 0.5) * 0.5);
                    spark.userData.sparkle = true; group.add(spark);
                }
                break;
            }
            case 'barn': {
                const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6 * levelScale, 0.5), mat);
                base.position.y = 0.3 * levelScale; base.castShadow = true; group.add(base);
                const shape = new THREE.Shape();
                shape.moveTo(-0.4, 0); shape.lineTo(0, 0.35 * levelScale); shape.lineTo(0.4, 0); shape.lineTo(-0.4, 0);
                const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.55, bevelEnabled: false }),
                    new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.8 }));
                roof.position.set(0, 0.6 * levelScale, -0.275); roof.castShadow = true; group.add(roof);
                break;
            }
            case 'wall': {
                const wall = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2 * levelScale, 0.25), mat);
                wall.position.y = 0.6 * levelScale; wall.castShadow = true; group.add(wall);
                for (let i = -1; i <= 1; i++) {
                    const m = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.3), darkMat);
                    m.position.set(i * 0.25, 1.2 * levelScale + 0.1, 0); group.add(m);
                }
                break;
            }
            case 'barracks': {
                const base = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.9 * levelScale, 0.6), mat);
                base.position.y = 0.45 * levelScale; base.castShadow = true; group.add(base);
                const roof = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.1, 0.7), darkMat);
                roof.position.y = 0.9 * levelScale + 0.05; roof.castShadow = true; group.add(roof);
                const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), new THREE.MeshStandardMaterial({ color: 0x888 }));
                pole.position.set(0.35, 0.9 * levelScale + 0.35, 0); group.add(pole);
                const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.15), new THREE.MeshBasicMaterial({ color: 0x8b5cf6, side: THREE.DoubleSide }));
                flag.position.set(0.45, 0.9 * levelScale + 0.5, 0); flag.userData.flag = true; group.add(flag);
                break;
            }
            case 'market': {
                const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.6 * levelScale, 6),
                    new THREE.MeshStandardMaterial({ color: 0xfb923c, roughness: 0.5, emissive: 0xfb923c, emissiveIntensity: 0.1, side: THREE.DoubleSide }));
                canopy.position.y = 1.0 * levelScale; canopy.castShadow = true; group.add(canopy);
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2;
                    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7 * levelScale, 6), darkMat);
                    p.position.set(Math.cos(a) * 0.35, 0.35 * levelScale, Math.sin(a) * 0.35); group.add(p);
                }
                break;
            }
        }

        // HP bar (only if damaged)
        const hpBar = createHPBar(building.hp, building.maxHp, type.height * levelScale + 0.4);
        group.add(hpBar.container);
        group.userData.hpBar = hpBar;

        // Level indicator
        if (building.level > 1) {
            const canvas = document.createElement('canvas');
            canvas.width = 64; canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 40px Arial'; ctx.textAlign = 'center';
            ctx.fillText(`Lv${building.level}`, 32, 44);
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }));
            sprite.position.y = (type.height || 1) * levelScale + 0.7;
            sprite.scale.set(0.6, 0.6, 0.6);
            group.add(sprite);
        }

        scene.add(group);
        return group;
    }

    function createHPBar(current, max, yOffset) {
        const container = new THREE.Group();
        container.position.y = yOffset;

        const bgGeo = new THREE.PlaneGeometry(0.7, 0.08);
        const bg = new THREE.Mesh(bgGeo, new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide, depthTest: false }));
        bg.userData.billboard = true;
        container.add(bg);

        const ratio = Math.max(0, current / max);
        const color = ratio > 0.5 ? 0x4ade80 : ratio > 0.25 ? 0xfbbf24 : 0xef4444;
        const fillGeo = new THREE.PlaneGeometry(0.7 * ratio, 0.08);
        const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthTest: false }));
        fill.userData.billboard = true;
        fill.userData.hpFill = true;
        fill.position.x = -0.35 * (1 - ratio);
        container.add(fill);

        container.visible = current < max;
        return { container, bg, fill };
    }

    function updateBuildingHP(building, meshGroup) {
        if (!meshGroup || !meshGroup.userData.hpBar) return;
        const ratio = Math.max(0, building.hp / building.maxHp);
        const hpBar = meshGroup.userData.hpBar;

        hpBar.container.visible = building.hp < building.maxHp;
        if (!hpBar.container.visible) return;

        // Skip if HP hasn't changed
        const lastRatio = hpBar._lastRatio;
        if (lastRatio !== undefined && Math.abs(lastRatio - ratio) < 0.01) return;
        hpBar._lastRatio = ratio;

        const color = ratio > 0.5 ? 0x4ade80 : ratio > 0.25 ? 0xfbbf24 : 0xef4444;
        hpBar.fill.geometry.dispose();
        hpBar.fill.geometry = new THREE.PlaneGeometry(0.7 * ratio, 0.08);
        hpBar.fill.material.color.setHex(color);
        hpBar.fill.position.x = -0.35 * (1 - ratio);
    }

    // ============================================================
    // Enemy Meshes (with HP bar)
    // ============================================================

    function createEnemyMesh(enemy) {
        const group = new THREE.Group();
        group.userData.enemyId = enemy.id;

        const body = new THREE.Mesh(
            new THREE.SphereGeometry(enemy.size, 8, 6),
            new THREE.MeshStandardMaterial({
                color: enemy.color, roughness: 0.5, metalness: 0.3,
                emissive: enemy.color, emissiveIntensity: 0.2,
            })
        );
        body.castShadow = true;
        group.add(body);

        // Eyes
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const eyeGeo = new THREE.SphereGeometry(0.06, 6, 6);
        const eye1 = new THREE.Mesh(eyeGeo, eyeMat);
        eye1.position.set(0.12, 0.1, -enemy.size * 0.75);
        group.add(eye1);
        const eye2 = new THREE.Mesh(eyeGeo, eyeMat);
        eye2.position.set(-0.12, 0.1, -enemy.size * 0.75);
        group.add(eye2);

        // Pupil
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const pupilGeo = new THREE.SphereGeometry(0.03, 4, 4);
        const p1 = new THREE.Mesh(pupilGeo, pupilMat);
        p1.position.set(0.12, 0.1, -enemy.size * 0.82);
        group.add(p1);
        const p2 = new THREE.Mesh(pupilGeo, pupilMat);
        p2.position.set(-0.12, 0.1, -enemy.size * 0.82);
        group.add(p2);

        // HP bar
        const hpBar = createEnemyHPBar(enemy.hp, enemy.maxHp, enemy.size + 0.5);
        group.add(hpBar.container);
        group.userData.hpBar = hpBar;

        scene.add(group);
        return group;
    }

    function createEnemyHPBar(current, max, yOffset) {
        const container = new THREE.Group();
        container.position.y = yOffset;

        const bg = new THREE.Mesh(
            new THREE.PlaneGeometry(0.6, 0.06),
            new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide, depthTest: false })
        );
        bg.userData.billboard = true;
        container.add(bg);

        const ratio = Math.max(0, current / max);
        const color = ratio > 0.5 ? 0x4ade80 : ratio > 0.25 ? 0xfbbf24 : 0xef4444;
        const fill = new THREE.Mesh(
            new THREE.PlaneGeometry(0.6 * ratio, 0.06),
            new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthTest: false })
        );
        fill.userData.billboard = true;
        fill.userData.hpFill = true;
        fill.position.x = -0.3 * (1 - ratio);
        container.add(fill);

        return { container, bg, fill };
    }

    function updateEnemyHP(enemy, meshGroup) {
        if (!meshGroup || !meshGroup.userData.hpBar) return;
        const ratio = Math.max(0, enemy.hp / enemy.maxHp);
        const hpBar = meshGroup.userData.hpBar;

        // Skip if HP hasn't changed
        const lastRatio = hpBar._lastRatio;
        if (lastRatio !== undefined && Math.abs(lastRatio - ratio) < 0.01) return;
        hpBar._lastRatio = ratio;

        const color = ratio > 0.5 ? 0x4ade80 : ratio > 0.25 ? 0xfbbf24 : 0xef4444;
        hpBar.fill.geometry.dispose();
        hpBar.fill.geometry = new THREE.PlaneGeometry(0.6 * ratio, 0.06);
        hpBar.fill.material.color.setHex(color);
        hpBar.fill.position.x = -0.3 * (1 - ratio);
    }

    // ============================================================
    // Projectile Mesh
    // ============================================================

    function createProjectileMesh(proj) {
        const group = new THREE.Group();

        // Glowing core
        const core = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 8, 8),
            new THREE.MeshBasicMaterial({ color: proj.color || 0xff4444 })
        );
        group.add(core);

        // Glow
        const glow = new THREE.Mesh(
            new THREE.SphereGeometry(0.15, 8, 8),
            new THREE.MeshBasicMaterial({ color: proj.color || 0xff4444, transparent: true, opacity: 0.3 })
        );
        group.add(glow);

        // Trail light
        const light = new THREE.PointLight(proj.color || 0xff4444, 0.5, 3);
        group.add(light);

        group.position.set(proj._curX || proj.fromX, proj._curY || 2, proj._curZ || proj.fromZ);
        scene.add(group);
        return group;
    }

    // ============================================================
    // Sync
    // ============================================================

    function syncBuildings() {
        const currentIds = new Set(GameState.buildings.map(b => b.id));
        const renderedIds = new Set(Object.keys(buildingMeshes).map(Number));

        for (const id of renderedIds) {
            if (!currentIds.has(id)) {
                scene.remove(buildingMeshes[id]);
                delete buildingMeshes[id];
            }
        }

        GameState.buildings.forEach(building => {
            const existing = buildingMeshes[building.id];
            if (!existing) {
                buildingMeshes[building.id] = createBuildingMesh(building);
            } else {
                updateBuildingHP(building, existing);
            }
        });
    }

    function syncEnemies() {
        const currentIds = new Set(GameState.wave.enemies.filter(e => e.alive).map(e => e.id));
        const renderedIds = new Set(Object.keys(enemyMeshes));

        for (const id of renderedIds) {
            if (!currentIds.has(id)) {
                scene.remove(enemyMeshes[id]);
                delete enemyMeshes[id];
            }
        }

        const time = clock.getElapsedTime();
        GameState.wave.enemies.forEach(enemy => {
            if (!enemy.alive) return;
            if (!enemyMeshes[enemy.id]) {
                enemyMeshes[enemy.id] = createEnemyMesh(enemy);
            }
            const mesh = enemyMeshes[enemy.id];
            mesh.position.x = enemy.x;
            mesh.position.z = enemy.z;
            mesh.position.y = enemy.size + Math.sin(time * 5 + enemy.x) * 0.1;
            if (enemy.dx !== undefined) {
                mesh.rotation.y = Math.atan2(enemy.dx, enemy.dz);
            }
            updateEnemyHP(enemy, mesh);
        });
    }

    function syncProjectiles() {
        const currentIds = new Set(GameState.wave.projectiles.map(p => p.id));
        const renderedIds = new Set(projectileMeshes.map(m => m.userData.projId));

        // Remove dead
        for (let i = projectileMeshes.length - 1; i >= 0; i--) {
            if (!currentIds.has(projectileMeshes[i].userData.projId)) {
                scene.remove(projectileMeshes[i]);
                projectileMeshes.splice(i, 1);
            }
        }

        // Add new
        GameState.wave.projectiles.forEach(proj => {
            const exists = projectileMeshes.find(m => m.userData.projId === proj.id);
            if (!exists) {
                const mesh = createProjectileMesh(proj);
                mesh.userData.projId = proj.id;
                projectileMeshes.push(mesh);
            } else {
                exists.position.set(proj._curX || proj.fromX, proj._curY || 2, proj._curZ || proj.fromZ);
            }
        });
    }

    // ============================================================
    // Tooltip
    // ============================================================

    function updateTooltip() {
        let tooltip = document.getElementById('hover-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'hover-tooltip';
            tooltip.style.cssText = 'position:fixed;pointer-events:none;background:rgba(17,24,39,0.95);border:1px solid #374151;border-radius:10px;padding:10px 14px;font-size:12px;color:#e5e7eb;z-index:100;max-width:220px;display:none;backdrop-filter:blur(8px);';
            document.body.appendChild(tooltip);
        }

        if (!hoveredEntity || mouseNDC.x < -1) {
            tooltip.style.display = 'none';
            return;
        }

        tooltip.style.display = 'block';
        tooltip.style.left = (mouse.x + 15) + 'px';
        tooltip.style.top = (mouse.y - 10) + 'px';

        if (hoveredEntity.type === 'tower') {
            const b = hoveredEntity.data;
            const type = BUILDING_TYPES.torre;
            const range = (type.range * b.level * 0.5).toFixed(1);
            const dps = (type.damage * b.level / type.fireRate).toFixed(1);
            tooltip.innerHTML = `
                <div style="font-weight:700;color:#ef4444;margin-bottom:4px;">🗼 Torre Nv.${b.level}</div>
                <div>💥 DPS: <span style="color:#fbbf24">${dps}</span></div>
                <div>📏 Rango: <span style="color:#4ade80">${range}</span></div>
                <div>❤️ HP: <span style="color:#ef4444">${Math.floor(b.hp)}/${b.maxHp}</span></div>
                <div style="color:#9ca3af;margin-top:4px;font-size:10px">CD: ${(type.fireRate / b.level).toFixed(1)}s</div>
            `;
        } else if (hoveredEntity.type === 'enemy') {
            const e = hoveredEntity.data;
            const etype = ENEMY_TYPES[e.type];
            tooltip.innerHTML = `
                <div style="font-weight:700;color:${hexColor(e.color)};margin-bottom:4px;">${etype.emoji} ${etype.name}</div>
                <div>❤️ HP: <span style="color:#ef4444">${Math.floor(e.hp)}/${e.maxHp}</span></div>
                <div>⚔️ DMG: <span style="color:#fbbf24">${e.damage}</span></div>
                <div>💨 Vel: <span style="color:#60a5fa">${e.speed.toFixed(1)}</span></div>
                <div style="color:#9ca3af;margin-top:4px;font-size:10px">Oleada ${GameState.wave.current}</div>
            `;
        }
    }

    function hexColor(n) {
        return '#' + n.toString(16).padStart(6, '0');
    }

    // ============================================================
    // Animation Loop
    // ============================================================

    function animate() {
        requestAnimationFrame(animate);
        const time = clock.getElapsedTime();

        // Camera stays static (no orbit)
        // sync
        Object.values(buildingMeshes).forEach(group => {
            group.children.forEach(child => {
                if (child.userData.sparkle) child.position.y = 0.3 + Math.sin(time * 3 + child.position.x * 10) * 0.15;
                if (child.userData.flag) child.rotation.y = Math.sin(time * 4) * 0.2;
                if (child.userData.billboard) child.lookAt(camera.position);
            });
        });

        // Billboard enemy HP bars
        Object.values(enemyMeshes).forEach(group => {
            group.children.forEach(child => {
                if (child.userData.billboard) child.lookAt(camera.position);
            });
        });

        // Billboard range ring
        if (rangeRing.visible) rangeRing.lookAt(camera.position);

        // Sync
        syncBuildings();
        syncEnemies();
        syncProjectiles();
        updateGhost();
        updateTooltip();

        renderer.render(scene, camera);
    }

    function onResize() {
        const container = document.getElementById('city-canvas');
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }

    return { init, getSelectedBuildingType, setSelectedBuildingType };
})();
