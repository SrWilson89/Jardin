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

// === FUNCIONES DE CONFIGURACIÓN Y UTILIDAD ===

function getFarmerConfig(level) {
    return FARMER_CONFIG.find(c => c.level === level) || FARMER_CONFIG[FARMER_CONFIG.length - 1];
}

function getSeed(id) {
    return SEEDS.find(s => s.id === id);
}

// LÓGICA DE COSTE DE PARCELA ACTUALIZADA
function getUnlockPlotCost() {
    // La primera parcela (la 6ta, ya que se empieza con 5) cuesta 500. 
    // Las siguientes aumentan en 200.
    const plotsPastBase = state.plotsUnlocked - 5; // 0, 1, 2, ...
    
    // Costo base para la 6ta parcela
    let cost = 500; 
    
    // Sumar 200 por cada parcela posterior a la base de 5.
    if (plotsPastBase > 0) {
        cost += plotsPastBase * 200;
    }
    
    return cost;
}

function calculateNextLevelExp() {
    return Math.floor(100 * Math.pow(1.5, state.level - 1));
}

// === FUNCIONES DEL JUEGO ===

function checkLevelUp(expGained) {
    // Lógica de subir de nivel simplificada: 1 exp por cosecha
    state.level += expGained;
    
    let nextExp = calculateNextLevelExp();
    while (state.level >= nextExp) {
        if (state.levelUpNotifications) {
            new Notification('¡Subiste de nivel!', { body: `¡Felicidades, eres Nivel ${state.level}! Nuevas semillas disponibles.` });
        }
        
        state.level++; // Subir un nivel
        nextExp = calculateNextLevelExp(); // Recalcular la experiencia para el siguiente nivel
    }

    updateUI();
}

function initFarm() {
    farmEl.innerHTML = ''; // Limpiar la granja
    state.plots = []; // Reiniciar el estado de las parcelas
    
    for (let i = 0; i < CONFIG.PLOTS_TOTAL; i++) {
        const plot = document.createElement('div');
        plot.className = 'plot';
        plot.dataset.index = i;
        plot.onclick = () => plotClick(i);

        if (i >= state.plotsUnlocked) {
            plot.className = 'plot locked';
            plot.textContent = ''; // Limpiar el texto confuso en parcelas bloqueadas
        }
        
        // Inicializar el estado de la parcela
        state.plots.push({
            status: 'empty', // 'empty', 'planted', 'ready'
            seedId: null,
            plantTime: null,
            level: 1, // Nivel base de la parcela
            el: plot // Guardar la referencia al elemento para actualizaciones
        });
        
        farmEl.appendChild(plot);
        updatePlot(i);
    }
}

function updatePlot(index) {
    const plotState = state.plots[index];
    const plotEl = plotState.el;
    
    // Si está bloqueada, no hacer nada más
    if (index >= state.plotsUnlocked) {
        plotEl.className = 'plot locked';
        plotEl.textContent = '';
        return;
    }

    plotEl.className = 'plot'; // Quitar la clase 'locked'
    plotEl.style.backgroundColor = ''; // Resetear el color de fondo

    switch (plotState.status) {
        case 'empty':
            plotEl.textContent = 'Plant';
            plotEl.style.backgroundColor = '#A5D6A7'; // Color de tierra disponible
            break;
        case 'planted':
            const seed = getSeed(plotState.seedId);
            const timeElapsed = Date.now() - plotState.plantTime;
            const progress = Math.min(1, timeElapsed / seed.time);
            
            // Mostrar progreso como texto
            const timeLeft = Math.ceil((seed.time - timeElapsed) / 1000);
            plotEl.textContent = `${seed.icon} ${timeLeft > 0 ? timeLeft + 's' : 'Ready'}`;

            // Usar un color más oscuro para indicar crecimiento
            plotEl.style.backgroundColor = `hsl(120, 40%, ${60 - (progress * 20)}%)`; 

            // Si el cultivo está listo
            if (progress >= 1) {
                plotState.status = 'ready';
                updatePlot(index);
            }
            break;
        case 'ready':
            const readySeed = getSeed(plotState.seedId);
            plotEl.textContent = `${readySeed.icon} COSECHAR (+${readySeed.reward})`;
            plotEl.style.backgroundColor = '#FFEB3B'; // Color de listo para cosechar
            break;
    }
}

