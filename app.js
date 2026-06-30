/* ==========================================
   THE SYSTEM - GAME LOGIC & ENGINE (app.js)
   ========================================== */

// --- Default Game State ---
let state = {
  verified: false,  // Identity verification state
  level: 1,
  title: 'E-RANK HUNTER',
  hp: 105.0,        // Current weight in kg
  targetHp: 75.0,  // Target weight in kg
  gold: 0,          // Calorie deficit surplus
  statPoints: 5,
  attributes: {
    str: 10,
    agi: 10,
    vit: 10,
    wil: 10
  },
  quests: {
    steps: 0,
    workout: 0,     // minutes
    water: 0.0      // Liters
  },
  foodIntake: 0,    // Calories eaten today
  meals: [],        // List of eaten meals
  lastActiveDate: new Date().toLocaleDateString()
};

// --- Constants ---
const TDEE = 2888;
const BMR_DAILY = 2088;
const CALORIES_PER_STEP = 0.058; // 20,000 steps = 1,160 kcal
const STEP_GOAL = 20,000;
const WORKOUT_GOAL = 45;
const WATER_GOAL = 3.0;

// --- Timers and Sensors ---
let walkInterval = null;
let bmrInterval = null;
let isWalking = false;
let isSensorEnabled = false;
let lastStepTime = 0;

// --- Initialize App ---
window.addEventListener('DOMContentLoaded', () => {
  loadState();
  
  // Register Service Worker for PWA offline capabilities
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('[SYSTEM] Service Worker Registered'))
      .catch(err => console.error('[SYSTEM] Service Worker Registration Failed', err));
  }

  // Handle Initial Login State
  if (state.verified) {
    showApp();
  } else {
    document.getElementById('login-overlay').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
  }

  checkDayReset();
  updateUI();
  startBMRSimulation();
  
  // Attach Event Listeners
  document.getElementById('btn-sim-toggle').addEventListener('click', toggleLiveWalk);
  document.getElementById('btn-sensor-toggle').addEventListener('click', togglePhoneSensors);
});

// --- Identity Verification (Login) ---
window.handleLogin = function(event) {
  event.preventDefault();
  const usernameInput = document.getElementById('login-username');
  const pinInput = document.getElementById('login-pin');
  const errorMsg = document.getElementById('login-error');
  
  const username = usernameInput.value.trim();
  const pin = pinInput.value.trim();
  
  if (username === 'asheejajayan' && pin === '210819') {
    state.verified = true;
    saveState();
    showApp();
    playSystemSound();
  } else {
    errorMsg.innerText = "[SYSTEM] ACCESS DENIED: UNREGISTERED HUNTER";
    pinInput.value = '';
    // Shake animation effect
    const box = document.querySelector('.login-box');
    box.style.animation = 'none';
    setTimeout(() => {
      box.style.animation = 'shake 0.3s ease-in-out';
    }, 10);
  }
};

