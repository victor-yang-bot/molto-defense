// ============================================================
// CityCore - Game Engine v2
// Resources, buildings, idle loop, wave defense, projectiles
// ============================================================

const BUILDING_TYPES = {
    casa: {
        id: 'casa', name: 'Casa', emoji: '🏠',
        desc: 'Aloja ciudadanos y genera oro',
        cost: { gold: 100 },
        production: { gold: 2 },
        pop: 10, hp: 50,
        color: 0xf59e0b, height: 1.2, shape: 'house',
    },
    torre: {
        id: 'torre', name: 'Torre de Defensa', emoji: '🗼',
        desc: 'Dispara a enemigos cercanos',
        cost: { gold: 250 },
        production: {},
        pop: 0, hp: 80,
        damage: 15, range: 3, fireRate: 1.5,
        color: 0xef4444, height: 2.5, shape: 'tower',
    },
    mina: {
        id: 'mina', name: 'Mina de Gemas', emoji: '💎',
        desc: 'Extrae gemas lentamente',
        cost: { gold: 500, gems: 10 },
        production: { gems: 0.5 },
        pop: 0, hp: 40,
        color: 0x22d3ee, height: 0.8, shape: 'mine',
    },
    granero: {
        id: 'granero', name: 'Granero', emoji: '🌾',
        desc: 'Produce comida para tropas',
        cost: { gold: 150 },
        production: { food: 1.5 },
        pop: 0, hp: 30,
        color: 0x4ade80, height: 1.0, shape: 'barn',
    },
    muralla: {
        id: 'muralla', name: 'Muralla', emoji: '🧱',
        desc: 'Barrera defensiva con alto HP',
        cost: { gold: 200 },
        production: {},
        pop: 0, hp: 200,
        color: 0x9ca3af, height: 1.5, shape: 'wall',
    },
    cuartel: {
        id: 'cuartel', name: 'Cuartel', emoji: '⚔️',
        desc: 'Entrena tropas automáticamente',
        cost: { gold: 400, food: 50 },
        production: { troops: 0.3 },
        pop: 5, hp: 100,
        defenseBonus: 0.1,
        color: 0x8b5cf6, height: 1.8, shape: 'barracks',
    },
    mercado: {
        id: 'mercado', name: 'Mercado', emoji: '🏪',
        desc: 'Multiplica producción de oro +20%',
        cost: { gold: 600 },
        production: {},
        pop: 5, hp: 60,
        goldMultiplier: 0.2,
        color: 0xfb923c, height: 1.4, shape: 'market',
    },
};

const ENEMY_TYPES = {
    goblin:    { id: 'goblin',    name: 'Goblin',    emoji: '👺', hp: 60,  speed: 1.2, damage: 5,  reward: { gold: 30 },             color: 0x65a30d, size: 0.4 },
    esqueleto: { id: 'esqueleto', name: 'Esqueleto', emoji: '💀', hp: 40,  speed: 2.0, damage: 8,  reward: { gold: 20 },             color: 0xd4d4d4, size: 0.35 },
    orco:      { id: 'orco',      name: 'Orco',      emoji: '👹', hp: 200, speed: 0.7, damage: 15, reward: { gold: 80 },             color: 0x854d0e, size: 0.6 },
    dragon:    { id: 'dragon',    name: 'Dragón',    emoji: '🐉', hp: 600, speed: 0.9, damage: 40, reward: { gold: 200, gems: 10 },   color: 0xdc2626, size: 0.8 },
};

// ============================================================
// Game State
// ============================================================

const GameState = {
    resources: { gold: 200, gems: 0, food: 0, troops: 0 },
    maxPop: 20,
    currentPop: 0,
    buildings: [],
    grid: {},
    gridSize: 12,
    wave: {
        current: 0,
        timer: 60,
        interval: 60,
        inProgress: false,
        enemies: [],
        projectiles: [],   // {id, fromX, fromZ, targetEnemyId, speed, damage, progress}
        towerCooldowns: {},
    },
    stats: {
        totalGoldEarned: 0, totalGemsEarned: 0,
        totalBuildings: 0, totalUpgrades: 0,
        wavesSurvived: 0, enemiesDefeated: 0,
        buildingsDestroyed: 0, playTime: 0, highestWave: 0,
    },
    lastTick: Date.now(),
    lastSave: Date.now(),
    nextBuildingId: 1,
    nextProjectileId: 1,
};