function plotClick(index) {
    if (index >= state.plotsUnlocked) return;
    
    const plotState = state.plots[index];
    
    switch (plotState.status) {
        case 'empty':
            // Al hacer clic, se abre el menú de la tienda
            scrollToStore(); 
            break;
        case 'ready':
            harvestPlot(index);
            break;
    }
}

function plantSeed(index, seedId) {
    const seed = getSeed(seedId);
    
    if (state.coins >= seed.cost && state.level >= seed.level) {
        state.coins -= seed.cost;
        state.plots[index].status = 'planted';
        state.plots[index].seedId = seedId;
        state.plots[index].plantTime = Date.now();
        
        updatePlot(index);
        updateUI();
    } else if (state.level < seed.level) {
        alert(`Necesitas ser Nivel ${seed.level} para plantar ${seed.name}.`);
    } else {
        alert('Monedas insuficientes.');
    }
}

function harvestPlot(index) {
    const plotState = state.plots[index];
    const seed = getSeed(plotState.seedId);
    
    if (plotState.status === 'ready') {
        const reward = seed.reward * plotState.level; // La recompensa base * nivel de parcela
        state.coins += reward;
        checkLevelUp(1); // Ganar 1 punto de experiencia por cosecha
        
        // Agregar al registro de ganancias
        state.lastEarnings.push({
            icon: seed.icon,
            reward: reward,
            time: Date.now()
        });
        // Mantener solo los últimos 10
        if (state.lastEarnings.length > 10) {
            state.lastEarnings.shift();
        }
        
        // Resetear la parcela
        plotState.status = 'empty';
        plotState.seedId = null;
        plotState.plantTime = null;
        
        updatePlot(index);
        updateUI();
    }
}

function renderEarningsLog() {
    if (!earningListEl) return;
    
    earningListEl.innerHTML = '';
    
    // Mostrar en orden LIFO (último en entrar, primero en salir)
    state.lastEarnings.slice().reverse().forEach(earning => {
        const li = document.createElement('li');
        li.innerHTML = `${earning.icon} +${earning.reward} <span class="time">${new Date(earning.time).toLocaleTimeString()}</span>`;
        earningListEl.appendChild(li);
    });
}

// === LÓGICA DEL GRANJERO AUTOMÁTICO ===

let autoFarmerInterval;

function startAutoFarmer() {
    if (!state.autoMode || state.farmerLevel === 0) return;
    
    const config = getFarmerConfig(state.farmerLevel);

    // 1. Cosechar cultivos listos
    state.plots.slice(0, state.plotsUnlocked).filter(p => p.status === 'ready').forEach((plotState, index) => {
        // Encontrar el índice original
        const originalIndex = state.plots.slice(0, state.plotsUnlocked).findIndex(p => p === plotState);
        if (originalIndex !== -1) {
            harvestPlot(originalIndex);
        }
    });

    // 2. Plantar en parcelas vacías
    const emptyPlots = state.plots.slice(0, state.plotsUnlocked).filter(p => p.status === 'empty');
    if (emptyPlots.length > 0) {
        
        // Lógica para elegir la semilla con la MÁXIMA RENTABILIDAD (reward/time)
        const bestSeed = SEEDS
            .filter(s => s.farmerLvl <= config.maxSeedLevel) 
            // Ordena por Monedas por Milisegundo (mayor rentabilidad)
            .sort((a, b) => (b.reward / b.time) - (a.reward / a.time)) 
            .find(s => state.coins >= s.cost);
            
        if (bestSeed) {
            // Plantar en la primera parcela vacía encontrada
            const index = state.plots.findIndex(p => p.status === 'empty');
            if (index !== -1) {
                plantSeed(index, bestSeed.id);
            }
        }
    }
}