function showApp() {
  document.getElementById('login-overlay').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

// Add CSS Shake animation dynamically
const styleSheet = document.createElement("style");
styleSheet.innerText = `
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-10px); }
  75% { transform: translateX(10px); }
}
`;
document.head.appendChild(styleSheet);

// --- State Management ---
function saveState() {
  localStorage.setItem('solo_leveling_system_state', JSON.stringify(state));
}

function loadState() {
  const saved = localStorage.getItem('solo_leveling_system_state');
  if (saved) {
    try {
      state = Object.assign({}, state, JSON.parse(saved));
    } catch (e) {
      console.error("Failed to parse saved state, using defaults", e);
    }
  }
}

function checkDayReset() {
  const today = new Date().toLocaleDateString();
  if (state.lastActiveDate !== today) {
    // End of day evaluation
    evaluateDayEnd();
    
    // Reset daily counters
    state.quests.steps = 0;
    state.quests.workout = 0;
    state.quests.water = 0.0;
    state.foodIntake = 0;
    state.meals = [];
    state.lastActiveDate = today;
    saveState();
  }
}

function evaluateDayEnd() {
  const stepsDone = state.quests.steps >= STEP_GOAL;
  const workoutDone = state.quests.workout >= WORKOUT_GOAL;
  const waterDone = state.quests.water >= WATER_GOAL;
  const netDebtCleared = getNetCalorieDebt() <= 0;

  if (stepsDone && workoutDone && waterDone && netDebtCleared) {
    state.gold += 500;
    state.statPoints += 5;
    alert("[SYSTEM] Daily Quest Completed! +500 Gold, +5 Stat Points awarded.");
  } else {
    alert("[SYSTEM] Warning: Daily Quest Failed. Penalty Protocol triggered: You must complete an extra 5,000 steps today.");
    state.quests.steps = -5000;
  }
}

// --- Real-time Calorie Calculations ---
function getBMRBurned() {
  const now = new Date();
  const secondsSinceMidnight = (now.getHours() * 3600) + (now.getMinutes() * 60) + now.getSeconds();
  const totalSecondsInDay = 24 * 3600;
  return Math.round((secondsSinceMidnight / totalSecondsInDay) * BMR_DAILY);
}

function getActivityBurned() {
  const stepBurn = Math.max(0, state.quests.steps) * CALORIES_PER_STEP;
  const workoutBurn = state.quests.workout * 6;
  return Math.round(stepBurn + workoutBurn);
}

function getNetCalorieDebt() {
  const bmrBurn = getBMRBurned();
  const actBurn = getActivityBurned();
  const intake = state.foodIntake;
  return Math.round(TDEE - bmrBurn - actBurn + intake);
}

// --- Live BMR ticking in UI ---
function startBMRSimulation() {
  if (bmrInterval) clearInterval(bmrInterval);
  bmrInterval = setInterval(() => {
    updateCalorieLedger();
  }, 1000);
}

// --- UI Updates ---
window.updateUI = function() {
  // Header
  document.getElementById('header-level').innerText = state.level;
  
  // Status Tab
  document.getElementById('player-title').innerText = state.title;
  document.getElementById('stat-hp').innerText = state.hp.toFixed(1);
  document.getElementById('stat-gold').innerText = state.gold;
  document.getElementById('stat-points').innerText = state.statPoints;
  
  // Attributes
  document.getElementById('attr-str').innerText = state.attributes.str;
  document.getElementById('attr-agi').innerText = state.attributes.agi;
  document.getElementById('attr-vit').innerText = state.attributes.vit;
  document.getElementById('attr-wil').innerText = state.attributes.wil;

  // Monarch Awakening progress bar (Weight Loss progress: 105kg = 0%, 75kg = 100%)
  const totalWeightToLose = 105.0 - 75.0; // 30kg
  const currentWeightLost = 105.0 - state.hp;
  const progressPercent = Math.max(0, Math.min(100, (currentWeightLost / totalWeightToLose) * 100));
  document.getElementById('hp-bar-fill').style.width = `${progressPercent}%`;

  // Quest Tab
  const stepsVal = Math.max(0, state.quests.steps);
  document.getElementById('q-steps-val').innerText = stepsVal.toLocaleString();
  const stepsPercent = Math.min(100, (stepsVal / STEP_GOAL) * 100);
  document.getElementById('q-steps-fill').style.width = `${stepsPercent}%`;
  document.getElementById('q-steps-check').checked = stepsVal >= STEP_GOAL;

  const workoutVal = state.quests.workout;
  document.getElementById('q-workout-val').innerText = workoutVal;
  const workoutPercent = Math.min(100, (workoutVal / WORKOUT_GOAL) * 100);
  document.getElementById('q-workout-fill').style.width = `${workoutPercent}%`;
  document.getElementById('q-workout-check').checked = workoutVal >= WORKOUT_GOAL;

  const waterVal = state.quests.water;
  document.getElementById('q-water-val').innerText = waterVal.toFixed(1);
  const waterPercent = Math.min(100, (waterVal / WATER_GOAL) * 100);
  document.getElementById('q-water-fill').style.width = `${waterPercent}%`;
  document.getElementById('q-water-check').checked = waterVal >= WATER_GOAL;

  updateCalorieLedger();
};

function updateCalorieLedger() {
  const bmrBurn = getBMRBurned();
  const actBurn = getActivityBurned();
  const intake = state.foodIntake;
  const netDebt = getNetCalorieDebt();

  if (document.getElementById('ledger-bmr')) {
    document.getElementById('ledger-bmr').innerText = `-${bmrBurn} kcal`;
    document.getElementById('ledger-activity').innerText = `-${actBurn} kcal`;
    document.getElementById('ledger-intake').innerText = `+${intake} kcal`;
    document.getElementById('ledger-net').innerText = `${netDebt} kcal`;
    
    const debtPercent = Math.max(0, Math.min(100, (netDebt / TDEE) * 100));
    document.getElementById('stat-debt').innerText = netDebt;
    document.getElementById('debt-bar-fill').style.width = `${debtPercent}%`;
    
    if (netDebt < 0) {
      document.getElementById('stat-debt').innerText = 0;
      document.getElementById('debt-bar-fill').style.width = '0%';
    }
  }
}

// --- Navigation ---
window.switchTab = function(tabId) {
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.remove('active');
  });
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });

  document.getElementById(`tab-${tabId}`).classList.add('active');
  document.getElementById(`nav-${tabId}`).classList.add('active');
};

