// === CONFIGURACIÓN GLOBAL (Se llenará desde config.json) ===
let CONFIG = {};
let SEEDS = [];
let FARMER_CONFIG = [];

// Estado del juego
let state = {
    coins: 200,
    level: 1,
    farmerLevel: 0,
    autoMode: false,
    plotsUnlocked: 5, 
    plots: [],
    levelUpNotifications: true,
    lastEarnings: [] // <-- AÑADIDO: Registro de ganancias
};

// Elementos
const farmEl = document.getElementById('farm');
const storeEl = document.getElementById('store');
const coinsEl = document.getElementById('coins');
const levelEl = document.getElementById('level');
const farmerLevelEl = document.getElementById('farmer-level');
const farmerSpeedEl = document.getElementById('farmer-speed');
const autoStatusEl = document.getElementById('auto-status');
const hireBtn = document.getElementById('hire-btn');
const upgradeFarmerBtn = document.getElementById('upgrade-farmer-btn');
const autoBtn = document.getElementById('auto-btn');
const unlockPlotBtn = document.getElementById('unlock-plot-btn');
const plotsUnlockedEl = document.getElementById('plots-unlocked');
const plotsTotalEl = document.getElementById('plots-total');
const music = document.getElementById('bg-music');
const notifyToggleEl = document.getElementById('notify-toggle'); 
const earningListEl = document.getElementById('earning-list'); // <-- AÑADIDO: Elemento de lista
let autoInterval;

// === INICIALIZACIÓN Y CARGA DE DATOS ===

async function loadConfig() {
    try {
        const response = await fetch('config.json');
        if (!response.ok) throw new Error('No se pudo cargar config.json');
        const data = await response.json();
        
        // Asignar los datos del JSON a las variables globales
        CONFIG = data;
        SEEDS = data.SEEDS;
        FARMER_CONFIG = data.FARMER_CONFIG;
        
        if (CONFIG.MUSIC_URL) { 
            music.src = CONFIG.MUSIC_URL;
        }
        
        loadGame();
    } catch (error) {
        console.error("Error al inicializar el juego:", error);
        alert("Error al cargar la configuración del juego.");
    }
}


// Cargar progreso
function loadGame() {
    const saved = localStorage.getItem('farmville_pro');
    if (saved) {
        const parsedState = JSON.parse(saved);
        state = {
            ...state,
            ...parsedState,
            plotsUnlocked: parsedState.plotsUnlocked || 5,
            // Asegurar que las nuevas variables existen
            levelUpNotifications: parsedState.levelUpNotifications !== undefined ? parsedState.levelUpNotifications : true,
            lastEarnings: parsedState.lastEarnings || [] // <-- AÑADIDO: Cargar o inicializar
        };
    }
    plotsTotalEl.textContent = CONFIG.PLOTS_TOTAL; 
    initStore();
    initFarm();
    updateUI();
    if (state.autoMode) startAutoFarmer();
}

// Guardar
function saveGame() {
    localStorage.setItem('farmville_pro', JSON.stringify(state));
}

// Helper para obtener config de Granjero
function getFarmerConfig(level = state.farmerLevel) {
    return FARMER_CONFIG.find(c => c.level === level) || { speedMultiplier: 0, maxSeedLevel: 0, cost: Infinity };
}

function getNextFarmerConfig() {
    return FARMER_CONFIG.find(c => c.level === state.farmerLevel + 1);
}

// === TIENDA ===
function initStore() {
    storeEl.innerHTML = '';
    SEEDS.forEach(seed => {
        const isLocked = state.level < seed.level;
        const card = document.createElement('div');
        card.className = `seed-card ${isLocked ? 'locked' : ''}`;
        card.innerHTML = `
          <div class="seed-icon">${seed.icon}</div>
          <div><strong>${seed.name}</strong></div>
          <div>Costo: ${seed.cost} Coins</div>
          <div>Tiempo: ${seed.time/1000}s</div>
          <div>Premio: ${seed.reward} Coins</div>
          ${isLocked ? `<div style="color:red;">Nivel ${seed.level}+</div>` : ''}
        `;
        if (!isLocked) {
          card.onclick = () => buySeed(seed);
        }
        storeEl.appendChild(card);
    });
}

function buySeed(seed) {
    if (state.coins < seed.cost) {
        alert("¡No tienes suficientes monedas!");
        return;
    }
    const emptyPlot = state.plots.slice(0, state.plotsUnlocked).find(p => p.status === 'empty');
    if (!emptyPlot) {
        alert("¡No hay parcelas libres! Compra más o espera.");
        return;
    }

    state.coins -= seed.cost;
    const index = state.plots.indexOf(emptyPlot);
    plantCrop(index, seed);
    updateUI();
}

