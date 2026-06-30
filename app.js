/* ==========================================
   THE SYSTEM - GAME LOGIC & ENGINE (app.js)
   ========================================== */

// --- Game Database & State ---
let db = {
  // Keyed by date string (e.g., "6/30/2026")
  // Each day will have: verified, level, title, hp, targetHp, gold, statPoints, attributes, quests, foodIntake, meals
};

// Current active date being viewed
let currentDisplayDate = new Date().toLocaleDateString();

// Base profile stats that carry over
let globalProfile = {
  verified: false,
  level: 1,
  title: 'E-RANK HUNTER',
  hp: 105.0,
  targetHp: 75.0,
  gold: 0,
  statPoints: 5,
  attributes: {
    str: 10,
    agi: 10,
    vit: 10,
    wil: 10
  }
};

// --- Constants ---
const TDEE = 2888;
const BMR_DAILY = 2088;
const CALORIES_PER_STEP = 0.058;
const STEP_GOAL = 20000;
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
  loadDatabase();
  initDay(currentDisplayDate);
  
  // Register PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('[SYSTEM] PWA Active'))
      .catch(err => console.error('[SYSTEM] PWA Offline Error', err));
  }

  // Check Login
  if (globalProfile.verified) {
    showApp();
  } else {
    document.getElementById('login-overlay').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
  }

  updateUI();
  startBMRSimulation();
  initParticleBackground();
  
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
    globalProfile.verified = true;
    saveDatabase();
    showApp();
    playSystemSound();
  } else {
    errorMsg.innerText = "[SYSTEM] ACCESS DENIED: UNREGISTERED HUNTER";
    pinInput.value = '';
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

// --- Database Management ---
function saveDatabase() {
  localStorage.setItem('solo_leveling_db', JSON.stringify(db));
  localStorage.setItem('solo_leveling_profile', JSON.stringify(globalProfile));
}

function loadDatabase() {
  const savedDb = localStorage.getItem('solo_leveling_db');
  const savedProfile = localStorage.getItem('solo_leveling_profile');
  
  if (savedDb) {
    try { db = JSON.parse(savedDb); } catch (e) { console.error(e); }
  }
  if (savedProfile) {
    try { globalProfile = JSON.parse(savedProfile); } catch (e) { console.error(e); }
  }
}

function initDay(dateStr) {
  if (!db[dateStr]) {
    // Find the most recent day in db to carry over weight & gold
    let lastHp = globalProfile.hp;
    let lastGold = globalProfile.gold;
    let lastLevel = globalProfile.level;
    let lastTitle = globalProfile.title;
    let lastPoints = globalProfile.statPoints;
    let lastAttrs = Object.assign({}, globalProfile.attributes);

    const sortedDates = Object.keys(db).sort((a, b) => new Date(b) - new Date(a));
    if (sortedDates.length > 0) {
      const mostRecentDay = db[sortedDates[0]];
      lastHp = mostRecentDay.hp;
      lastGold = mostRecentDay.gold;
      lastLevel = mostRecentDay.level;
      lastTitle = mostRecentDay.title;
      lastPoints = mostRecentDay.statPoints;
      lastAttrs = Object.assign({}, mostRecentDay.attributes);
    }

    db[dateStr] = {
      hp: lastHp,
      gold: lastGold,
      level: lastLevel,
      title: lastTitle,
      statPoints: lastPoints,
      attributes: lastAttrs,
      quests: {
        steps: 0,
        workout: 0,
        water: 0.0
      },
      foodIntake: 0,
      meals: []
    };
    saveDatabase();
  }
}

// --- Date Navigation ---
window.changeDay = function(offset) {
  // Save current day state
  saveDatabase();

  const current = new Date(currentDisplayDate);
  current.setDate(current.getDate() + offset);
  currentDisplayDate = current.toLocaleDateString();

  // Initialize the new day if it doesn't exist
  initDay(currentDisplayDate);
  
  // Stop walking simulator if active
  if (isWalking) toggleLiveWalk();
  
  updateUI();
};

// --- Real-time Calorie Calculations ---
function getBMRBurned(dateStr) {
  const todayStr = new Date().toLocaleDateString();
  if (dateStr !== todayStr) {
    // If viewing a past or future day, assume full BMR is burned
    return BMR_DAILY;
  }
  const now = new Date();
  const secondsSinceMidnight = (now.getHours() * 3600) + (now.getMinutes() * 60) + now.getSeconds();
  const totalSecondsInDay = 24 * 3600;
  return Math.round((secondsSinceMidnight / totalSecondsInDay) * BMR_DAILY);
}

function getActivityBurned(dateStr) {
  const day = db[dateStr];
  if (!day) return 0;
  const stepBurn = Math.max(0, day.quests.steps) * CALORIES_PER_STEP;
  const workoutBurn = day.quests.workout * 6;
  return Math.round(stepBurn + workoutBurn);
}

function getNetCalorieDebt(dateStr) {
  const day = db[dateStr];
  if (!day) return TDEE;
  const bmrBurn = getBMRBurned(dateStr);
  const actBurn = getActivityBurned(dateStr);
  const intake = day.foodIntake;
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
  const day = db[currentDisplayDate];
  if (!day) return;

  // Date Header
  const todayStr = new Date().toLocaleDateString();
  const yesterdayStr = new Date(Date.now() - 86400000).toLocaleDateString();
  const tomorrowStr = new Date(Date.now() + 86400000).toLocaleDateString();
  
  let dateText = currentDisplayDate;
  if (currentDisplayDate === todayStr) dateText = "Today";
  else if (currentDisplayDate === yesterdayStr) dateText = "Yesterday";
  else if (currentDisplayDate === tomorrowStr) dateText = "Tomorrow";
  
  document.getElementById('current-date-display').innerText = `${dateText} (${currentDisplayDate})`;

  // Header Level
  document.getElementById('header-level').innerText = day.level;
  
  // Status Tab
  document.getElementById('player-title').innerText = day.title;
  document.getElementById('stat-hp').innerText = day.hp.toFixed(1);
  document.getElementById('stat-gold').innerText = day.gold;
  document.getElementById('stat-points').innerText = day.statPoints;
  
  // Attributes
  document.getElementById('attr-str').innerText = day.attributes.str;
  document.getElementById('attr-agi').innerText = day.attributes.agi;
  document.getElementById('attr-vit').innerText = day.attributes.vit;
  document.getElementById('attr-wil').innerText = day.attributes.wil;

  // Monarch Awakening progress bar (Weight Loss progress: 105kg = 0%, 75kg = 100%)
  const totalWeightToLose = 105.0 - 75.0;
  const currentWeightLost = 105.0 - day.hp;
  const progressPercent = Math.max(0, Math.min(100, (currentWeightLost / totalWeightToLose) * 100));
  document.getElementById('hp-bar-fill').style.width = `${progressPercent}%`;

  // Quest Tab
  const stepsVal = Math.max(0, day.quests.steps);
  document.getElementById('q-steps-val').innerText = stepsVal.toLocaleString();
  const stepsPercent = Math.min(100, (stepsVal / STEP_GOAL) * 100);
  document.getElementById('q-steps-fill').style.width = `${stepsPercent}%`;
  document.getElementById('q-steps-check').checked = stepsVal >= STEP_GOAL;

  const workoutVal = day.quests.workout;
  document.getElementById('q-workout-val').innerText = workoutVal;
  const workoutPercent = Math.min(100, (workoutVal / WORKOUT_GOAL) * 100);
  document.getElementById('q-workout-fill').style.width = `${workoutPercent}%`;
  document.getElementById('q-workout-check').checked = workoutVal >= WORKOUT_GOAL;

  const waterVal = day.quests.water;
  document.getElementById('q-water-val').innerText = waterVal.toFixed(1);
  const waterPercent = Math.min(100, (waterVal / WATER_GOAL) * 100);
  document.getElementById('q-water-fill').style.width = `${waterPercent}%`;
  document.getElementById('q-water-check').checked = waterVal >= WATER_GOAL;

  updateCalorieLedger();
  drawAnalyticsChart();
};

function updateCalorieLedger() {
  const day = db[currentDisplayDate];
  if (!day) return;

  const bmrBurn = getBMRBurned(currentDisplayDate);
  const actBurn = getActivityBurned(currentDisplayDate);
  const intake = day.foodIntake;
  const netDebt = getNetCalorieDebt(currentDisplayDate);

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

// --- Attribute Allocation ---
window.allocatePoint = function(attr) {
  const day = db[currentDisplayDate];
  if (!day) return;

  if (day.statPoints > 0) {
    day.attributes[attr]++;
    day.statPoints--;
    
    // Also sync to global profile
    globalProfile.attributes[attr] = day.attributes[attr];
    globalProfile.statPoints = day.statPoints;
    
    saveDatabase();
    updateUI();
    playSystemSound();
  } else {
    alert("[SYSTEM] You do not have enough Stat Points. Complete Daily Quests or Level Up to earn more.");
  }
};

// --- Quest Loggers ---
window.logWorkout = function(minutes) {
  const day = db[currentDisplayDate];
  if (!day) return;

  day.quests.workout = Math.min(120, day.quests.workout + minutes);
  day.gold += minutes * 2;
  
  saveDatabase();
  updateUI();
  playSystemSound();
};

window.logWater = function(liters) {
  const day = db[currentDisplayDate];
  if (!day) return;

  day.quests.water = Math.min(5.0, day.quests.water + liters);
  saveDatabase();
  updateUI();
  playSystemSound();
};

window.logWeightFromInput = function() {
  const input = document.getElementById('weight-input');
  const weight = parseFloat(input.value);
  if (isNaN(weight) || weight < 70 || weight > 110) {
    alert("[SYSTEM] Invalid weight value. Please enter a value between 70.0 and 110.0 kg.");
    return;
  }
  
  const day = db[currentDisplayDate];
  if (!day) return;

  day.hp = weight;
  globalProfile.hp = weight;
  
  // Level Calculation: Level 1 at 105kg, Level 30 at 75kg
  const newLvl = Math.floor(1 + (105.0 - weight));
  if (newLvl > day.level) {
    const levelDiff = newLvl - day.level;
    day.level = newLvl;
    day.statPoints += levelDiff * 5;
    
    globalProfile.level = newLvl;
    globalProfile.statPoints = day.statPoints;
    
    // Update Title
    if (weight <= 75.0) day.title = "S-RANK MONARCH";
    else if (weight <= 78.0) day.title = "A-RANK HUNTER";
    else if (weight <= 82.0) day.title = "B-RANK HUNTER";
    else if (weight <= 88.0) day.title = "C-RANK HUNTER";
    else if (weight <= 95.0) day.title = "D-RANK HUNTER";
    else day.title = "E-RANK HUNTER";
    
    globalProfile.title = day.title;
    alert(`[SYSTEM] LEVEL UP! You have reached Level ${day.level}. +${levelDiff * 5} Stat Points awarded.`);
  }
  
  input.value = '';
  saveDatabase();
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
      const day = db[currentDisplayDate];
      if (day) {
        day.quests.steps += 2;
        if (day.quests.steps % 500 === 0) {
          day.gold += 10;
        }
        saveDatabase();
        updateUI();
      }
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
      const day = db[currentDisplayDate];
      if (day) {
        day.quests.steps++;
        if (day.quests.steps % 50 === 0) {
          day.gold += 1;
        }
        lastStepTime = now;
        saveDatabase();
        updateUI();
      }
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
  
  const day = db[currentDisplayDate];
  if (day) {
    day.foodIntake += calories;
    day.meals.push({ name, calories, time: new Date().toLocaleTimeString() });
    
    nameInput.value = '';
    calInput.value = '';
    
    saveDatabase();
    updateUI();
    playSystemSound();
    
    appendMessage('system', `[SYSTEM] Meal Registered: ${name} (+${calories} kcal). Your calorie debt has increased.`);
  }
};

// --- Shop Purchases ---
window.buyItem = function(itemType, cost) {
  const day = db[currentDisplayDate];
  if (!day) return;

  if (day.gold >= cost) {
    day.gold -= cost;
    globalProfile.gold = day.gold;
    
    if (itemType === 'lasagna') {
      appendMessage('system', `[SYSTEM] Item [Elixir of Lasagna] purchased successfully. Your calorie balance is reduced by 800 Gold. You are permitted to consume 1 serving of Lasagna.`);
    } else if (itemType === 'allowance') {
      day.foodIntake -= 200;
      appendMessage('system', `[SYSTEM] Item [Low-Carb Boost Potion] consumed. Calorie debt reduced by 200 kcal.`);
    } else if (itemType === 'reset') {
      day.quests.water = 3.0;
      day.quests.workout = 45;
      appendMessage('system', `[SYSTEM] Item [Shadow Recovery Crystal] used. Water and workout quests have been fully cleared.`);
    }
    
    saveDatabase();
    updateUI();
    playSystemSound();
  } else {
    alert(`[SYSTEM] Insufficient Gold. You need ${cost - day.gold} more Gold to purchase this item.`);
  }
};

// --- AI Chat ---
window.sendMessage = async function(event) {
  event.preventDefault();
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;
  
  input.value = '';
  appendMessage('user', message);
  
  const typingId = appendMessage('system', `[SYSTEM] Connecting to the Shadow Monarch Agent...`);
  
  const day = db[currentDisplayDate];
  
  try {
    const response = await fetch('http://localhost:5000/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: message,
        player_stats: {
          level: day.level,
          hp: day.hp,
          gold: day.gold,
          steps: day.quests.steps,
          water: day.quests.water,
          workout: day.quests.workout,
          net_debt: getNetCalorieDebt(currentDisplayDate)
        }
      })
    });
    
    document.getElementById(typingId).remove();
    
    if (response.ok) {
      const data = await response.json();
      appendMessage('system', data.response);
    } else {
      throw new Error("Backend offline");
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
  const day = db[currentDisplayDate];
  
  if (msgLower.includes('lasagna')) {
    if (day.gold >= 800) {
      reply += `Hunter asheejajayan, your current Calorie Gold balance is ${day.gold}. You have enough Gold to purchase the [Elixir of Lasagna]. Go to the Inventory tab to execute the purchase.`;
    } else {
      reply += `Access Denied. Lasagna requires 800 Gold. Your current balance is ${day.gold}. You need ${800 - day.gold} more Gold. Suggestion: Walk ${Math.ceil((800 - day.gold) / CALORIES_PER_STEP)} more steps to clear this requirement.`;
    }
  } else if (msgLower.includes('status') || msgLower.includes('level')) {
    reply += `PLAYER STATUS EVALUATION:\n- Level: ${day.level}\n- Title: ${day.title}\n- Weight (HP): ${day.hp.toFixed(1)} kg\n- Current Gold: ${day.gold}\nKeep pushing, Hunter asheejajayan. The path to S-Rank is clear.`;
  } else if (msgLower.includes('hungry') || msgLower.includes('eat')) {
    reply += `[DIETARY RECOMMENDATION] Hunter asheejajayan, you are currently in a calorie debt of ${getNetCalorieDebt(currentDisplayDate)} kcal. Consume 100g of extra lean ground chicken (110 kcal, 23g protein) and unlimited broccoli to trigger satiety receptors without increasing your debt significantly.`;
  } else {
    reply += `Message received, Hunter asheejajayan. I am monitoring your agility (${day.quests.steps} steps) and vitality (${day.quests.water.toFixed(1)}L water). Continue your daily quest to limit break.`;
  }
  
  setTimeout(() => {
    appendMessage('system', reply);
  }, 800);
}

// --- Floating Particles Background ---
function initParticleBackground() {
  const canvas = document.getElementById('particle-canvas');
  const ctx = canvas.getContext('2d');
  
  let width = canvas.width = window.innerWidth;
  let height = canvas.height = window.innerHeight;
  
  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });
  
  const particles = [];
  
  // Create particles
  for (let i = 0; i < 40; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 2.5 + 0.5,
      speedY: -Math.random() * 0.4 - 0.1,
      alpha: Math.random() * 0.5 + 0.1,
      glow: Math.random() * 5 + 2
    });
  }
  
  function animate() {
    ctx.clearRect(0, 0, width, height);
    
    // Draw very subtle background grid
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.015)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // Draw particles
    particles.forEach(p => {
      p.y += p.speedY;
      if (p.y < -10) {
        p.y = height + 10;
        p.x = Math.random() * width;
      }
      
      ctx.shadowBlur = p.glow;
      ctx.shadowColor = 'rgba(0, 242, 254, 0.8)';
      ctx.fillStyle = `rgba(0, 242, 254, ${p.alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    
    ctx.shadowBlur = 0; // Reset shadow
    requestAnimationFrame(animate);
  }
  
  animate();
}

// --- Draw 7-Day Performance Canvas Chart ---
function drawAnalyticsChart() {
  const canvas = document.getElementById('analytics-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  const width = canvas.width = canvas.parentElement.clientWidth - 40;
  const height = canvas.height = 180;
  
  ctx.clearRect(0, 0, width, height);
  
  // Get last 7 days keys
  const dates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toLocaleDateString());
  }
  
  const dataPoints = dates.map(d => {
    // Make sure date is initialized in db for drawing
    if (!db[d]) {
      return { steps: 0, weight: 105.0 };
    }
    return {
      steps: db[d].quests.steps,
      weight: db[d].hp
    };
  });

  const maxSteps = Math.max(...dataPoints.map(p => p.steps), 5000);
  const chartHeight = height - 50;
  const colWidth = width / 7;
  
  // Draw grid lines & labels
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  ctx.font = '12px Rajdhani';
  ctx.fillStyle = '#8b9bb4';
  
  for (let i = 0; i < 7; i++) {
    const x = i * colWidth + colWidth / 2;
    // vertical line
    ctx.beginPath();
    ctx.moveTo(x, 10);
    ctx.lineTo(x, chartHeight + 10);
    ctx.stroke();
    
    // date label (shorten to day/month)
    const dateParts = dates[i].split('/');
    const shortDate = `${dateParts[0]}/${dateParts[1]}`;
    ctx.textAlign = 'center';
    ctx.fillText(shortDate, x, height - 10);
  }
  
  // Draw Steps Bars (glow effect)
  dataPoints.forEach((p, i) => {
    const x = i * colWidth + colWidth / 2;
    const barHeight = (p.steps / maxSteps) * chartHeight;
    const y = chartHeight + 10 - barHeight;
    
    ctx.fillStyle = 'rgba(0, 242, 254, 0.2)';
    ctx.fillRect(x - 8, y, 16, barHeight);
    
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 8, y, 16, barHeight);
  });
  
  // Draw Weight Line
  ctx.beginPath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ff3838';
  
  const minWeight = 70.0;
  const maxWeight = 110.0;
  
  dataPoints.forEach((p, i) => {
    const x = i * colWidth + colWidth / 2;
    const y = chartHeight + 10 - ((p.weight - minWeight) / (maxWeight - minWeight)) * chartHeight;
    
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  
  // Draw weight dots
  dataPoints.forEach((p, i) => {
    const x = i * colWidth + colWidth / 2;
    const y = chartHeight + 10 - ((p.weight - minWeight) / (maxWeight - minWeight)) * chartHeight;
    
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ff3838';
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 56, 56, 0.4)';
    ctx.stroke();
  });
}

// --- Audio ---
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