// --- Attribute Allocation ---
window.allocatePoint = function(attr) {
  if (state.statPoints > 0) {
    state.attributes[attr]++;
    state.statPoints--;
    saveState();
    updateUI();
    playSystemSound();
  } else {
    alert("[SYSTEM] You do not have enough Stat Points. Complete Daily Quests or Level Up to earn more.");
  }
};

// --- Quest Loggers ---
window.logWorkout = function(minutes) {
  state.quests.workout = Math.min(120, state.quests.workout + minutes);
  state.gold += minutes * 2; 
  saveState();
  updateUI();
  playSystemSound();
};

// Also expose a function to directly update weight for testing
window.updateWeight = function(newWeight) {
  if (newWeight >= 75.0 && newWeight <= 105.0) {
    state.hp = newWeight;
    
    // Level is calculated: Level 1 at 105kg, Level 30 at 75kg
    // Level = 1 + (105 - weight)
    const newLvl = Math.floor(1 + (105.0 - newWeight));
    if (newLvl > state.level) {
      state.level = newLvl;
      state.statPoints += (newLvl - state.level) * 5;
      // Upgrade title based on weight
      if (newWeight <= 75.0) state.title = "S-RANK MONARCH";
      else if (newWeight <= 78.0) state.title = "A-RANK HUNTER";
      else if (newWeight <= 82.0) state.title = "B-RANK HUNTER";
      else if (newWeight <= 88.0) state.title = "C-RANK HUNTER";
      else if (newWeight <= 95.0) state.title = "D-RANK HUNTER";
      alert(`[SYSTEM] LEVEL UP! You have reached Level ${state.level}. +5 Stat Points awarded.`);
    }
    saveState();
    updateUI();
    playSystemSound();
  }
};

window.logWater = function(liters) {
  state.quests.water = Math.min(5.0, state.quests.water + liters);
  saveState();
  updateUI();
  playSystemSound();
};

// --- Step Tracking (Sensors & Simulation) ---
function toggleLiveWalk() {
  const btn = document.getElementById('btn-sim-toggle');
  if (isWalking) {
    clearInterval(walkInterval);
    isWalking = false;
    btn.innerText = 'Start Live Walk';
    btn.classList.remove('btn-secondary');
    btn.classList.add('btn-primary');
  } else {
    isWalking = true;
    btn.innerText = 'Stop Walk';
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-secondary');
    
    walkInterval = setInterval(() => {
      state.quests.steps += 2;
      if (state.quests.steps % 500 === 0) {
        state.gold += 10;
      }
      saveState();
      updateUI();
    }, 1000);
  }
}

function togglePhoneSensors() {
  const btn = document.getElementById('btn-sensor-toggle');
  if (isSensorEnabled) {
    window.removeEventListener('devicemotion', handleDeviceMotion);
    isSensorEnabled = false;
    btn.innerText = 'Enable Phone Sensors';
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-secondary');
  } else {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      DeviceMotionEvent.requestPermission()
        .then(permissionState => {
          if (permissionState === 'granted') {
            enableSensor(btn);
          } else {
            alert("[SYSTEM] Sensor permission denied.");
          }
        })
        .catch(console.error);
    } else {
      enableSensor(btn);
    }
  }
}

function enableSensor(btn) {
  window.addEventListener('devicemotion', handleDeviceMotion);
  isSensorEnabled = true;
  btn.innerText = 'Sensors Active';
  btn.classList.remove('btn-secondary');
  btn.classList.add('btn-primary');
}

function handleDeviceMotion(event) {
  const acc = event.accelerationIncludingGravity;
  if (!acc) return;
  
  const x = acc.x || 0;
  const y = acc.y || 0;
  const z = acc.z || 0;
  
  const magnitude = Math.sqrt(x*x + y*y + z*z);
  
  if (magnitude > 12.5) {
    const now = Date.now();
    if (now - lastStepTime > 320) {
      state.quests.steps++;
      if (state.quests.steps % 50 === 0) {
        state.gold += 1;
      }
      lastStepTime = now;
      saveState();
      updateUI();
    }
  }
}

// --- Food Registration ---
window.registerFood = function(event) {
  event.preventDefault();
  const nameInput = document.getElementById('food-name');
  const calInput = document.getElementById('food-calories');
  
  const name = nameInput.value;
  const calories = parseInt(calInput.value);
  
  state.foodIntake += calories;
  state.meals.push({ name, calories, time: new Date().toLocaleTimeString() });
  
  nameInput.value = '';
  calInput.value = '';
  
  saveState();
  updateUI();
  playSystemSound();
  
  appendMessage('system', `[SYSTEM] Meal Registered: ${name} (+${calories} kcal). Your calorie debt has increased.`);
};