// === GRANJA ===
function initFarm() {
    farmEl.innerHTML = '';
    for (let i = 0; i < CONFIG.PLOTS_TOTAL; i++) {
        const plot = document.createElement('div');
        plot.dataset.index = i;
        plot.onclick = () => manualHarvest(i);
        farmEl.appendChild(plot);

        state.plots[i] = state.plots[i] || { status: 'empty', seed: null, plantTime: null, element: plot };
        state.plots[i].element = plot;

        if (i >= state.plotsUnlocked) {
            plot.className = 'plot locked';
            // getPlotUnlockCost(i) es incorrecto, debería ser el coste
            plot.textContent = `Bloqueada: Nivel ${i*2}+`; // Mejor dejar un valor de referencia o quitar el texto si es confuso.
        } else {
            if (state.plots[i].status === 'growing') {
                continueGrowth(i);
            }
        }
        updatePlot(i);
    }
}

function plantCrop(index, seed) {
    const plot = state.plots[index];
    plot.status = 'growing';
    plot.seed = seed;
    plot.plantTime = Date.now();
    plot.element.innerHTML = `
        <div class="plant">${seed.icon}</div>
        <div class="timer" id="timer-${index}">${seed.time/1000}s</div>
        <div class="progress-bar"><div class="progress" id="progress-${index}"></div></div>
    `;
    startGrowthTimer(index);
}

function startGrowthTimer(index) {
    const plot = state.plots[index];
    const timerEl = document.getElementById(`timer-${index}`);
    const progressEl = document.getElementById(`progress-${index}`);
    
    if (plot.interval) clearInterval(plot.interval);

    const interval = setInterval(() => {
        if (!plot || plot.status !== 'growing') {
            clearInterval(interval);
            return;
        }

        const elapsed = Date.now() - plot.plantTime;
        const remaining = Math.max(0, plot.seed.time - elapsed);
        const progress = (elapsed / plot.seed.time) * 100;

        progressEl.style.width = `${Math.min(progress, 100)}%`;
        const secs = Math.ceil(remaining / 1000);
        timerEl.textContent = secs > 0 ? `${secs}s` : '¡Listo!';

        if (remaining <= 0) {
            clearInterval(interval);
            finishGrowth(index);
        }
    }, 100);
    plot.interval = interval;
}

function continueGrowth(index) {
    const plot = state.plots[index];
    const remaining = plot.seed.time - (Date.now() - plot.plantTime);
    if (remaining > 0) {
        plot.element.innerHTML = `
            <div class="plant">${plot.seed.icon}</div>
            <div class="timer" id="timer-${index}">${Math.ceil(remaining/1000)}s</div>
            <div class="progress-bar"><div class="progress" id="progress-${index}"></div></div>
        `;
        startGrowthTimer(index);
    } else {
        finishGrowth(index);
    }
}

function finishGrowth(index) {
    const plot = state.plots[index];
    plot.status = 'ready';
    updatePlot(index);
}

// FUNCIÓN HARVEST CON LÓGICA DE RECOMPENSA MEJORADA
function harvest(index) {
    const plot = state.plots[index];
    if (plot.status !== 'ready') return;

    // 1. Obtener valores necesarios
    const baseReward = plot.seed.reward;
    const playerLevel = state.level;
    const farmerLevel = state.farmerLevel;
    
    // 2. Calcular el multiplicador del granjero (lvl 1 = 1.1, lvl 2 = 1.2, etc.)
    const farmerMultiplier = 1.0 + (farmerLevel / 10); 

    // 3. Calcular la recompensa total con la nueva fórmula: (Valor base + Nivel del Personaje) * Multiplicador del Granjero
    const totalReward = Math.round((baseReward + playerLevel) * farmerMultiplier); 

    // 4. Aplicar la recompensa y subir de nivel
    state.coins += totalReward;
    levelUp();
    
    // 4.1. Registrar la ganancia (NUEVO CÓDIGO)
    const logEntry = {
        name: plot.seed.name,
        icon: plot.seed.icon,
        reward: totalReward,
        timestamp: Date.now()
    };
    
    // Añadir al principio y mantener solo las últimas 5
    state.lastEarnings.unshift(logEntry);
    if (state.lastEarnings.length > 5) {
        state.lastEarnings.pop();
    }
    
    // 5. Resetear la parcela
    plot.status = 'empty';
    plot.seed = null; 
    plot.plantTime = null;
    if (plot.interval) clearInterval(plot.interval); 
    
    updatePlot(index);
    updateUI();
}

function manualHarvest(index) {
    if (state.plots[index].status === 'ready') {
        harvest(index);
    }
}