// ============================================================
// Helpers
// ============================================================

function canAfford(costs) {
    for (const [res, amount] of Object.entries(costs)) {
        if ((GameState.resources[res] || 0) < amount) return false;
    }
    return true;
}

function spendResources(costs) {
    for (const [res, amount] of Object.entries(costs)) {
        GameState.resources[res] -= amount;
    }
}

function getProductionRates() {
    const rates = { gold: 0, gems: 0, food: 0, troops: 0 };
    let goldMultiplier = 1;
    GameState.buildings.forEach(b => {
        const type = BUILDING_TYPES[b.type];
        const levelMult = 1 + (b.level - 1) * 0.5;
        for (const [res, rate] of Object.entries(type.production)) {
            rates[res] += rate * levelMult;
        }
        if (type.goldMultiplier) goldMultiplier += type.goldMultiplier;
    });
    rates.gold *= goldMultiplier;
    return rates;
}

function getMaxPop() {
    let pop = 20;
    GameState.buildings.forEach(b => {
        const type = BUILDING_TYPES[b.type];
        if (type.pop) pop += type.pop * b.level;
    });
    return pop;
}

function getCurrentPop() {
    return GameState.buildings.reduce((sum, b) => sum + (BUILDING_TYPES[b.type].pop || 0), 0);
}

function getDefensePower() {
    let power = 0;
    GameState.buildings.forEach(b => {
        if (b.type === 'torre') {
            const type = BUILDING_TYPES.torre;
            power += type.damage * b.level * (1 / type.fireRate);
        }
    });
    return power;
}

function isCellOccupied(gridX, gridZ) {
    return GameState.grid.hasOwnProperty(`${gridX},${gridZ}`);
}

function getGridPosFromWorld(worldX, worldZ) {
    const offset = GameState.gridSize / 2;
    const gx = Math.floor(worldX + offset);
    const gz = Math.floor(worldZ + offset);
    if (gx < 0 || gx >= GameState.gridSize || gz < 0 || gz >= GameState.gridSize) return null;
    return { x: gx, z: gz };
}

function getWorldPosFromGrid(gx, gz) {
    const offset = GameState.gridSize / 2;
    return { x: gx - offset + 0.5, z: gz - offset + 0.5 };
}

// ============================================================
// Building
// ============================================================

function buildBuilding(typeId, gridX, gridZ) {
    const type = BUILDING_TYPES[typeId];
    if (!type) return { success: false, error: 'Tipo desconocido' };
    if (!canAfford(type.cost)) return { success: false, error: 'Recursos insuficientes' };

    // Validate position
    if (gridX !== undefined && gridZ !== undefined) {
        if (gridX < 0 || gridX >= GameState.gridSize || gridZ < 0 || gridZ >= GameState.gridSize) {
            return { success: false, error: 'Posición fuera de la grilla' };
        }
        if (isCellOccupied(gridX, gridZ)) {
            return { success: false, error: 'Celda ocupada' };
        }
    } else {
        // Auto-place (fallback)
        const pos = getNextGridPos();
        if (!pos) return { success: false, error: 'Grilla llena' };
        gridX = pos.x;
        gridZ = pos.z;
    }

    const popAfter = getCurrentPop() + (type.pop || 0);
    if (popAfter > getMaxPop()) return { success: false, error: 'Población máxima' };

    spendResources(type.cost);

    const building = {
        id: GameState.nextBuildingId++,
        type: typeId,
        level: 1,
        hp: type.hp,
        maxHp: type.hp,
        gridPos: { x: gridX, z: gridZ },
    };

    const idx = GameState.buildings.length;
    GameState.buildings.push(building);
    GameState.grid[`${gridX},${gridZ}`] = idx;

    GameState.stats.totalBuildings++;
    GameState.currentPop = getCurrentPop();
    GameState.maxPop = getMaxPop();

    return { success: true, building };
}

