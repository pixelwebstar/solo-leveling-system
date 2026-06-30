/* ==========================================
   THE SYSTEM - GAME LOGIC & ENGINE (app.js)
   ========================================== */

// --- Default Game State ---
let state = {
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
  checkDayReset();
  updateUI();
  startBMRSimulation();
  
  // Attach Event Listeners
  document.getElementById('btn-sim-toggle').addEventListener('click', toggleLiveWalk);
  document.getElementById('btn-sensor-toggle').addEventListener('click', togglePhoneSensors);
});

// --- State Management ---
function saveState() {
  localStorage.setItem('solo_leveling_system_state', JSON.stringify(state));
}

function loadState() {
  const saved = localStorage.getItem('solo_leveling_system_state');
  if (saved) {
    try {
      state = JSON.parse(saved);
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
  // If all quests were completed, award gold
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
    // Apply penalty: start today with negative steps
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
  // Steps burn + workout burn (approx 6 kcal/min for workout)
  const stepBurn = Math.max(0, state.quests.steps) * CALORIES_PER_STEP;
  const workoutBurn = state.quests.workout * 6;
  return Math.round(stepBurn + workoutBurn);
}

function getNetCalorieDebt() {
  const bmrBurn = getBMRBurned();
  const actBurn = getActivityBurned();
  const intake = state.foodIntake;
  
  // Debt = TDEE - BMR_Burn - Activity_Burn + Intake
  // But BMR_Burn is part of TDEE, so:
  // Net Debt = TDEE - BMR_Burn - Activity_Burn + Intake
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
function updateUI() {
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

  // HP progress bar
  const hpPercent = Math.max(0, Math.min(100, ((105 - state.hp) / (105 - state.targetHp)) * 100));
  // Note: we want HP bar to decrease as weight decreases, so HP bar represents remaining weight to lose
  const remainingWeightPercent = Math.max(0, Math.min(100, ((state.hp - state.targetHp) / (105 - state.targetHp)) * 100));
  document.getElementById('hp-bar-fill').style.width = `${remainingWeightPercent}%`;

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
}

function updateCalorieLedger() {
  const bmrBurn = getBMRBurned();
  const actBurn = getActivityBurned();
  const intake = state.foodIntake;
  const netDebt = getNetCalorieDebt();

  // Update Inventory Ledger
  if (document.getElementById('ledger-bmr')) {
    document.getElementById('ledger-bmr').innerText = `-${bmrBurn} kcal`;
    document.getElementById('ledger-activity').innerText = `-${actBurn} kcal`;
    document.getElementById('ledger-intake').innerText = `+${intake} kcal`;
    document.getElementById('ledger-net').innerText = `${netDebt} kcal`;
    
    // Update Calorie Debt bar on Status tab
    const debtPercent = Math.max(0, Math.min(100, (netDebt / TDEE) * 100));
    document.getElementById('stat-debt').innerText = netDebt;
    document.getElementById('debt-bar-fill').style.width = `${debtPercent}%`;
    
    // Gold generation: If netDebt is negative, that means we are in a surplus deficit!
    // We can convert those excess burned calories into Gold in real-time or at day end.
    // Let's allow converting them in real-time if they want, or just update the active Gold.
    if (netDebt < 0) {
      const surplus = Math.abs(netDebt);
      // Display negative debt as 0 in the main bar, but show surplus in Gold
      document.getElementById('stat-debt').innerText = 0;
      document.getElementById('debt-bar-fill').style.width = '0%';
    }
  }
}

// --- Navigation ---
function switchTab(tabId) {
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.remove('active');
  });
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });

  document.getElementById(`tab-${tabId}`).classList.add('active');
  document.getElementById(`nav-${tabId}`).classList.add('active');
}

// --- Attribute Allocation ---
function allocatePoint(attr) {
  if (state.statPoints > 0) {
    state.attributes[attr]++;
    state.statPoints--;
    saveState();
    updateUI();
    playSystemSound();
  } else {
    alert("[SYSTEM] You do not have enough Stat Points. Complete Daily Quests or Level Up to earn more.");
  }
}

// --- Quest Loggers ---
function logWorkout(minutes) {
  state.quests.workout = Math.min(120, state.quests.workout + minutes);
  
  // Award Gold for workouts
  state.gold += minutes * 2; 
  
  saveState();
  updateUI();
  playSystemSound();
}

function logWater(liters) {
  state.quests.water = Math.min(5.0, state.quests.water + liters);
  saveState();
  updateUI();
  playSystemSound();
}