function updatePlot(index) {
    const plot = state.plots[index];
    const el = plot.element;
    
    if (index >= state.plotsUnlocked) return;

    el.className = 'plot'; 
    
    if (plot.status === 'empty') {
        el.innerHTML = `<div style="color:#aaa; margin-top:30px;">🌱</div>`;
    } else if (plot.status === 'ready') {
        el.innerHTML = `
          <div class="plant ready">${plot.seed.icon}</div>
          <div class="timer">¡Listo!</div>
          <div class="progress-bar"><div class="progress" style="width:100%; background:#FFD700;"></div></div>
          <button class="harvest-btn" onclick="event.stopPropagation(); harvest(${index})">Cosechar</button>
          ${state.autoMode ? '<div class="auto-harvest">Auto</div>' : ''}
        `;
    }
}

// === GRANJERO AUTOMÁTICO Y MEJORAS ===
function getPlotUnlockCost(unlocked) {
    if (unlocked >= CONFIG.PLOTS_TOTAL) return Infinity;
    // La fórmula de coste empieza a partir de la 6ta parcela (índice 5)
    return 1000 + Math.max(0, unlocked - 5) * 500; // Restaurado a 500 basado en tu lógica original de coste de parcelas.
}

function unlockPlot() {
    const cost = getPlotUnlockCost(state.plotsUnlocked);
    if (state.plotsUnlocked >= CONFIG.PLOTS_TOTAL) {
        alert("¡Ya desbloqueaste todas las parcelas!");
        return;
    }
    if (state.coins < cost) {
        alert(`Necesitas ${cost} monedas para desbloquear la siguiente parcela.`);
        return;
    }
    
    state.coins -= cost;
    state.plotsUnlocked++;
    initFarm(); 
    updateUI();
}


function hireFarmer() {
    const config = getFarmerConfig(1);
    if (state.coins < config.cost || state.farmerLevel > 0) return;
    
    state.coins -= config.cost;
    state.farmerLevel = 1;
    updateUI();
    alert(`¡Granjero contratado (Nivel ${state.farmerLevel})! Ahora puedes activar Auto.`);
}

function upgradeFarmer() {
    const nextConfig = getNextFarmerConfig();
    if (!nextConfig) {
        alert("¡Granjero en nivel máximo!");
        return;
    }
    
    if (state.coins < nextConfig.cost) {
        alert(`Necesitas ${nextConfig.cost} monedas para mejorar al Granjero.`);
        return;
    }
    
    state.coins -= nextConfig.cost;
    state.farmerLevel = nextConfig.level;
    updateUI();
    alert(`¡Granjero mejorado al Nivel ${state.farmerLevel}! Más rápido y planta mejores semillas.`);
    
    if (state.autoMode) {
        clearInterval(autoInterval);
        startAutoFarmer();
    }
}

function toggleAuto() {
    if (state.farmerLevel === 0) {
        alert("¡Contrata un granjero primero!");
        return;
    }
    state.autoMode = !state.autoMode;
    
    if (state.autoMode) {
        startAutoFarmer();
    } else {
        clearInterval(autoInterval);
    }
    updateUI();
}

function startAutoFarmer() {
    const config = getFarmerConfig();
    const intervalTime = 1000 / config.speedMultiplier;

    if (autoInterval) clearInterval(autoInterval); 
    
    autoInterval = setInterval(() => {
        // Cosechar automáticamente
        state.plots.slice(0, state.plotsUnlocked).forEach((plot, i) => {
            if (plot.status === 'ready') {
                harvest(i); 
                updatePlot(i);
            }
        });
        
        // Plantar en parcelas vacías
        const emptyPlots = state.plots.slice(0, state.plotsUnlocked).filter(p => p.status === 'empty');
        if (emptyPlots.length > 0) {
            
            // Lógica para elegir la semilla con la MÁXIMA RECOMPENSA (rentabilidad)
            const bestSeed = SEEDS
                .filter(s => s.farmerLvl <= config.maxSeedLevel) 
                .sort((a, b) => b.reward - a.reward) // <-- Ordena por recompensa más alta
                .find(s => state.coins >= s.cost);
                
            if (bestSeed) {
                const idx = state.plots.indexOf(emptyPlots[0]);
                state.coins -= bestSeed.cost;
                plantCrop(idx, bestSeed);
                updateUI();
            }
        }
    }, intervalTime);
}