function hireFarmer() {
    const cost = getFarmerConfig(1).cost;
    if (state.farmerLevel === 0 && state.coins >= cost) {
        state.coins -= cost;
        state.farmerLevel = 1;
        state.autoMode = true;
        
        // Iniciar el ciclo del granjero
        const speed = getFarmerConfig(1).speedMultiplier;
        const intervalTime = 1000 / speed; // Intervalo en ms
        autoFarmerInterval = setInterval(startAutoFarmer, intervalTime);
        
        updateUI();
    } else {
        alert('No puedes contratar al granjero o monedas insuficientes.');
    }
}

function upgradeFarmer() {
    const nextLevel = state.farmerLevel + 1;
    if (nextLevel > FARMER_CONFIG.length) {
        alert('¡El Granjero ha alcanzado su nivel máximo!');
        return;
    }
    
    const nextConfig = getFarmerConfig(nextLevel);
    
    if (state.coins >= nextConfig.cost) {
        state.coins -= nextConfig.cost;
        state.farmerLevel = nextLevel;
        
        // Reiniciar el intervalo con la nueva velocidad
        clearInterval(autoFarmerInterval);
        const speed = nextConfig.speedMultiplier;
        const intervalTime = 1000 / speed;
        autoFarmerInterval = setInterval(startAutoFarmer, intervalTime);
        
        updateUI();
    } else {
        alert('Monedas insuficientes para mejorar.');
    }
}

function toggleAuto() {
    state.autoMode = !state.autoMode;
    updateUI();
}

function unlockPlot() {
    if (state.plotsUnlocked >= CONFIG.PLOTS_TOTAL) {
        alert('¡Todas las parcelas desbloqueadas!');
        return;
    }
    
    const unlockCost = getUnlockPlotCost();
    
    if (state.coins >= unlockCost) {
        state.coins -= unlockCost;
        state.plotsUnlocked++;
        
        // Desbloquear la nueva parcela en el array y la UI
        const newPlotIndex = state.plotsUnlocked - 1;
        state.plots[newPlotIndex].el.className = 'plot empty';
        state.plots[newPlotIndex].el.textContent = 'Plant';
        
        updateUI();
        updatePlot(newPlotIndex); // Renderizar la parcela recién desbloqueada
    } else {
        alert(`Necesitas ${unlockCost} monedas para comprar la siguiente parcela.`);
    }
}

function toggleLevelUpNotifications() {
    state.levelUpNotifications = !state.levelUpNotifications;
    updateUI();
}

function scrollToStore() {
    storeEl.scrollIntoView({ behavior: 'smooth' });
}

// === INICIALIZACIÓN Y BUCLE PRINCIPAL ===

function loadGame() {
    const savedState = localStorage.getItem('farmvilleState');
    if (savedState) {
        // Cargar estado
        const loadedState = JSON.parse(savedState);
        // Sobrescribir el estado base, pero manteniendo la estructura
        Object.assign(state, loadedState);
        // Asegurar que state.plots se inicializa correctamente con la UI después
        state.plots = []; 
    }
}

function saveGame() {
    // Solo guardar los datos necesarios, no las referencias a elementos (el)
    const stateToSave = {
        ...state,
        plots: state.plots.map(p => ({
            status: p.status,
            seedId: p.seedId,
            plantTime: p.plantTime,
            level: p.level 
        }))
    };
    localStorage.setItem('farmvilleState', JSON.stringify(stateToSave));
}

async function loadConfig() {
    try {
        const response = await fetch('config.json');
        const configData = await response.json();
        
        CONFIG = {
            PLOTS_TOTAL: configData.PLOTS_TOTAL,
            FARMER_BASE_COST: configData.FARMER_BASE_COST,
            MUSIC_URL: configData.MUSIC_URL
        };
        SEEDS = configData.SEEDS;
        FARMER_CONFIG = configData.FARMER_CONFIG;
        
        plotsTotalEl.textContent = CONFIG.PLOTS_TOTAL;
        
    } catch (error) {
        console.error('Error al cargar config.json:', error);
    }
}

async function init() {
    await loadConfig();
    loadGame();
    initFarm();
    initStore();
    updateUI();
    
    // Restaurar el intervalo del granjero si está contratado
    if (state.farmerLevel > 0) {
        const config = getFarmerConfig(state.farmerLevel);
        const intervalTime = 1000 / config.speedMultiplier;
        autoFarmerInterval = setInterval(startAutoFarmer, intervalTime);
    }

    // Bucle principal de actualización de la UI y el estado de la parcela
    setInterval(() => {
        for (let i = 0; i < state.plotsUnlocked; i++) {
            updatePlot(i);
        }
    }, 1000); // Actualizar cada segundo
}

