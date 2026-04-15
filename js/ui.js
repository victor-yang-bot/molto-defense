// ============================================================
// CityCore - Dashboard UI v2
// Right-click build mode, tooltips, improved panels
// ============================================================

const UI = (() => {
    let selectedType = null;

    function init() {
        setupTabs();
        renderBuildPanel();
        setupSaveButton();
        requestAnimationFrame(uiLoop);
    }

    function setupTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
                btn.classList.add('active');
                document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
                if (btn.dataset.tab === 'manage') renderManagePanel();
                if (btn.dataset.tab === 'defense') renderDefensePanel();
                if (btn.dataset.tab === 'stats') renderStatsPanel();
            });
        });
    }

    function setupSaveButton() {
        document.getElementById('btn-save').addEventListener('click', () => {
            saveGame();
            showToast('Juego guardado', 'success');
        });
    }

    // ============================================================
    // UI Loop
    // ============================================================

    function uiLoop() {
        requestAnimationFrame(uiLoop);
        updateResourceDisplay();
        updateWaveTimer();
        updateOverlay();
        updateSelectionBanner();
    }

    function updateResourceDisplay() {
        const rates = getProductionRates();
        document.getElementById('res-gold').textContent = formatNum(Math.floor(GameState.resources.gold));
        document.getElementById('res-gems').textContent = formatNum(Math.floor(GameState.resources.gems));
        document.getElementById('res-food').textContent = formatNum(Math.floor(GameState.resources.food));
        document.getElementById('res-pop').textContent = getCurrentPop();
        document.getElementById('res-pop-max').textContent = getMaxPop();

        const rateEls = document.querySelectorAll('#resources .resource-item');
        rateEls[0].querySelector('.text-gray-500').textContent = `(+${rates.gold.toFixed(1)}/s)`;
        rateEls[1].querySelector('.text-gray-500').textContent = `(+${rates.gems.toFixed(1)}/s)`;
        rateEls[2].querySelector('.text-gray-500').textContent = `(+${rates.food.toFixed(1)}/s)`;
    }

    function updateWaveTimer() {
        const timerEl = document.getElementById('wave-timer');
        const countdownEl = document.getElementById('wave-countdown');

        if (GameState.wave.inProgress) {
            timerEl.classList.remove('hidden');
            timerEl.classList.add('wave-alert');
            const alive = GameState.wave.enemies.filter(e => e.alive).length;
            countdownEl.textContent = `${alive} enemigo${alive !== 1 ? 's' : ''}`;
        } else if (GameState.wave.current > 0 || GameState.buildings.length > 0) {
            timerEl.classList.remove('hidden', 'wave-alert');
            countdownEl.textContent = Math.ceil(GameState.wave.timer);
        } else {
            timerEl.classList.add('hidden');
        }
    }

    function updateOverlay() {
        document.getElementById('overlay-buildings').textContent = GameState.buildings.length;
        document.getElementById('overlay-defense').textContent = GameState.buildings.filter(b => b.type === 'torre').length;
        document.getElementById('overlay-wave').textContent = GameState.wave.current;
    }

    // ============================================================
    // Selection Banner (shows when a building type is selected)
    // ============================================================

    function updateSelectionBanner() {
        let banner = document.getElementById('selection-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'selection-banner';
            banner.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:60;background:rgba(17,24,39,0.95);border:1px solid #f59e0b;border-radius:12px;padding:8px 20px;font-size:13px;color:#f59e0b;display:none;backdrop-filter:blur(8px);text-align:center;';
            document.body.appendChild(banner);
        }

        const current = CityRenderer.getSelectedBuildingType();
        if (current) {
            const type = BUILDING_TYPES[current];
            const affordable = canAfford(type.cost);
            banner.style.display = 'block';
            banner.style.borderColor = affordable ? '#4ade80' : '#ef4444';
            banner.innerHTML = `
                <span style="font-size:16px">${type.emoji}</span>
                <strong>${type.name}</strong> seleccionado
                ${affordable ? '' : '<span style="color:#ef4444;margin-left:8px">❌ Sin recursos</span>'}
                <span style="color:#9ca3af;margin-left:12px">Click derecho en el mapa para colocar · ESC para cancelar</span>
            `;
        } else {
            banner.style.display = 'none';
        }
    }

    // ============================================================
    // Build Panel (click to select, right-click to place)
    // ============================================================

    function renderBuildPanel() {
        const grid = document.getElementById('build-grid');
        grid.innerHTML = '';

        for (const [typeId, type] of Object.entries(BUILDING_TYPES)) {
            const affordable = canAfford(type.cost);
            const isSelected = CityRenderer.getSelectedBuildingType() === typeId;
            const card = document.createElement('div');
            card.className = `build-card ${isSelected ? 'border-amber-400 shadow-amber-400/20 shadow-lg' : ''} ${!affordable && !isSelected ? 'disabled' : ''}`;

            const costStr = Object.entries(type.cost)
                .map(([res, amount]) => {
                    const emoji = res === 'gold' ? '🪙' : res === 'gems' ? '💎' : res === 'food' ? '🌾' : '📦';
                    const current = GameState.resources[res] || 0;
                    const color = current >= amount ? 'text-green-400' : 'text-red-400';
                    return `<span class="${color}">${emoji}${formatNum(amount)}</span>`;
                }).join(' ');

            const prodStr = Object.entries(type.production)
                .map(([res, rate]) => {
                    const emoji = res === 'gold' ? '🪙' : res === 'gems' ? '💎' : res === 'food' ? '🌾' : res === 'troops' ? '⚔️' : '📦';
                    return `${emoji}+${rate}/s`;
                }).join(' ');

            card.innerHTML = `
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                        <span class="text-2xl">${type.emoji}</span>
                        <div>
                            <h3 class="font-bold text-sm">${type.name}</h3>
                            <p class="text-gray-500 text-xs">${type.desc}</p>
                        </div>
                    </div>
                    ${isSelected ? '<span class="text-xs text-amber-400 font-bold">✦ ACTIVO</span>' : ''}
                </div>
                ${type.production && Object.keys(type.production).length > 0 ? `<div class="text-xs text-gray-400 mb-2">${prodStr}</div>` : ''}
                ${type.damage ? `<div class="text-xs text-red-400 mb-2">💥 ${type.damage} DMG · Rango: ${type.range}</div>` : ''}
                ${type.hp ? `<div class="text-xs text-gray-500 mb-2">❤️ ${type.hp} HP</div>` : ''}
                ${type.pop ? `<div class="text-xs text-purple-400 mb-2">👥 +${type.pop} población</div>` : ''}
                ${type.goldMultiplier ? `<div class="text-xs text-amber-400 mb-2">📈 +${Math.round(type.goldMultiplier * 100)}% oro</div>` : ''}
                <div class="flex items-center justify-between mt-2">
                    <div class="text-xs">${costStr}</div>
                    <button class="${isSelected ? 'btn-gold' : 'btn-sm'}">${isSelected ? '✦ Seleccionado' : 'Seleccionar'}</button>
                </div>
            `;

            card.addEventListener('click', () => {
                const current = CityRenderer.getSelectedBuildingType();
                if (current === typeId) {
                    // Deselect
                    CityRenderer.setSelectedBuildingType(null);
                } else {
                    CityRenderer.setSelectedBuildingType(typeId);
                }
                renderBuildPanel();
            });

            grid.appendChild(card);
        }
    }

    function refreshBuildPanel() { renderBuildPanel(); }

    function clearSelection() {
        CityRenderer.setSelectedBuildingType(null);
        renderBuildPanel();
    }

    // ============================================================
    // Manage Panel
    // ============================================================

    function renderManagePanel() {
        const list = document.getElementById('manage-list');
        if (GameState.buildings.length === 0) {
            list.innerHTML = '<p class="text-gray-500 text-sm text-center py-8">No tenés edificios aún. Seleccioná uno y click derecho en el mapa.</p>';
            return;
        }
        list.innerHTML = '';

        GameState.buildings.forEach(building => {
            const type = BUILDING_TYPES[building.type];
            const item = document.createElement('div');
            item.className = 'manage-item';

            const upgradeCost = {};
            for (const [res, amount] of Object.entries(type.cost)) {
                upgradeCost[res] = Math.floor(amount * Math.pow(1.8, building.level - 1));
            }
            const canUpgrade = building.level < 10 && canAfford(upgradeCost);
            const hpPercent = Math.round((building.hp / building.maxHp) * 100);
            const hpColor = hpPercent > 50 ? '#4ade80' : hpPercent > 25 ? '#fbbf24' : '#ef4444';
            const costStr = Object.entries(upgradeCost).map(([res, amount]) => {
                const emoji = res === 'gold' ? '🪙' : res === 'gems' ? '💎' : res === 'food' ? '🌾' : '📦';
                return `${emoji}${formatNum(amount)}`;
            }).join(' ');

            item.innerHTML = `
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                        <span class="text-xl">${type.emoji}</span>
                        <div>
                            <span class="font-bold text-sm">${type.name}</span>
                            <span class="text-amber-400 text-xs ml-1">Nv.${building.level}</span>
                        </div>
                    </div>
                    <span class="text-gray-500 text-xs">(${building.gridPos.x}, ${building.gridPos.z})</span>
                </div>
                <div class="progress-bar mb-2">
                    <div class="progress-fill" style="width:${hpPercent}%;background:${hpColor};"></div>
                </div>
                <div class="text-xs text-gray-500 mb-2">HP: ${Math.floor(building.hp)} / ${building.maxHp}</div>
                <div class="flex items-center justify-between">
                    <span class="text-xs text-gray-400">Mejorar: ${costStr}</span>
                    <div class="flex gap-2">
                        <button class="btn-sm btn-upgrade" ${canUpgrade ? '' : 'disabled'}>⬆️ Mejorar</button>
                        <button class="btn-danger btn-demolish">🗑️</button>
                    </div>
                </div>
            `;

            item.querySelector('.btn-upgrade').addEventListener('click', () => {
                const result = upgradeBuilding(building.id);
                if (result.success) {
                    showToast(`${type.emoji} ${type.name} → Nv.${result.building.level}`, 'success');
                    renderManagePanel();
                } else { showToast(result.error, 'error'); }
            });

            item.querySelector('.btn-demolish').addEventListener('click', () => {
                if (confirm(`¿Demoler ${type.name}? Recuperás 50%.`)) {
                    demolishBuilding(building.id);
                    showToast(`${type.emoji} ${type.name} demolida`, 'warning');
                    renderManagePanel();
                }
            });

            list.appendChild(item);
        });
    }

    // ============================================================
    // Defense Panel
    // ============================================================

    function renderDefensePanel() {
        const info = document.getElementById('defense-info');
        const towers = GameState.buildings.filter(b => b.type === 'torre');
        const walls = GameState.buildings.filter(b => b.type === 'muralla');
        const barracks = GameState.buildings.filter(b => b.type === 'cuartel');
        const totalDps = getDefensePower();

        info.innerHTML = `
            <div class="stat-card"><div class="flex justify-between items-center"><span class="text-gray-400 text-sm">Oleada Actual</span><span class="text-white font-bold font-mono">${GameState.wave.current}</span></div></div>
            <div class="stat-card"><div class="flex justify-between items-center"><span class="text-gray-400 text-sm">DPS Total</span><span class="text-red-400 font-bold font-mono">${totalDps.toFixed(1)}</span></div></div>
            <div class="stat-card"><div class="flex justify-between items-center"><span class="text-gray-400 text-sm">Torres</span><span class="text-white font-mono">${towers.length}</span></div></div>
            <div class="stat-card"><div class="flex justify-between items-center"><span class="text-gray-400 text-sm">Murallas</span><span class="text-white font-mono">${walls.length}</span></div></div>
            <div class="stat-card"><div class="flex justify-between items-center"><span class="text-gray-400 text-sm">Cuarteles</span><span class="text-white font-mono">${barracks.length}</span></div></div>
            <div class="stat-card"><div class="flex justify-between items-center"><span class="text-gray-400 text-sm">Tropas</span><span class="text-purple-400 font-mono">${Math.floor(GameState.resources.troops)}</span></div></div>
            ${GameState.wave.current === 0 && GameState.buildings.length > 0 ? `
                <div class="bg-yellow-900/30 border border-yellow-700 rounded-lg p-3 text-yellow-300 text-xs">⚠️ Primera oleada en ${Math.ceil(GameState.wave.timer)}s. ¡Construí torres!</div>
            ` : ''}
            ${GameState.wave.inProgress ? `
                <div class="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300 text-xs wave-alert">⚔️ ¡Oleada ${GameState.wave.current}! ${GameState.wave.enemies.filter(e => e.alive).length} enemigos vivos</div>
            ` : ''}
        `;

        const history = document.getElementById('wave-history');
        if (GameState.stats.wavesSurvived > 0) {
            history.innerHTML = '';
            for (let i = GameState.stats.wavesSurvived; i >= Math.max(1, GameState.stats.wavesSurvived - 10); i--) {
                const entry = document.createElement('div');
                entry.className = 'flex justify-between text-gray-400 py-1 border-b border-gray-800';
                entry.innerHTML = `<span>Oleada ${i}</span><span class="text-green-400">✅</span>`;
                history.appendChild(entry);
            }
        }
    }

    // ============================================================
    // Stats Panel
    // ============================================================

    function renderStatsPanel() {
        const content = document.getElementById('stats-content');
        const hours = (GameState.stats.playTime / 3600).toFixed(1);
        content.innerHTML = `
            <div class="stat-card"><div class="text-gray-400 text-xs mb-1">Oro Total</div><div class="text-amber-400 font-bold font-mono text-lg">🪙 ${formatNum(Math.floor(GameState.stats.totalGoldEarned))}</div></div>
            <div class="stat-card"><div class="text-gray-400 text-xs mb-1">Gemas Totales</div><div class="text-cyan-400 font-bold font-mono text-lg">💎 ${formatNum(Math.floor(GameState.stats.totalGemsEarned))}</div></div>
            <div class="grid grid-cols-2 gap-2">
                <div class="stat-card"><div class="text-gray-400 text-xs mb-1">Construidos</div><div class="text-white font-bold font-mono">${GameState.stats.totalBuildings}</div></div>
                <div class="stat-card"><div class="text-gray-400 text-xs mb-1">Mejoras</div><div class="text-white font-bold font-mono">${GameState.stats.totalUpgrades}</div></div>
                <div class="stat-card"><div class="text-gray-400 text-xs mb-1">Oleadas</div><div class="text-green-400 font-bold font-mono">${GameState.stats.wavesSurvived}</div></div>
                <div class="stat-card"><div class="text-gray-400 text-xs mb-1">Máx Oleada</div><div class="text-red-400 font-bold font-mono">${GameState.stats.highestWave}</div></div>
                <div class="stat-card"><div class="text-gray-400 text-xs mb-1">Enemigos</div><div class="text-white font-bold font-mono">${GameState.stats.enemiesDefeated}</div></div>
                <div class="stat-card"><div class="text-gray-400 text-xs mb-1">Destruidos</div><div class="text-red-400 font-bold font-mono">${GameState.stats.buildingsDestroyed}</div></div>
            </div>
            <div class="stat-card"><div class="text-gray-400 text-xs mb-1">Tiempo</div><div class="text-white font-bold font-mono">⏱️ ${hours}h</div></div>
            <div class="border-t border-gray-800 pt-3 mt-3">
                <button class="btn-danger w-full py-2 text-sm" onclick="if(confirm('¿Resetear todo?')) resetGame()">🔄 Resetear Juego</button>
            </div>
        `;
    }

    // ============================================================
    // Toast
    // ============================================================

    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 3000);
    }

    function formatNum(n) {
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
        return n.toString();
    }

    // Expose globally
    window.UI = { init, showToast, refreshBuildPanel, clearSelection, renderBuildPanel };

    return { init, showToast, refreshBuildPanel, clearSelection };
})();