// === PROGRESIÓN Y UI ===
function levelUp() {
    const oldLevel = state.level;
    const newLevel = Math.floor(state.coins / 150) + 1; // Fórmula de nivel simple
    
    if (newLevel > oldLevel) {
        state.level = newLevel;
        
        // 1. Mostrar la notificación si está activa Y el nivel es menor a 20
        if (state.levelUpNotifications && state.level < 20) {
            alert(`¡Subiste al nivel ${state.level}! Nuevas semillas desbloqueadas.`);
        }
        
        // 2. Si se alcanza el Nivel 20 (y venías de un nivel inferior)
        if (state.level >= 20 && oldLevel < 20) {
            // Mostrar un mensaje especial si la notificación estaba activa
            if (state.levelUpNotifications) {
                 alert(`¡Subiste al nivel ${state.level}! ¡El tope de notificaciones se ha alcanzado! Ahora puedes desactivarlas.`);
            }
        }
        
        initStore();
    }
    updateUI();
}

// FUNCIÓN PARA RENDERIZAR EL REGISTRO DE GANANCIAS (AÑADIDO)
function renderEarningsLog() {
    earningListEl.innerHTML = '';
    
    if (state.lastEarnings.length === 0) {
        earningListEl.innerHTML = '<li>Aún no hay cosechas.</li>';
        return;
    }
    
    state.lastEarnings.forEach(log => {
        const li = document.createElement('li');
        
        // Formatear la hora
        const time = new Date(log.timestamp).toLocaleTimeString('es-ES', {
            hour: '2-digit', 
            minute:'2-digit',
            second: '2-digit'
        });
        
        li.innerHTML = `
            <div>${log.icon} ${log.name}</div> 
            <div class="earning-reward">+${log.reward}C (${time})</div>
        `;
        earningListEl.appendChild(li);
    });
}


// FUNCIÓN PARA DESACTIVAR NOTIFICACIONES
function toggleLevelUpNotifications() {
    state.levelUpNotifications = !state.levelUpNotifications;
    updateUI();
}

function updateUI() {
    const farmerConfig = getFarmerConfig();
    const nextFarmerConfig = getNextFarmerConfig();
    const unlockCost = getPlotUnlockCost(state.plotsUnlocked);
    
    // Stats
    coinsEl.textContent = state.coins;
    levelEl.textContent = state.level;
    farmerLevelEl.textContent = state.farmerLevel;
    farmerSpeedEl.textContent = `${Math.round(farmerConfig.speedMultiplier * 100)}%`;
    autoStatusEl.textContent = state.autoMode ? 'ON' : 'OFF';
    plotsUnlockedEl.textContent = state.plotsUnlocked;

    // Botones
    hireBtn.disabled = state.farmerLevel > 0 || state.coins < CONFIG.FARMER_BASE_COST;
    
    upgradeFarmerBtn.disabled = state.farmerLevel === 0 || !nextFarmerConfig || state.coins < nextFarmerConfig.cost;
    upgradeFarmerBtn.textContent = nextFarmerConfig 
        ? `Mejorar Granjero (-${nextFarmerConfig.cost} C)` 
        : 'Granjero Max';
        
    autoBtn.disabled = state.farmerLevel === 0;
    autoBtn.textContent = state.autoMode ? 'Auto ON' : 'Auto OFF';
    
    unlockPlotBtn.disabled = state.plotsUnlocked >= CONFIG.PLOTS_TOTAL || state.coins < unlockCost;
    unlockPlotBtn.textContent = state.plotsUnlocked >= CONFIG.PLOTS_TOTAL 
        ? 'Todas desbloqueadas' 
        : `Comprar Parcela (-${unlockCost} C)`;
        
    // Lógica para el botón de notificaciones
    if (state.level >= 20) {
        // Mostrar el botón
        notifyToggleEl.classList.remove('hidden');
        notifyToggleEl.textContent = state.levelUpNotifications ? 'Notificaciones ON' : 'Notificaciones OFF';
        // Se puede añadir estilo inline aquí si no funciona solo con CSS
    } else {
        // Ocultar el botón
        notifyToggleEl.classList.add('hidden');
    }

    saveGame();
    initStore();
    renderEarningsLog(); // <-- AÑADIDO: Renderizar el log de ganancias
}

// === MÚSICA ===
function toggleMusic() {
    const musicToggleEl = document.querySelector('.music-toggle');
    if (music.paused) {
        if (music.src) { 
            music.play().catch(() => {});
            musicToggleEl.textContent = 'Music On';
        } else {
            alert("No hay URL de música configurada.");
        }
    } else {
        music.pause();
        musicToggleEl.textContent = 'Music Off';
    }
}

// FUNCIÓN DE REINICIO AÑADIDA
function resetGame() {
    if (confirm("¿Estás seguro de que quieres REINICIAR el juego? Perderás todo tu progreso.")) {
        localStorage.removeItem('farmville_pro');
        window.location.reload(); 
    }
}

// Iniciar
window.onload = () => {
    loadConfig(); 
    music.volume = 0.3;
};