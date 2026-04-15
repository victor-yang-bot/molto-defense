// ============================================================
// CityCore - 2D Pixel Art Canvas Renderer
// Grid-based city builder / tower defense view
// ============================================================

const CityRenderer = (() => {
    // ---- State ----
    let canvas, ctx;
    let cellSize = 48;
    let offsetX = 0, offsetY = 0;
    let selectedBuildingType = null;
    let mouseX = -9999, mouseY = -9999;
    let hoveredGridX = -1, hoveredGridZ = -1;
    let ghostValid = false;
    let hoveredEntity = null;
    let lastTime = 0;
    let animTime = 0;

    // Sprite caches
    const buildingSprites = {};
    const zombieFrames = {}; // { type: [canvas, canvas, canvas, canvas] }
    const groundTiles = [];
    let projectileSprite = null;

    // ---- Public API ----
    function getSelectedBuildingType() { return selectedBuildingType; }
    function setSelectedBuildingType(type) { selectedBuildingType = type; }

    // ============================================================
    // Init
    // ============================================================

    function init() {
        const container = document.getElementById('city-canvas');
        canvas = document.createElement('canvas');
        canvas.style.display = 'block';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        container.appendChild(canvas);

        ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        generateAllSprites();
        generateGroundTiles();
        resize();

        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('contextmenu', onRightClick);
        canvas.addEventListener('mouseleave', onMouseLeave);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('resize', resize);

        requestAnimationFrame(animate);
    }

    function resize() {
        const container = document.getElementById('city-canvas');
        const w = container.clientWidth;
        const h = container.clientHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';

        // Calculate cell size to fit grid nicely
        const gridSize = GameState.gridSize;
        const maxCellW = (w - 40) / gridSize;
        const maxCellH = (h - 40) / gridSize;
        cellSize = Math.floor(Math.min(maxCellW, maxCellH, 64));
        cellSize = Math.max(cellSize, 24);

        const gridPxW = gridSize * cellSize;
        const gridPxH = gridSize * cellSize;
        offsetX = Math.floor((w * dpr - gridPxW * dpr) / 2);
        offsetY = Math.floor((h * dpr - gridPxH * dpr) / 2);

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ============================================================
    // Coordinate Conversion
    // ============================================================

    // World coords (game units, centered) <-> Canvas pixel coords
    function worldToCanvas(wx, wz) {
        const gridSize = GameState.gridSize;
        const halfGrid = gridSize / 2;
        const cx = (wx + halfGrid) * cellSize;
        const cy = (wz + halfGrid) * cellSize;
        const container = document.getElementById('city-canvas');
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        return {
            x: offsetX / dpr + cx,
            y: offsetY / dpr + cy,
        };
    }

    function canvasToWorld(px, py) {
        const gridSize = GameState.gridSize;
        const halfGrid = gridSize / 2;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cx = px - offsetX / dpr;
        const cy = py - offsetY / dpr;
        return {
            x: cx / cellSize - halfGrid,
            z: cy / cellSize - halfGrid,
        };
    }

    function canvasToGrid(px, py) {
        const gridSize = GameState.gridSize;
        const halfGrid = gridSize / 2;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cx = px - offsetX / dpr;
        const cy = py - offsetY / dpr;
        const gx = Math.floor(cx / cellSize);
        const gz = Math.floor(cy / cellSize);
        if (gx < 0 || gx >= gridSize || gz < 0 || gz >= gridSize) return null;
        return { x: gx, z: gz };
    }

    // ============================================================
    // Sprite Generation - All programmatic pixel art
    // ============================================================

    function makeOffscreen(w, h) {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        return { canvas: c, ctx: c.getContext('2d') };
    }

    function px(context, x, y, color) {
        context.fillStyle = color;
        context.fillRect(x, y, 1, 1);
    }

    // ---- Ground Tiles ----
    function generateGroundTiles() {
        groundTiles.length = 0;
        const grassColors = ['#2a3a2a', '#253525', '#2f3f2f', '#283828', '#2c3c2c'];
        for (let i = 0; i < 4; i++) {
            const { canvas: c, ctx: g } = makeOffscreen(16, 16);
            const base = grassColors[i % grassColors.length];
            g.fillStyle = base;
            g.fillRect(0, 0, 16, 16);
            // Subtle variation dots
            for (let d = 0; d < 12; d++) {
                const dx = (i * 7 + d * 3) % 16;
                const dy = (i * 5 + d * 11) % 16;
                g.fillStyle = grassColors[(i + d) % grassColors.length];
                g.fillRect(dx, dy, 1, 1);
            }
            groundTiles.push(c);
        }
    }

    // ---- Building Sprites ----
    function generateAllSprites() {
        generateBuildingSprites();
        generateZombieSprites();
        generateProjectileSprite();
    }

    function generateBuildingSprites() {
        // casa (house) - brown/amber peaked roof top-down
        buildingSprites.casa = generateBuilding('casa', (g) => {
            // Roof (diamond shape from top)
            px(g, 7, 2, '#92400e');
            px(g, 6, 3, '#b45309'); px(g, 7, 3, '#d97706'); px(g, 8, 3, '#b45309');
            px(g, 5, 4, '#b45309'); px(g, 6, 4, '#d97706'); px(g, 7, 4, '#f59e0b'); px(g, 8, 4, '#d97706'); px(g, 9, 4, '#b45309');
            px(g, 5, 5, '#b45309'); px(g, 6, 5, '#d97706'); px(g, 7, 5, '#d97706'); px(g, 8, 5, '#d97706'); px(g, 9, 5, '#b45309');
            px(g, 5, 6, '#b45309'); px(g, 6, 6, '#d97706'); px(g, 7, 6, '#d97706'); px(g, 8, 6, '#d97706'); px(g, 9, 6, '#b45309');
            px(g, 6, 7, '#92400e'); px(g, 7, 7, '#78350f'); px(g, 8, 7, '#92400e');
            // Door
            px(g, 7, 8, '#451a03'); px(g, 7, 9, '#451a03');
            // Chimney
            px(g, 4, 3, '#6b7280'); px(g, 4, 4, '#6b7280');
            // Windows
            px(g, 6, 8, '#fde68a'); px(g, 8, 8, '#fde68a');
        });

        // torre (tower) - red/stone tower with beacon
        buildingSprites.torre = generateBuilding('torre', (g) => {
            // Base stone
            for (let x = 5; x <= 10; x++) {
                px(g, x, 10, '#6b7280');
                px(g, x, 11, '#4b5563');
            }
            // Tower body
            for (let y = 3; y <= 9; y++) {
                const c = y % 2 === 0 ? '#991b1b' : '#dc2626';
                for (let x = 6; x <= 9; x++) {
                    px(g, x, y, c);
                }
            }
            // Battlements
            px(g, 5, 2, '#991b1b'); px(g, 7, 2, '#991b1b'); px(g, 10, 2, '#991b1b');
            px(g, 6, 3, '#fca5a5'); px(g, 9, 3, '#fca5a5');
            // Beacon light
            px(g, 7, 2, '#fbbf24'); px(g, 8, 2, '#fbbf24');
            px(g, 7, 1, '#fef08a'); px(g, 8, 1, '#fef08a');
            // Stone trim
            for (let x = 5; x <= 10; x++) { px(g, x, 9, '#9ca3af'); }
        });

        // mina (mine) - cyan dome with sparkles
        buildingSprites.mina = generateBuilding('mina', (g) => {
            // Dome
            px(g, 7, 2, '#67e8f9');
            px(g, 6, 3, '#22d3ee'); px(g, 7, 3, '#67e8f9'); px(g, 8, 3, '#22d3ee');
            px(g, 5, 4, '#22d3ee'); px(g, 6, 4, '#67e8f9'); px(g, 7, 4, '#a5f3fc'); px(g, 8, 4, '#67e8f9'); px(g, 9, 4, '#22d3ee');
            px(g, 5, 5, '#0891b2'); px(g, 6, 5, '#22d3ee'); px(g, 7, 5, '#67e8f9'); px(g, 8, 5, '#22d3ee'); px(g, 9, 5, '#0891b2');
            px(g, 5, 6, '#0891b2'); px(g, 6, 6, '#0891b2'); px(g, 7, 6, '#22d3ee'); px(g, 8, 6, '#0891b2'); px(g, 9, 6, '#0891b2');
            px(g, 6, 7, '#155e75'); px(g, 7, 7, '#155e75'); px(g, 8, 7, '#155e75');
            // Base
            for (let x = 5; x <= 10; x++) { px(g, x, 8, '#4b5563'); px(g, x, 9, '#374151'); }
            // Sparkle highlights
            px(g, 7, 3, '#ffffff');
            px(g, 6, 4, '#cffafe');
        });

        // granero (barn) - green barn
        buildingSprites.granero = generateBuilding('granero', (g) => {
            // Barn body
            for (let y = 4; y <= 10; y++) {
                for (let x = 4; x <= 11; x++) {
                    px(g, x, y, y < 7 ? '#4ade80' : '#16a34a');
                }
            }
            // Roof
            px(g, 7, 3, '#15803d'); px(g, 8, 3, '#15803d');
            for (let x = 5; x <= 10; x++) { px(g, x, 4, '#166534'); }
            // Door
            px(g, 7, 8, '#854d0e'); px(g, 8, 8, '#854d0e');
            px(g, 7, 9, '#854d0e'); px(g, 8, 9, '#854d0e');
            px(g, 7, 10, '#713f12'); px(g, 8, 10, '#713f12');
            // Cross beam
            px(g, 5, 6, '#a16207'); px(g, 10, 6, '#a16207');
            for (let x = 5; x <= 10; x++) px(g, x, 7, '#a16207');
            // Hay
            px(g, 4, 10, '#fbbf24'); px(g, 11, 10, '#fbbf24');
        });

        // muralla (wall) - grey stone wall
        buildingSprites.muralla = generateBuilding('muralla', (g) => {
            // Wall body
            for (let y = 3; y <= 11; y++) {
                for (let x = 3; x <= 12; x++) {
                    const isDark = (x + y) % 3 === 0;
                    px(g, x, y, isDark ? '#6b7280' : '#9ca3af');
                }
            }
            // Battlements top
            for (let x = 3; x <= 12; x += 2) {
                px(g, x, 2, '#6b7280'); px(g, x, 3, '#9ca3af');
            }
            // Stone texture
            px(g, 5, 5, '#4b5563'); px(g, 8, 7, '#4b5563');
            px(g, 10, 5, '#4b5563'); px(g, 6, 9, '#4b5563');
            // Arrow slit
            px(g, 7, 5, '#1f2937'); px(g, 7, 6, '#1f2937'); px(g, 8, 5, '#1f2937'); px(g, 8, 6, '#1f2937');
        });

        // cuartel (barracks) - purple military building with flag
        buildingSprites.cuartel = generateBuilding('cuartel', (g) => {
            // Building body
            for (let y = 5; y <= 11; y++) {
                for (let x = 4; x <= 11; x++) {
                    px(g, x, y, y < 8 ? '#8b5cf6' : '#7c3aed');
                }
            }
            // Roof
            for (let x = 3; x <= 12; x++) { px(g, x, 4, '#6d28d9'); px(g, x, 5, '#5b21b6'); }
            // Door
            px(g, 7, 9, '#3b0764'); px(g, 8, 9, '#3b0764');
            px(g, 7, 10, '#3b0764'); px(g, 8, 10, '#3b0764');
            px(g, 7, 11, '#1e0438'); px(g, 8, 11, '#1e0438');
            // Windows
            px(g, 5, 7, '#c4b5fd'); px(g, 10, 7, '#c4b5fd');
            // Flag pole
            px(g, 11, 1, '#d4d4d8'); px(g, 11, 2, '#d4d4d8'); px(g, 11, 3, '#d4d4d8');
            px(g, 11, 4, '#d4d4d8');
            // Flag
            px(g, 12, 1, '#a78bfa'); px(g, 13, 2, '#8b5cf6'); px(g, 12, 2, '#c4b5fd');
            // Shield emblem
            px(g, 7, 7, '#fbbf24'); px(g, 8, 7, '#fbbf24');
        });

        // mercado (market) - orange market stall
        buildingSprites.mercado = generateBuilding('mercado', (g) => {
            // Canopy poles
            px(g, 4, 4, '#78350f'); px(g, 4, 8, '#78350f');
            px(g, 11, 4, '#78350f'); px(g, 11, 8, '#78350f');
            // Canopy stripes
            for (let x = 4; x <= 11; x++) {
                px(g, x, 3, (x % 2 === 0) ? '#fb923c' : '#ea580c');
                px(g, x, 4, (x % 2 === 0) ? '#ea580c' : '#fb923c');
            }
            // Stall body
            for (let y = 5; y <= 10; y++) {
                for (let x = 5; x <= 10; x++) {
                    px(g, x, y, '#92400e');
                }
            }
            // Counter/shelf
            for (let x = 5; x <= 10; x++) { px(g, x, 5, '#b45309'); }
            // Goods
            px(g, 6, 6, '#fbbf24'); px(g, 7, 6, '#ef4444'); px(g, 8, 6, '#22d3ee');
            px(g, 9, 6, '#a3e635');
            px(g, 6, 7, '#f59e0b'); px(g, 8, 7, '#06b6d4');
            // Sign
            px(g, 5, 2, '#fef08a'); px(g, 6, 2, '#fef08a');
        });
    }

    function generateBuilding(typeId, drawFn) {
        const { canvas: c, ctx: g } = makeOffscreen(16, 16);
        g.imageSmoothingEnabled = false;
        drawFn(g);
        return c;
    }

    // ---- Zombie Sprites (4 walk frames each) ----
    function generateZombieSprites() {
        zombieFrames.zombie = createZombieType({
            bodyColor: '#5a7a5a', headColor: '#4a6a4a', clothColor: '#4a4a5a',
            darkColor: '#3d5c3d', eyeColor: '#ffcc00', mouthColor: '#2a1a0a',
        });
        zombieFrames.runner = createZombieType({
            bodyColor: '#6b8e6b', headColor: '#5a7a5a', clothColor: '#5a4a3a',
            darkColor: '#3d5c3d', eyeColor: '#ffcc00', mouthColor: '#2a1a0a',
            lean: true,
        });
        zombieFrames.tank = createZombieType({
            bodyColor: '#3d5c3d', headColor: '#2d4a2d', clothColor: '#4a3a3a',
            darkColor: '#1a2a1a', eyeColor: '#ff6600', mouthColor: '#1a0a00',
            big: true,
        });
        zombieFrames.spitter = createZombieType({
            bodyColor: '#5a8a3a', headColor: '#4a7a2a', clothColor: '#3a4a2a',
            darkColor: '#2a3a1a', eyeColor: '#ffcc00', mouthColor: '#8b0000',
            spitter: true,
        });
        zombieFrames.boss = createZombieType({
            bodyColor: '#2d4a2d', headColor: '#1d3a1d', clothColor: '#3a2a3a',
            darkColor: '#0a1a0a', eyeColor: '#ff0000', mouthColor: '#1a0a00',
            boss: true,
        });
    }

    function createZombieType(opts) {
        const frames = [];
        for (let f = 0; f < 4; f++) {
            const { canvas: c, ctx: g } = makeOffscreen(16, 16);
            g.imageSmoothingEnabled = false;
            drawZombieFrame(g, f, opts);
            frames.push(c);
        }
        return frames;
    }

    function drawZombieFrame(g, frame, opts) {
        const big = opts.big;
        const boss = opts.boss;
        const lean = opts.lean;
        const spitter = opts.spitter;
        const bc = opts.bodyColor;
        const hc = opts.headColor;
        const cc = opts.clothColor;
        const dc = opts.darkColor;
        const ec = opts.eyeColor;
        const mc = opts.mouthColor;

        // Leg animation offsets
        const legOffset = [0, 1, 0, -1][frame];
        const armOffset = [1, 0, -1, 0][frame];

        if (big || boss) {
            // Bigger zombie - tank/boss
            const s = boss ? 2 : 1; // extra size for boss

            // Shadow
            px(g, 6, 12, '#1a2a1a'); px(g, 7, 12, '#1a2a1a'); px(g, 8, 12, '#1a2a1a'); px(g, 9, 12, '#1a2a1a');
            if (boss) { px(g, 5, 12, '#1a2a1a'); px(g, 10, 12, '#1a2a1a'); px(g, 5, 11, '#1a2a1a'); px(g, 10, 11, '#1a2a1a'); }

            // Legs
            const ly = 10 + (legOffset > 0 ? 1 : 0);
            const ry = 10 + (legOffset < 0 ? 1 : 0);
            px(g, 6, ly, dc); px(g, 6, ly + 1, dc);
            px(g, 9, ry, dc); px(g, 9, ry + 1, dc);
            if (boss) { px(g, 5, ly, dc); px(g, 10, ry, dc); }

            // Body
            for (let y = 6; y <= 9; y++) {
                for (let x = 5; x <= 10; x++) {
                    px(g, x, y, bc);
                }
            }
            if (boss) {
                for (let y = 5; y <= 9; y++) { px(g, 4, y, bc); px(g, 11, y, bc); }
            }

            // Arms
            const la = 4 + armOffset;
            const ra = 4 - armOffset;
            px(g, 4, la, bc); px(g, 4, la + 1, bc); px(g, 3, la, hc);
            px(g, 11, ra, bc); px(g, 11, ra + 1, bc); px(g, 12, ra, hc);

            // Head
            const hy = boss ? 3 : 4;
            for (let x = 6; x <= 9; x++) {
                px(g, x, hy, hc);
            }
            px(g, 7, hy - 1, hc); px(g, 8, hy - 1, hc);
            if (boss) { px(g, 5, hy, hc); px(g, 10, hy, hc); px(g, 6, hy - 1, hc); px(g, 9, hy - 1, hc); }

            // Eyes
            px(g, 7, hy, ec); px(g, 8, hy, ec);

            // Boss horns
            if (boss) {
                px(g, 5, hy - 1, '#8b0000'); px(g, 5, hy - 2, '#8b0000');
                px(g, 10, hy - 1, '#8b0000'); px(g, 10, hy - 2, '#8b0000');
                px(g, 4, hy - 2, '#660000'); px(g, 11, hy - 2, '#660000');
            }
        } else {
            // Standard zombie
            const baseX = lean ? 7 : 7;
            const baseY = lean ? 4 : 5;

            // Shadow
            px(g, 6, 12, '#1a2a1a'); px(g, 7, 12, '#1a2a1a'); px(g, 8, 12, '#1a2a1a');

            // Legs
            const lly = 10 + (legOffset > 0 ? 1 : 0);
            const rly = 10 + (legOffset < 0 ? 1 : 0);
            px(g, 6, lly, dc); px(g, 6, lly + 1, dc);
            px(g, 8, rly, dc); px(g, 8, rly + 1, dc);

            // Body
            for (let y = baseY + 1; y <= 9; y++) {
                px(g, 6, y, cc); px(g, 7, y, bc); px(g, 8, y, bc); px(g, 9, y, cc);
            }

            // Arms (reaching forward zombie style)
            const la = baseY + armOffset;
            const ra = baseY - armOffset;
            px(g, 5, la, bc); px(g, 5, la + 1, hc); px(g, 4, la + 1, hc);
            px(g, 10, ra, bc); px(g, 10, ra + 1, hc); px(g, 11, ra + 1, hc);

            // Head
            px(g, 6, baseY, hc); px(g, 7, baseY, hc); px(g, 8, baseY, hc); px(g, 9, baseY, hc);
            px(g, 7, baseY - 1, hc); px(g, 8, baseY - 1, hc);

            // Eyes
            px(g, 7, baseY, ec); px(g, 8, baseY, ec);

            // Spitter mouth
            if (spitter) {
                px(g, 7, baseY + 1, mc); px(g, 8, baseY + 1, mc);
                px(g, 6, baseY + 1, '#00ff00'); // drool
            }
        }
    }

    // ---- Projectile Sprite ----
    function generateProjectileSprite() {
        const { canvas: c, ctx: g } = makeOffscreen(4, 4);
        g.imageSmoothingEnabled = false;
        px(g, 1, 0, '#ff8844'); px(g, 2, 0, '#ff8844');
        px(g, 0, 1, '#ff6622'); px(g, 1, 1, '#ffaa44'); px(g, 2, 1, '#ffaa44'); px(g, 3, 1, '#ff6622');
        px(g, 0, 2, '#ff6622'); px(g, 1, 2, '#ffaa44'); px(g, 2, 2, '#ffaa44'); px(g, 3, 2, '#ff6622');
        px(g, 1, 3, '#ff8844'); px(g, 2, 3, '#ff8844');
        projectileSprite = c;
    }

    // ============================================================
    // Drawing Functions
    // ============================================================

    function drawGround() {
        const gridSize = GameState.gridSize;
        for (let gz = 0; gz < gridSize; gz++) {
            for (let gx = 0; gx < gridSize; gx++) {
                const tileIdx = (gx * 7 + gz * 13) % groundTiles.length;
                const sx = offsetX / getDpr() + gx * cellSize;
                const sy = offsetY / getDpr() + gz * cellSize;
                ctx.drawImage(groundTiles[tileIdx], 0, 0, 16, 16, sx, sy, cellSize, cellSize);
            }
        }
    }

    function drawGridLines() {
        const gridSize = GameState.gridSize;
        const dpr = getDpr();
        const ox = offsetX / dpr;
        const oy = offsetY / dpr;
        const totalPx = gridSize * cellSize;

        ctx.strokeStyle = '#1a2a1a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= gridSize; i++) {
            ctx.moveTo(ox + i * cellSize, oy);
            ctx.lineTo(ox + i * cellSize, oy + totalPx);
            ctx.moveTo(ox, oy + i * cellSize);
            ctx.lineTo(ox + totalPx, oy + i * cellSize);
        }
        ctx.stroke();
    }

    function drawBuildings() {
        // Sort by grid position for depth (top-to-bottom, left-to-right)
        const sorted = [...GameState.buildings].sort((a, b) => {
            if (a.gridPos.z !== b.gridPos.z) return a.gridPos.z - b.gridPos.z;
            return a.gridPos.x - b.gridPos.x;
        });

        sorted.forEach(building => {
            const wp = getWorldPosFromGrid(building.gridPos.x, building.gridPos.z);
            const pos = worldToCanvas(wp.x, wp.z);
            const sprite = buildingSprites[building.type];
            if (!sprite) return;

            const drawX = pos.x - cellSize / 2;
            const drawY = pos.y - cellSize / 2;

            // Hover highlight
            if (hoveredEntity && hoveredEntity.type === 'building' && hoveredEntity.data.id === building.id) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                ctx.fillRect(drawX, drawY, cellSize, cellSize);
            }

            // Level scaling - slightly larger for higher levels
            const levelScale = 1 + (building.level - 1) * 0.05;
            const scaledSize = cellSize * levelScale;
            const offset = (scaledSize - cellSize) / 2;

            ctx.drawImage(sprite, 0, 0, 16, 16, drawX - offset, drawY - offset, scaledSize, scaledSize);

            // HP bar (only if damaged)
            if (building.hp < building.maxHp) {
                drawHPBar(drawX, drawY - 6, cellSize, 4, building.hp / building.maxHp);
            }

            // Level indicator
            if (building.level > 1) {
                ctx.fillStyle = '#fbbf24';
                ctx.font = `bold ${Math.max(8, cellSize * 0.22)}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillText(`Lv${building.level}`, pos.x, drawY - 1);
            }
        });
    }

    function drawEnemies() {
        const enemies = GameState.wave.enemies.filter(e => e.alive);

        // Sort by z for depth
        enemies.sort((a, b) => a.z - b.z);

        enemies.forEach(enemy => {
            const pos = worldToCanvas(enemy.x, enemy.z);
            const frames = zombieFrames[enemy.type];
            if (!frames) return;

            // Walk animation frame
            const phase = (enemy.animPhase || 0) + animTime * enemy.speed * 4;
            const frameIdx = Math.floor(phase) % 4;
            const sprite = frames[frameIdx];

            // Scale based on enemy size
            const scale = enemy.scale || 1.0;
            const spriteSize = cellSize * 0.8 * scale;
            const bobY = Math.abs(Math.sin(phase * 2)) * 2;

            // Hover highlight
            if (hoveredEntity && hoveredEntity.type === 'enemy' && hoveredEntity.data.id === enemy.id) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, spriteSize / 2 + 4, 0, Math.PI * 2);
                ctx.fill();
            }

            // Draw sprite
            ctx.drawImage(sprite, 0, 0, 16, 16,
                pos.x - spriteSize / 2,
                pos.y - spriteSize / 2 - bobY,
                spriteSize, spriteSize
            );

            // HP bar (only if damaged)
            if (enemy.hp < enemy.maxHp) {
                drawHPBar(pos.x - spriteSize / 2, pos.y - spriteSize / 2 - bobY - 6, spriteSize, 3, enemy.hp / enemy.maxHp);
            }
        });
    }

    function drawProjectiles() {
        if (!projectileSprite) return;

        GameState.wave.projectiles.forEach(proj => {
            const px_ = proj._curX !== undefined ? proj._curX : proj.fromX;
            const pz = proj._curZ !== undefined ? proj._curZ : proj.fromZ;
            const pos = worldToCanvas(px_, pz);

            const size = cellSize * 0.2;

            // Glow
            ctx.globalAlpha = 0.4 + Math.sin(animTime * 10) * 0.2;
            ctx.drawImage(projectileSprite, 0, 0, 4, 4,
                pos.x - size, pos.y - size, size * 2, size * 2);
            ctx.globalAlpha = 1.0;
        });
    }

    function drawRangeCircle() {
        if (!hoveredEntity) return;
        if (hoveredEntity.type === 'tower') {
            const b = hoveredEntity.data;
            const wp = getWorldPosFromGrid(b.gridPos.x, b.gridPos.z);
            const pos = worldToCanvas(wp.x, wp.z);
            const range = BUILDING_TYPES.torre.range * b.level * 0.5;
            const rangePx = range * cellSize;

            ctx.beginPath();
            ctx.arc(pos.x, pos.y, rangePx, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(74, 222, 128, 0.12)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(74, 222, 128, 0.4)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        } else if (hoveredEntity.type === 'enemy') {
            const e = hoveredEntity.data;
            const pos = worldToCanvas(e.x, e.z);
            const rangePx = 0.8 * cellSize;

            ctx.beginPath();
            ctx.arc(pos.x, pos.y, rangePx, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    function drawGhostPreview() {
        if (!selectedBuildingType) return;
        if (hoveredGridX < 0) return;

        const dpr = getDpr();
        const sx = offsetX / dpr + hoveredGridX * cellSize;
        const sy = offsetY / dpr + hoveredGridZ * cellSize;

        const valid = !isCellOccupied(hoveredGridX, hoveredGridZ) && canAfford(BUILDING_TYPES[selectedBuildingType].cost);

        // Ghost background
        ctx.fillStyle = valid ? 'rgba(74, 222, 128, 0.25)' : 'rgba(239, 68, 68, 0.25)';
        ctx.fillRect(sx, sy, cellSize, cellSize);

        // Ghost border
        ctx.strokeStyle = valid ? '#4ade80' : '#ef4444';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx + 1, sy + 1, cellSize - 2, cellSize - 2);

        // Ghost sprite (semi-transparent)
        const sprite = buildingSprites[selectedBuildingType];
        if (sprite) {
            ctx.globalAlpha = 0.6;
            ctx.drawImage(sprite, 0, 0, 16, 16, sx, sy, cellSize, cellSize);
            ctx.globalAlpha = 1.0;
        }

        // Tower range preview
        if (selectedBuildingType === 'torre' && valid) {
            const cx = sx + cellSize / 2;
            const cy = sy + cellSize / 2;
            const range = BUILDING_TYPES.torre.range * 0.5; // level 1
            const rangePx = range * cellSize;
            ctx.beginPath();
            ctx.arc(cx, cy, rangePx, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(74, 222, 128, 0.08)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(74, 222, 128, 0.3)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    function drawHPBar(x, y, width, height, ratio) {
        ratio = Math.max(0, Math.min(1, ratio));
        const color = ratio > 0.5 ? '#4ade80' : ratio > 0.25 ? '#fbbf24' : '#ef4444';

        // Background
        ctx.fillStyle = '#333333';
        ctx.fillRect(x, y, width, height);

        // Fill
        ctx.fillStyle = color;
        ctx.fillRect(x, y, width * ratio, height);

        // Border
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, width, height);
    }

    // ============================================================
    // Mine Sparkle Animation
    // ============================================================

    function drawMineSparkles() {
        const mines = GameState.buildings.filter(b => b.type === 'mina');
        mines.forEach(mine => {
            const wp = getWorldPosFromGrid(mine.gridPos.x, mine.gridPos.z);
            const pos = worldToCanvas(wp.x, wp.z);

            // Sparkle particles
            for (let i = 0; i < 3; i++) {
                const phase = animTime * 3 + i * 2.1 + mine.id;
                const sparkleAlpha = (Math.sin(phase) + 1) / 2;
                if (sparkleAlpha < 0.3) continue;

                const angle = phase + i * Math.PI * 2 / 3;
                const dist = cellSize * 0.2 + Math.sin(phase * 0.7) * cellSize * 0.1;
                const sx = pos.x + Math.cos(angle) * dist;
                const sy = pos.y + Math.sin(angle) * dist;

                ctx.fillStyle = `rgba(165, 243, 252, ${sparkleAlpha * 0.8})`;
                const sparkSize = 2 + sparkleAlpha * 2;
                ctx.fillRect(sx - sparkSize / 2, sy - sparkSize / 2, sparkSize, sparkSize);
            }
        });
    }

    // ============================================================
    // Barracks Flag Animation
    // ============================================================

    function drawBarracksFlags() {
        const barracks = GameState.buildings.filter(b => b.type === 'cuartel');
        barracks.forEach(barrack => {
            const wp = getWorldPosFromGrid(barrack.gridPos.x, barrack.gridPos.z);
            const pos = worldToCanvas(wp.x, wp.z);

            // Animate flag wave on top of barracks
            const flagWave = Math.sin(animTime * 4) * 2;
            const flagX = pos.x + cellSize * 0.25;
            const flagY = pos.y - cellSize * 0.35 + flagWave;

            ctx.fillStyle = '#8b5cf6';
            ctx.fillRect(flagX, flagY, cellSize * 0.15, cellSize * 0.08);
        });
    }

    // ============================================================
    // Hover Detection
    // ============================================================

    function updateHover() {
        hoveredEntity = null;

        // Check if hovering over a building
        const gp = canvasToGrid(mouseX, mouseY);
        if (gp) {
            const key = `${gp.x},${gp.z}`;
            if (GameState.grid.hasOwnProperty(key)) {
                const idx = GameState.grid[key];
                const building = GameState.buildings[idx];
                if (building) {
                    hoveredEntity = { type: 'building', data: building };
                    // Show range for towers
                    if (building.type === 'torre') {
                        hoveredEntity = { type: 'tower', data: building };
                    }
                    return;
                }
            }
        }

        // Check if hovering over an enemy
        if (GameState.wave.inProgress) {
            const worldPos = canvasToWorld(mouseX, mouseY);
            let closestEnemy = null;
            let closestDist = Infinity;

            GameState.wave.enemies.forEach(enemy => {
                if (!enemy.alive) return;
                const dx = enemy.x - worldPos.x;
                const dz = enemy.z - worldPos.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                const hitRadius = (enemy.size || 0.45) * 0.7;
                if (dist < hitRadius && dist < closestDist) {
                    closestDist = dist;
                    closestEnemy = enemy;
                }
            });

            if (closestEnemy) {
                hoveredEntity = { type: 'enemy', data: closestEnemy };
            }
        }
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

        if (!hoveredEntity || mouseX < 0) {
            tooltip.style.display = 'none';
            return;
        }

        const canvasRect = canvas.getBoundingClientRect();
        const screenX = canvasRect.left + mouseX;
        const screenY = canvasRect.top + mouseY;

        tooltip.style.display = 'block';
        tooltip.style.left = (screenX + 15) + 'px';
        tooltip.style.top = (screenY - 10) + 'px';

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
                <div style="color:#9ca3af;margin-top:4px;font-size:10px">Oleada ${GameState.wave.current} 🧟</div>
            `;
        } else if (hoveredEntity.type === 'building') {
            const b = hoveredEntity.data;
            const type = BUILDING_TYPES[b.type];
            tooltip.innerHTML = `
                <div style="font-weight:700;color:${hexColor(type.color)};margin-bottom:4px;">${type.emoji} ${type.name} Nv.${b.level}</div>
                <div>❤️ HP: <span style="color:#ef4444">${Math.floor(b.hp)}/${b.maxHp}</span></div>
                ${type.damage ? `<div>💥 DMG: <span style="color:#fbbf24">${type.damage * b.level}</span></div>` : ''}
                ${Object.keys(type.production).length > 0 ? `<div>📦 Producción: ${Object.entries(type.production).map(([r, v]) => `${r}+${(v * (1 + (b.level - 1) * 0.5)).toFixed(1)}/s`).join(', ')}</div>` : ''}
            `;
        }
    }

    function hexColor(n) {
        if (typeof n === 'number') return '#' + n.toString(16).padStart(6, '0');
        return '#aaaaaa';
    }

    // ============================================================
    // Mouse Events
    // ============================================================

    function onMouseMove(e) {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;

        const gp = canvasToGrid(mouseX, mouseY);
        if (gp) {
            hoveredGridX = gp.x;
            hoveredGridZ = gp.z;
        } else {
            hoveredGridX = -1;
            hoveredGridZ = -1;
        }

        updateHover();
    }

    function onRightClick(e) {
        e.preventDefault();

        if (!selectedBuildingType) return;

        const gp = canvasToGrid(mouseX, mouseY);
        if (!gp) return;
        if (isCellOccupied(gp.x, gp.z)) return;

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
        mouseX = -9999;
        mouseY = -9999;
        hoveredGridX = -1;
        hoveredGridZ = -1;
        hoveredEntity = null;
    }

    function onKeyDown(e) {
        if (e.key === 'Escape' && selectedBuildingType) {
            selectedBuildingType = null;
            if (window.UI && window.UI.clearSelection) window.UI.clearSelection();
        }
    }

    // ============================================================
    // Utility
    // ============================================================

    function getDpr() {
        return Math.min(window.devicePixelRatio || 1, 2);
    }

    // ============================================================
    // Main Render Loop
    // ============================================================

    function animate(timestamp) {
        requestAnimationFrame(animate);

        const dt = lastTime ? (timestamp - lastTime) / 1000 : 0.016;
        lastTime = timestamp;
        animTime += dt;

        const container = document.getElementById('city-canvas');
        const dpr = getDpr();
        const w = container.clientWidth;
        const h = container.clientHeight;

        // Clear
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, w, h);

        // Draw layers
        drawGround();
        drawGridLines();
        drawBuildings();
        drawMineSparkles();
        drawBarracksFlags();
        drawRangeCircle();
        drawEnemies();
        drawProjectiles();
        drawGhostPreview();

        // Tooltip
        updateTooltip();
    }

    // ============================================================
    // Public API
    // ============================================================

    return { init, getSelectedBuildingType, setSelectedBuildingType };
})();