function getNextGridPos() {
    const cx = Math.floor(GameState.gridSize / 2);
    const cz = Math.floor(GameState.gridSize / 2);
    if (!isCellOccupied(cx, cz)) return { x: cx, z: cz };

    const dirs = [[1,0],[0,1],[-1,0],[0,-1]];
    let x = cx, z = cz, d = 0, steps = 1;
    while (steps <= GameState.gridSize) {
        for (let s = 0; s < 2; s++) {
            for (let i = 0; i < steps; i++) {
                x += dirs[d][0]; z += dirs[d][1];
                if (x >= 0 && x < GameState.gridSize && z >= 0 && z < GameState.gridSize && !isCellOccupied(x, z)) {
                    return { x, z };
                }
            }
            d = (d + 1) % 4;
        }
        steps++;
    }
    return null;
}

function upgradeBuilding(buildingId) {
    const building = GameState.buildings.find(b => b.id === buildingId);
    if (!building) return { success: false, error: 'Edificio no encontrado' };
    const type = BUILDING_TYPES[building.type];
    const cost = {};
    for (const [res, amount] of Object.entries(type.cost)) {
        cost[res] = Math.floor(amount * Math.pow(1.8, building.level - 1));
    }
    if (!canAfford(cost)) return { success: false, error: 'Recursos insuficientes' };
    if (building.level >= 10) return { success: false, error: 'Nivel máximo (10)' };

    spendResources(cost);
    building.level++;
    building.maxHp = Math.floor(type.hp * Math.pow(1.5, building.level - 1));
    building.hp = building.maxHp;
    GameState.stats.totalUpgrades++;
    GameState.maxPop = getMaxPop();
    return { success: true, building, cost };
}

function demolishBuilding(buildingId) {
    const idx = GameState.buildings.findIndex(b => b.id === buildingId);
    if (idx === -1) return { success: false, error: 'No encontrado' };
    const building = GameState.buildings[idx];
    const type = BUILDING_TYPES[building.type];
    for (const [res, amount] of Object.entries(type.cost)) {
        GameState.resources[res] = Math.floor(GameState.resources[res] + amount * 0.5);
    }
    delete GameState.grid[`${building.gridPos.x},${building.gridPos.z}`];
    GameState.buildings.splice(idx, 1);
    GameState.grid = {};
    GameState.buildings.forEach((b, i) => { GameState.grid[`${b.gridPos.x},${b.gridPos.z}`] = i; });
    GameState.currentPop = getCurrentPop();
    GameState.maxPop = getMaxPop();
    GameState.stats.buildingsDestroyed++;
    return { success: true };
}

// ============================================================
// Waves & Tower Defense (with traveling projectiles)
// ============================================================

function generateWave(waveNum) {
    const enemies = [];
    const baseCount = 3 + Math.floor(waveNum * 1.5);
    const available = ['goblin'];
    if (waveNum >= 3) available.push('esqueleto');
    if (waveNum >= 5) available.push('orco');
    if (waveNum >= 8) available.push('dragon');

    for (let i = 0; i < baseCount; i++) {
        const typeId = available[Math.floor(Math.random() * available.length)];
        const t = ENEMY_TYPES[typeId];
        const hpScale = 1 + (waveNum - 1) * 0.3;
        const dmgScale = 1 + (waveNum - 1) * 0.15;
        enemies.push({
            id: `e_${Date.now()}_${i}`,
            type: typeId,
            hp: Math.floor(t.hp * hpScale),
            maxHp: Math.floor(t.hp * hpScale),
            speed: t.speed,
            damage: Math.floor(t.damage * dmgScale),
            reward: { ...t.reward },
            color: t.color,
            size: t.size,
            x: 0, z: 0,
            targetBuilding: null,
            alive: true,
        });
    }
    return enemies;
}

function startWave() {
    GameState.wave.current++;
    GameState.wave.inProgress = true;
    GameState.wave.enemies = generateWave(GameState.wave.current);
    GameState.wave.projectiles = [];
    GameState.wave.towerCooldowns = {};
    const g = GameState.gridSize;

    GameState.wave.enemies.forEach((e, i) => {
        const side = i % 4;
        const offset = (Math.random() - 0.5) * g * 0.8;
        switch (side) {
            case 0: e.x = -g/2; e.z = offset; break;
            case 1: e.x = g/2; e.z = offset; break;
            case 2: e.x = offset; e.z = -g/2; break;
            case 3: e.x = offset; e.z = g/2; break;
        }
        if (GameState.buildings.length > 0) {
            const target = GameState.buildings[Math.floor(Math.random() * GameState.buildings.length)];
            e.targetBuilding = target.id;
            const wp = getWorldPosFromGrid(target.gridPos.x, target.gridPos.z);
            const angle = Math.atan2(wp.z - e.z, wp.x - e.x);
            e.dx = Math.cos(angle) * e.speed * 0.02;
            e.dz = Math.sin(angle) * e.speed * 0.02;
        } else {
            e.dx = (Math.random() - 0.5) * 0.02;
            e.dz = (Math.random() - 0.5) * 0.02;
        }
    });
    GameState.stats.highestWave = Math.max(GameState.stats.highestWave, GameState.wave.current);
}