// ============================================================
// Bootstrap
// ============================================================

window.addEventListener('DOMContentLoaded', async () => {
    const loaded = await loadGame();
    CityRenderer.init();
    UI.init();

    if (window._offlineEarnings) {
        const e = window._offlineEarnings;
        const minutes = Math.floor(e.seconds / 60);
        UI.showToast(`¡Bienvenido! +${formatNumUI(e.gold)}🪙 ${formatNumUI(e.gems)}💎 ${formatNumUI(e.food)}🌾 en ${minutes}min`, 'info');
        delete window._offlineEarnings;
    } else if (!loaded) {
        UI.showToast('¡Bienvenido a CityCore! Seleccioná un edificio y click derecho en el mapa', 'info');
    }

    // Show session ID in toast
    const sid = getSessionId();
    if (loaded && sid) {
        UI.showToast(`Partida restaurada (${sid.slice(0, 8)}...)`, 'info');
    }

    function formatNumUI(n) {
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
        return n.toString();
    }

    // Game tick
    setInterval(() => {
        gameTick();
        UI.refreshBuildPanel();
    }, 1000);

    // Refresh manage/defense
    setInterval(() => {
        const manageTab = document.getElementById('tab-manage');
        if (!manageTab.classList.contains('hidden')) UI.renderManagePanel?.();
        const defenseTab = document.getElementById('tab-defense');
        if (!defenseTab.classList.contains('hidden')) renderDefensePanel();
    }, 3000);
});