// --- Shop Purchases ---
window.buyItem = function(itemType, cost) {
  if (state.gold >= cost) {
    state.gold -= cost;
    
    if (itemType === 'lasagna') {
      appendMessage('system', `[SYSTEM] Item [Elixir of Lasagna] purchased successfully. Your calorie balance is reduced by 800 Gold. You are permitted to consume 1 serving of Lasagna.`);
    } else if (itemType === 'allowance') {
      state.foodIntake -= 200;
      appendMessage('system', `[SYSTEM] Item [Low-Carb Boost Potion] consumed. Calorie debt reduced by 200 kcal.`);
    } else if (itemType === 'reset') {
      state.quests.water = 3.0;
      state.quests.workout = 45;
      appendMessage('system', `[SYSTEM] Item [Shadow Recovery Crystal] used. Water and workout quests have been fully cleared.`);
    }
    
    saveState();
    updateUI();
    playSystemSound();
  } else {
    alert(`[SYSTEM] Insufficient Gold. You need ${cost - state.gold} more Gold to purchase this item.`);
  }
};

// --- AI Chat / System Guide ---
window.sendMessage = async function(event) {
  event.preventDefault();
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;
  
  input.value = '';
  appendMessage('user', message);
  
  const typingId = appendMessage('system', `[SYSTEM] Connecting to the Shadow Monarch Agent...`);
  
  try {
    const response = await fetch('http://localhost:5000/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: message,
        player_stats: {
          level: state.level,
          hp: state.hp,
          gold: state.gold,
          steps: state.quests.steps,
          water: state.quests.water,
          workout: state.quests.workout,
          net_debt: getNetCalorieDebt()
        }
      })
    });
    
    document.getElementById(typingId).remove();
    
    if (response.ok) {
      const data = await response.json();
      appendMessage('system', data.response);
    } else {
      throw new Error("Backend server error");
    }
  } catch (error) {
    if (document.getElementById(typingId)) {
      document.getElementById(typingId).remove();
    }
    simulateLocalResponse(message);
  }
};

function appendMessage(sender, text) {
  const chatMessages = document.getElementById('chat-messages');
  const msgDiv = document.createElement('div');
  const id = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  msgDiv.id = id;
  msgDiv.classList.add('message', sender);
  
  const contentDiv = document.createElement('div');
  contentDiv.classList.add('message-content');
  contentDiv.innerText = text;
  
  msgDiv.appendChild(contentDiv);
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  
  return id;
}

function simulateLocalResponse(message) {
  const msgLower = message.toLowerCase();
  let reply = "[SYSTEM] ";
  
  if (msgLower.includes('lasagna')) {
    if (state.gold >= 800) {
      reply += `Hunter asheejajayan, your current Calorie Gold balance is ${state.gold}. You have enough Gold to purchase the [Elixir of Lasagna]. Go to the Inventory tab to execute the purchase.`;
    } else {
      reply += `Access Denied. Lasagna requires 800 Gold. Your current balance is ${state.gold}. You need ${800 - state.gold} more Gold. Suggestion: Walk ${Math.ceil((800 - state.gold) / CALORIES_PER_STEP)} more steps to clear this requirement.`;
    }
  } else if (msgLower.includes('status') || msgLower.includes('level')) {
    reply += `PLAYER STATUS EVALUATION:\n- Level: ${state.level}\n- Title: ${state.title}\n- Weight (HP): ${state.hp.toFixed(1)} kg\n- Current Gold: ${state.gold}\nKeep pushing, Hunter asheejajayan. The path to S-Rank is clear.`;
  } else if (msgLower.includes('hungry') || msgLower.includes('eat')) {
    reply += `[DIETARY RECOMMENDATION] Hunter asheejajayan, you are currently in a calorie debt of ${getNetCalorieDebt()} kcal. Consume 100g of extra lean ground chicken (110 kcal, 23g protein) and unlimited broccoli to trigger satiety receptors without increasing your debt significantly.`;
  } else {
    reply += `Message received, Hunter asheejajayan. I am monitoring your agility (${state.quests.steps} steps) and vitality (${state.quests.water.toFixed(1)}L water). Continue your daily quest to limit break.`;
  }
  
  setTimeout(() => {
    appendMessage('system', reply);
  }, 800);
}

// --- Audio & Haptics (Simulated) ---
function playSystemSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
    
    gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1);
  } catch (e) {
    // Audio context not allowed
  }
}