function updateWave(dt) {
    if (!GameState.wave.inProgress) {
        GameState.wave.timer -= dt;
        if (GameState.wave.timer <= 0) startWave();
        return;
    }

    const g = GameState.gridSize;

    // Move enemies
    GameState.wave.enemies.forEach(enemy => {
        if (!enemy.alive) return;
        enemy.x += enemy.dx;
        enemy.z += enemy.dz;
        const distToCenter = Math.sqrt(enemy.x * enemy.x + enemy.z * enemy.z);
        if (distToCenter < 1.5) {
            if (GameState.buildings.length > 0) {
                const target = GameState.buildings[Math.floor(Math.random() * GameState.buildings.length)];
                target.hp -= enemy.damage * dt;
                if (target.hp <= 0) {
                    delete GameState.grid[`${target.gridPos.x},${target.gridPos.z}`];
                    const idx = GameState.buildings.indexOf(target);
                    if (idx > -1) GameState.buildings.splice(idx, 1);
                    GameState.grid = {};
                    GameState.buildings.forEach((b, i) => { GameState.grid[`${b.gridPos.x},${b.gridPos.z}`] = i; });
                    GameState.stats.buildingsDestroyed++;
                    GameState.currentPop = getCurrentPop();
                    GameState.maxPop = getMaxPop();
                    if (GameState.buildings.length === 0) {
                        GameState.wave.enemies.forEach(e => e.alive = false);
                    }
                }
            }
            enemy.alive = false;
        }
    });

    // Tower attacks — fire projectiles
    GameState.buildings.forEach(building => {
        if (building.type !== 'torre') return;
        const type = BUILDING_TYPES.torre;
        const wp = getWorldPosFromGrid(building.gridPos.x, building.gridPos.z);
        if (!GameState.wave.towerCooldowns[building.id]) GameState.wave.towerCooldowns[building.id] = 0;
        GameState.wave.towerCooldowns[building.id] -= dt;
        if (GameState.wave.towerCooldowns[building.id] > 0) return;

        const range = type.range * building.level * 0.5;
        let closest = null;
        let closestDist = Infinity;
        GameState.wave.enemies.forEach(enemy => {
            if (!enemy.alive) return;
            const dist = Math.sqrt(Math.pow(enemy.x - wp.x, 2) + Math.pow(enemy.z - wp.z, 2));
            if (dist < range && dist < closestDist) { closest = enemy; closestDist = dist; }
        });

        if (closest) {
            GameState.wave.towerCooldowns[building.id] = type.fireRate / building.level;
            GameState.wave.projectiles.push({
                id: GameState.nextProjectileId++,
                fromX: wp.x,
                fromZ: wp.z,
                fromY: BUILDING_TYPES.torre.height * building.level,
                targetEnemyId: closest.id,
                speed: 8,
                damage: type.damage * building.level,
                color: 0xff4444,
            });
        }
    });

    // Update projectiles — travel toward targets
    GameState.wave.projectiles = GameState.wave.projectiles.filter(proj => {
        const target = GameState.wave.enemies.find(e => e.id === proj.targetEnemyId);
        if (!target || !target.alive) return false; // target died, remove

        const dx = target.x - proj._curX;
        const dz = target.z - proj._curZ;
        const dy = (target.size + 0.3) - proj._curY;
        const dist = Math.sqrt(dx * dx + dz * dz + dy * dy);

        if (dist < 0.3) {
            // Hit!
            target.hp -= proj.damage;
            if (target.hp <= 0) {
                target.alive = false;
                GameState.stats.enemiesDefeated++;
                for (const [res, amount] of Object.entries(target.reward)) {
                    GameState.resources[res] = (GameState.resources[res] || 0) + amount;
                    if (res === 'gold') GameState.stats.totalGoldEarned += amount;
                    if (res === 'gems') GameState.stats.totalGemsEarned += amount;
                }
            }
            return false; // remove projectile
        }

        const step = proj.speed * dt;
        proj._curX = (proj._curX || proj.fromX) + (dx / dist) * step;
        proj._curY = (proj._curY || proj.fromY) + (dy / dist) * step;
        proj._curZ = (proj._curZ || proj.fromZ) + (dz / dist) * step;

        return true;
    });

    // Check wave complete
    const alive = GameState.wave.enemies.filter(e => e.alive);
    if (alive.length === 0 && GameState.wave.inProgress) {
        GameState.wave.inProgress = false;
        GameState.wave.enemies = [];
        GameState.wave.projectiles = [];
        GameState.wave.timer = Math.max(30, GameState.wave.interval - GameState.wave.current * 2);
        GameState.stats.wavesSurvived++;
    }
}