// --- Step Tracking (Sensors & Simulation) ---
function toggleLiveWalk() {
  const btn = document.getElementById('btn-sim-toggle');
  if (isWalking) {
    // Stop walk
    clearInterval(walkInterval);
    isWalking = false;
    btn.innerText = 'Start Live Walk';
    btn.classList.remove('btn-secondary');
    btn.classList.add('btn-primary');
  } else {
    // Start walk
    isWalking = true;
    btn.innerText = 'Stop Walk';
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-secondary');
    
    walkInterval = setInterval(() => {
      // Simulate 2 steps per second (120 steps/min)
      state.quests.steps += 2;
      
      // Every 500 steps, let's award some Gold
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
    // Request permission on iOS if needed, otherwise just listen
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
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
  
  // Simple step threshold: peak acceleration > 12.5 m/s^2 (gravity is ~9.8)
  if (magnitude > 12.5) {
    const now = Date.now();
    if (now - lastStepTime > 320) { // 320ms debounce (max ~3 steps per second)
      state.quests.steps++;
      
      // Award 1 Gold per 50 steps walked actively
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
function registerFood(event) {
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
  
  // Add message to chat log
  appendMessage('system', `[SYSTEM] Meal Registered: ${name} (+${calories} kcal). Your calorie debt has increased.`);
}

// --- Shop Purchases ---
function buyItem(itemType, cost) {
  if (state.gold >= cost) {
    state.gold -= cost;
    
    if (itemType === 'lasagna') {
      appendMessage('system', `[SYSTEM] Item [Elixir of Lasagna] purchased successfully. Your calorie balance is reduced by 800 Gold. You are permitted to consume 1 serving of Lasagna.`);
    } else if (itemType === 'allowance') {
      // Increase daily allowance (reduces calorie debt by 200)
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
}

// --- AI Chat / System Guide ---
async function sendMessage(event) {
  event.preventDefault();
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;
  
  // Clear input
  input.value = '';
  
  // Append user message
  appendMessage('user', message);
  
  // Show typing indicator
  const typingId = appendMessage('system', `[SYSTEM] Connecting to the Shadow Monarch Agent...`);
  
  try {
    // Send request to the local Python Antigravity backend
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
    
    // Remove typing indicator
    document.getElementById(typingId).remove();
    
    if (response.ok) {
      const data = await response.json();
      appendMessage('system', data.response);
    } else {
      throw new Error("Backend server error");
    }
  } catch (error) {
    // Remove typing indicator
    if (document.getElementById(typingId)) {
      document.getElementById(typingId).remove();
    }
    
    // Fallback to local simulated System Guide responses if Python server is not running
    simulateLocalResponse(message);
  }
}

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
      reply += `Hunter, your current Calorie Gold balance is ${state.gold}. You have enough Gold to purchase the [Elixir of Lasagna]. Go to the Inventory tab to execute the purchase.`;
    } else {
      reply += `Access Denied. Lasagna requires 800 Gold. Your current balance is ${state.gold}. You need ${800 - state.gold} more Gold. Suggestion: Walk ${Math.ceil((800 - state.gold) / CALORIES_PER_STEP)} more steps to clear this requirement.`;
    }
  } else if (msgLower.includes('status') || msgLower.includes('level')) {
    reply += `PLAYER STATUS EVALUATION:\n- Level: ${state.level}\n- Title: ${state.title}\n- Weight (HP): ${state.hp.toFixed(1)} kg\n- Current Gold: ${state.gold}\nKeep pushing, Hunter. The path to S-Rank is clear.`;
  } else if (msgLower.includes('hungry') || msgLower.includes('eat')) {
    reply += `[DIETARY RECOMMENDATION] Hunter, you are currently in a calorie debt of ${getNetCalorieDebt()} kcal. Consume 100g of extra lean ground chicken (110 kcal, 23g protein) and unlimited broccoli to trigger satiety receptors without increasing your debt significantly.`;
  } else {
    reply += `Message received, Hunter. I am monitoring your agility (${state.quests.steps} steps) and vitality (${state.quests.water.toFixed(1)}L water). Continue your daily quest to limit break.`;
  }
  
  setTimeout(() => {
    appendMessage('system', reply);
  }, 800);
}

// --- Audio & Haptics (Simulated) ---
function playSystemSound() {
  try {
    // Simple synth beep using Web Audio API (extremely retro-futuristic!)
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // High pitch beep
    
    gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1);
  } catch (e) {
    // Audio context not allowed or failed
  }
}