// Lógica de la Tienda
function initStore() {
    storeEl.innerHTML = '<h2>Tienda de Semillas</h2>';
    
    SEEDS.forEach(seed => {
        const seedItem = document.createElement('div');
        seedItem.className = 'seed-item';
        
        const isUnlocked = state.level >= seed.level;
        
        seedItem.innerHTML = `
            <div>
                <span class="seed-icon">${seed.icon}</span>
                <strong>${seed.name}</strong>
            </div>
            <div>
                Costo: ${seed.cost} C
            </div>
            <div>
                Recompensa: ${seed.reward} C
            </div>
            <div>
                Tiempo: ${seed.time / 1000}s
            </div>
            ${isUnlocked ? 
                `<button onclick="findAndPlant('${seed.id}')">Plantar</button>` : 
                `<span class="locked-seed">Nivel ${seed.level} Requerido</span>`}
        `;
        
        storeEl.appendChild(seedItem);
    });
}

function findAndPlant(seedId) {
    // Encuentra la primera parcela vacía y planta
    const index = state.plots.findIndex(p => p.status === 'empty' && p.index < state.plotsUnlocked);
    
    if (index !== -1) {
        plantSeed(index, seedId);
    } else {
        alert('No hay parcelas vacías para plantar.');
    }
}


// === INTERFAZ (UI) ===

function updateUI() {
    // Stats
    coinsEl.textContent = state.coins.toLocaleString();
    levelEl.textContent = state.level;
    plotsUnlockedEl.textContent = state.plotsUnlocked;
    
    // Granjero Stats
    farmerLevelEl.textContent = state.farmerLevel;
    
    if (state.farmerLevel > 0) {
        const config = getFarmerConfig(state.farmerLevel);
        farmerSpeedEl.textContent = `${config.speedMultiplier}x`;
        
        // Botón de mejora
        const nextLevel = state.farmerLevel + 1;
        const nextConfig = getFarmerConfig(nextLevel);
        
        if (nextLevel <= FARMER_CONFIG.length) {
            upgradeFarmerBtn.disabled = state.coins < nextConfig.cost;
            upgradeFarmerBtn.textContent = `Mejorar Granjero (-${nextConfig.cost} C)`;
        } else {
            upgradeFarmerBtn.disabled = true;
            upgradeFarmerBtn.textContent = 'Nivel Máximo';
        }

        // Botón de Auto
        autoBtn.disabled = false;
        autoBtn.textContent = state.autoMode ? 'Auto ON' : 'Auto OFF';
        autoStatusEl.textContent = state.autoMode ? 'ON' : 'OFF';

    } else {
        farmerSpeedEl.textContent = '0x';
        upgradeFarmerBtn.disabled = true;
        upgradeFarmerBtn.textContent = 'Mejorar Granjero (Contrata Primero)';
        autoBtn.disabled = true;
        autoBtn.textContent = 'Auto ON/OFF';
        autoStatusEl.textContent = 'OFF';
    }

    // Botones
    // Lógica Corregida: usar el costo real del Nivel 1 (500) para habilitar el botón de contratar
    hireBtn.disabled = state.farmerLevel > 0 || state.coins < getFarmerConfig(1).cost;
    
    // Botón de Parcela
    const unlockCost = getUnlockPlotCost();
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
    renderEarningsLog(); // Renderizar el log de ganancias
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
    if (confirm("¿Estás seguro de que quieres REINICIAR el juego? ¡Perderás todo el progreso!")) {
        localStorage.removeItem('farmvilleState');
        clearInterval(autoFarmerInterval);
        // Reiniciar el estado a los valores iniciales
        state = {
            coins: 200,
            level: 1,
            farmerLevel: 0,
            autoMode: false,
            plotsUnlocked: 5, 
            plots: [],
            levelUpNotifications: true,
            lastEarnings: []
        };
        init(); // Re-inicializar el juego
    }
}

// INICIAR EL JUEGO
init();