// ============================================================
// Main Tick
// ============================================================

function gameTick() {
    const now = Date.now();
    const dt = Math.min((now - GameState.lastTick) / 1000, 5);
    GameState.lastTick = now;

    const rates = getProductionRates();
    GameState.resources.gold += rates.gold * dt;
    GameState.resources.gems += rates.gems * dt;
    GameState.resources.food += rates.food * dt;
    GameState.resources.troops += rates.troops * dt;
    GameState.stats.totalGoldEarned += rates.gold * dt;
    GameState.stats.totalGemsEarned += rates.gems * dt;
    GameState.stats.playTime += dt;
    updateWave(dt);

    if (now - GameState.lastSave > 30000) {
        saveGame();
        GameState.lastSave = now;
    }
}

// ============================================================
// Save / Load
// ============================================================

function saveGame() {
    const data = {
        resources: GameState.resources,
        buildings: GameState.buildings,
        gridSize: GameState.gridSize,
        wave: { current: GameState.wave.current, interval: GameState.wave.interval, timer: GameState.wave.timer },
        stats: GameState.stats,
        nextBuildingId: GameState.nextBuildingId,
        savedAt: Date.now(),
    };
    localStorage.setItem('citycore_save', JSON.stringify(data));
}

function loadGame() {
    const raw = localStorage.getItem('citycore_save');
    if (!raw) return false;
    try {
        const data = JSON.parse(raw);
        GameState.resources = data.resources || GameState.resources;
        GameState.buildings = data.buildings || [];
        GameState.gridSize = data.gridSize || 12;
        GameState.wave.current = data.wave?.current || 0;
        GameState.wave.interval = data.wave?.interval || 60;
        GameState.wave.timer = data.wave?.timer || 60;
        GameState.wave.inProgress = false;
        GameState.wave.enemies = [];
        GameState.wave.projectiles = [];
        GameState.wave.towerCooldowns = {};
        GameState.stats = data.stats || GameState.stats;
        GameState.nextBuildingId = data.nextBuildingId || 1;

        if (data.savedAt) {
            const offSec = Math.min((Date.now() - data.savedAt) / 1000, 3600 * 8);
            const rates = getProductionRates();
            const offGold = rates.gold * offSec;
            const offGems = rates.gems * offSec;
            const offFood = rates.food * offSec;
            if (offGold > 0 || offGems > 0) {
                GameState.resources.gold += offGold;
                GameState.resources.gems += offGems;
                GameState.resources.food += offFood;
                GameState.stats.totalGoldEarned += offGold;
                GameState.stats.totalGemsEarned += offGems;
                window._offlineEarnings = {
                    gold: Math.floor(offGold), gems: Math.floor(offGems),
                    food: Math.floor(offFood), seconds: Math.floor(offSec),
                };
            }
        }

        GameState.grid = {};
        GameState.buildings.forEach((b, i) => { GameState.grid[`${b.gridPos.x},${b.gridPos.z}`] = i; });
        GameState.currentPop = getCurrentPop();
        GameState.maxPop = getMaxPop();
        GameState.lastTick = Date.now();
        GameState.lastSave = Date.now();
        return true;
    } catch (e) { console.error('Load failed:', e); return false; }
}

function resetGame() { localStorage.removeItem('citycore_save'); location.reload(); }
