/**
 * SlitSmart Factory OS - Core Engine
 * Industrial Slitting Optimizer & Production Management System
 */

// State
const state = {
  theme: 'dark',
  role: 'manager', // 'manager' or 'customer'
  master: {
    materialCategory: 'plastic', // 'plastic' or 'paper'
    plasticType: 'polyester', // 'polyester', 'bopp', 'cpp', 'pvc', 'custom'
    thicknessMicrons: 23,
    density: 1.395, // g/cm3 for BOPET
    paperGsm: 70,
    paperThicknessMicrons: 91, // calibrated ~ 1.3 um per GSM (editable by user)
    gsm: 32.085,
    widthMm: 1020, // standard parent roll width (1020 mm)
    parentTolMm: 2, // ±2 mm allowable parent roll tolerance
    weightKg: 1000,
    minTrimLeft: 10,
    minTrimRight: 10,
    minSlitWidth: 12,
    maxKnives: 35,
    weightTolerancePct: 15,
    machineSpeed: 400,
    setupMinutes: 20,
    rollChangeMinutes: 5, // minutes per roll set changeover
    // Finished Roll OD & Core Tube Specs
    coreDiaInch: 3, // 3" standard paper tube core
    targetOdInch: 10, // 10" max outside diameter
    manualRollLength: false,
    manualRollMeters: 1600,
    maxRollMeters: 1600,
    // Uniform Cycles (Guarantees zero stub rolls & uniform OD across all rolls)
    userCycleOverride: null,
    uniformCyclesCount: 20,
    uniformCycleMeters: 1528,
    resultingOdInch: 10.0
  },
  orders: [
    // Default preset reflecting user's operational scenario
    { id: 1, width: 120, targetKg: 60 },
    { id: 2, width: 18,  targetKg: 100 },
    { id: 3, width: 20,  targetKg: 80 },
    { id: 4, width: 15,  targetKg: 50 },
    { id: 5, width: 100, targetKg: 200 },
    { id: 6, width: 75,  targetKg: 150 },
    { id: 7, width: 50,  targetKg: 120 },
    { id: 8, width: 45,  targetKg: 100 },
    { id: 9, width: 35,  targetKg: 80 }
  ],
  solutions: [],
  selectedSolution: null,
  customBlades: {} // manual fine-tuning map: { width: count }
};

// Factory Empirical Benchmarks for 10" OD on 3" Paper Core
const EMPIRICAL_OD10_BENCHMARKS = {
  23: 1600,
  50: 800,
  75: 500,
  125: 300,
  175: 200,
  250: 150,
  350: 115
};

/**
 * Calculates Maximum Linear Web Length for a given Finished Roll OD and Core ID
 * Calibrated precisely against factory empirical converting standards.
 */
function calculateRollLength(thicknessMicrons, targetOdInch, coreDiaInch) {
  if (!thicknessMicrons || thicknessMicrons <= 0) return 1000;
  if (targetOdInch === 10 && coreDiaInch === 3 && EMPIRICAL_OD10_BENCHMARKS[thicknessMicrons]) {
    return EMPIRICAL_OD10_BENCHMARKS[thicknessMicrons];
  }

  const baseAreaFactor = (10 * 10 - 3 * 3); // 91 sq. in (Standard reference for 10" OD / 3" Tube)
  const currentAreaFactor = (targetOdInch * targetOdInch - coreDiaInch * coreDiaInch);
  if (currentAreaFactor <= 0) return 100;

  // Calibrated constant ~ 37,200 um * m (from empirical measurements: 23um * 1600m = 36,800; 50um * 800m = 40,000)
  const baseConstant = 37200;
  const scaledConstant = baseConstant * (currentAreaFactor / baseAreaFactor);
  return Math.max(50, Math.round(scaledConstant / thicknessMicrons));
}

// Preset Materials
const MATERIAL_PRESETS = {
  polyester: { name: 'Polyester (BOPET) Film', density: 1.395, isFilm: true },
  bopp:      { name: 'BOPP Film',              density: 0.905, isFilm: true },
  cpp:       { name: 'CPP Film',               density: 0.900, isFilm: true },
  pvc:       { name: 'Rigid PVC Film',         density: 1.380, isFilm: true },
  paper:     { name: 'Paper / Board',          density: null,  isFilm: false, defaultGsm: 70 },
  custom:    { name: 'Custom Material',        density: 1.000, isFilm: true }
};

// Palette for visual roll diagram
const CUT_COLORS = [
  '#0284c7', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', 
  '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6'
];

function getColorForWidth(width) {
  let hash = 0;
  const str = String(width);
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) % CUT_COLORS.length;
  return CUT_COLORS[hash];
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  initUI();
  calculateMaterialSpecs();
  runOptimizer();
});

function initUI() {
  // Theme toggle
  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    document.getElementById('themeToggleBtn').innerText = state.theme === 'dark' ? '☀️ Light' : '🌙 Dark';
  });

  // Role toggle
  document.querySelectorAll('.role-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.role = e.target.dataset.role;
      if (state.role === 'customer') {
        document.body.classList.add('customer-mode');
      } else {
        document.body.classList.remove('customer-mode');
      }
      renderAll();
    });
  });

  // Material Switch (Plastic vs Paper)
  const switchPlasticBtn = document.getElementById('switchPlasticBtn');
  const switchPaperBtn = document.getElementById('switchPaperBtn');
  const plasticSection = document.getElementById('plasticSpecificSection');
  const paperSection = document.getElementById('paperSpecificSection');

  if (switchPlasticBtn && switchPaperBtn) {
    switchPlasticBtn.addEventListener('click', () => {
      switchPlasticBtn.classList.add('active');
      switchPaperBtn.classList.remove('active');
      state.master.materialCategory = 'plastic';
      if (plasticSection) plasticSection.style.display = 'block';
      if (paperSection) paperSection.style.display = 'none';
      state.master.userCycleOverride = null;
      calculateMaterialSpecs();
      runOptimizer();
    });

    switchPaperBtn.addEventListener('click', () => {
      switchPaperBtn.classList.add('active');
      switchPlasticBtn.classList.remove('active');
      state.master.materialCategory = 'paper';
      if (plasticSection) plasticSection.style.display = 'none';
      if (paperSection) paperSection.style.display = 'block';
      state.master.userCycleOverride = null;
      calculateMaterialSpecs();
      runOptimizer();
    });
  }

  // Plastic Film type selector
  const plasticSelect = document.getElementById('plasticFilmSelect');
  if (plasticSelect) {
    plasticSelect.addEventListener('change', (e) => {
      state.master.plasticType = e.target.value;
      const preset = MATERIAL_PRESETS[e.target.value];
      if (preset && preset.density) {
        state.master.density = preset.density;
        const densInput = document.getElementById('densityInput');
        if (densInput) densInput.value = preset.density;
      }
      state.master.userCycleOverride = null;
      calculateMaterialSpecs();
      runOptimizer();
    });
  }

  // Paper GSM & Thickness inputs
  const paperGsmInput = document.getElementById('paperGsmInput');
  const paperThicknessInput = document.getElementById('paperThicknessInput');
  if (paperGsmInput) {
    paperGsmInput.addEventListener('input', () => {
      const gsm = parseFloat(paperGsmInput.value) || 70;
      state.master.paperGsm = gsm;
      if (paperThicknessInput) {
        // Standard paper bulk ~ 1.3 um per GSM
        const estMicrons = Math.round(gsm * 1.3);
        paperThicknessInput.value = estMicrons;
        state.master.paperThicknessMicrons = estMicrons;
      }
      state.master.userCycleOverride = null;
      calculateMaterialSpecs();
      runOptimizer();
    });
  }
  if (paperThicknessInput) {
    paperThicknessInput.addEventListener('input', () => {
      state.master.paperThicknessMicrons = parseFloat(paperThicknessInput.value) || 90;
      state.master.userCycleOverride = null;
      calculateMaterialSpecs();
      runOptimizer();
    });
  }

  // Cycle Count Adjuster Buttons (- / +)
  const decCycleBtn = document.getElementById('decreaseCycleBtn');
  const incCycleBtn = document.getElementById('increaseCycleBtn');
  if (decCycleBtn && incCycleBtn) {
    decCycleBtn.addEventListener('click', () => {
      const current = state.master.uniformCyclesCount || 1;
      if (current > 1) {
        state.master.userCycleOverride = current - 1;
        calculateMaterialSpecs();
        renderAll();
      }
    });
    incCycleBtn.addEventListener('click', () => {
      const current = state.master.uniformCyclesCount || 1;
      state.master.userCycleOverride = current + 1;
      calculateMaterialSpecs();
      renderAll();
    });
  }

  // Numeric inputs listener
  const masterInputs = [
    'thicknessInput', 'densityInput',
    'masterWidthInput', 'parentTolInput', 'masterWeightInput', 
    'trimLeftInput', 'trimRightInput', 'minSlitInput', 'toleranceInput',
    'machineSpeedInput', 'setupTimeInput', 'targetOdInput'
  ];

  masterInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        readMasterInputs();
        state.master.userCycleOverride = null;
        calculateMaterialSpecs();
        runOptimizer();
      });
    }
  });

  // Core Diameter select listener
  const coreSelect = document.getElementById('coreDiaSelect');
  if (coreSelect) {
    coreSelect.addEventListener('change', (e) => {
      state.master.coreDiaInch = parseFloat(e.target.value) || 3;
      state.master.userCycleOverride = null;
      calculateMaterialSpecs();
      runOptimizer();
    });
  }

  // Benchmark chips click listener
  const benchmarkChips = document.querySelectorAll('.benchmark-chip');
  benchmarkChips.forEach(chip => {
    chip.addEventListener('click', () => {
      benchmarkChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      const um = parseFloat(chip.dataset.um);
      state.master.thicknessMicrons = um;
      const thickInput = document.getElementById('thicknessInput');
      if (thickInput) thickInput.value = um;

      if (state.master.materialCategory === 'paper' && paperThicknessInput) {
        paperThicknessInput.value = um;
        state.master.paperThicknessMicrons = um;
      }

      state.master.userCycleOverride = null;
      readMasterInputs();
      calculateMaterialSpecs();
      runOptimizer();
    });
  });

  // Add cut row
  document.getElementById('addCutBtn').addEventListener('click', () => {
    const nextId = state.orders.length ? Math.max(...state.orders.map(o => o.id)) + 1 : 1;
    state.orders.push({ id: nextId, width: 25, targetKg: 50 });
    renderOrdersTable();
    runOptimizer();
  });

  // Preset buttons
  document.getElementById('loadUserSampleBtn').addEventListener('click', () => {
    loadUserSample();
  });

  // Print button
  document.getElementById('printJobCardBtn').addEventListener('click', () => {
    window.print();
  });

  renderOrdersTable();
}

function readMasterInputs() {
  state.master.thicknessMicrons = parseFloat(document.getElementById('thicknessInput')?.value) || 23;
  state.master.density = parseFloat(document.getElementById('densityInput')?.value) || 1.395;
  state.master.paperGsm = parseFloat(document.getElementById('paperGsmInput')?.value) || 70;
  state.master.paperThicknessMicrons = parseFloat(document.getElementById('paperThicknessInput')?.value) || 91;
  state.master.widthMm = parseFloat(document.getElementById('masterWidthInput')?.value) || 1020;
  state.master.parentTolMm = parseFloat(document.getElementById('parentTolInput')?.value) || 2;
  state.master.weightKg = parseFloat(document.getElementById('masterWeightInput')?.value) || 1000;
  state.master.minTrimLeft = parseFloat(document.getElementById('trimLeftInput')?.value) || 10;
  state.master.minTrimRight = parseFloat(document.getElementById('trimRightInput')?.value) || 10;
  state.master.minSlitWidth = parseFloat(document.getElementById('minSlitInput')?.value) || 12;
  state.master.weightTolerancePct = parseFloat(document.getElementById('toleranceInput')?.value) || 15;
  state.master.machineSpeed = parseFloat(document.getElementById('machineSpeedInput')?.value) || 400;
  state.master.rollChangeMinutes = parseFloat(document.getElementById('setupTimeInput')?.value) || 5;
  state.master.targetOdInch = parseFloat(document.getElementById('targetOdInput')?.value) || 10;
}

function calculateMaterialSpecs() {
  const isPlastic = state.master.materialCategory === 'plastic';
  let activeThicknessMicrons = 23;

  if (isPlastic) {
    // Plastic Film: GSM = thickness (um) * density (g/cm3)
    state.master.gsm = +(state.master.thicknessMicrons * state.master.density).toFixed(3);
    activeThicknessMicrons = state.master.thicknessMicrons;
  } else {
    // Paper: Direct GSM from tester
    state.master.gsm = state.master.paperGsm || 70;
    activeThicknessMicrons = state.master.paperThicknessMicrons || Math.round(state.master.gsm * 1.3);
  }

  const gsmBadge = document.getElementById('computedGsmBadge');
  if (gsmBadge) gsmBadge.innerText = `${state.master.gsm} GSM (${isPlastic ? 'Film' : 'Paper'})`;

  // Total Master Linear Web length: L = (Weight in kg * 1,000,000) / (GSM * Width in mm)
  const masterWidthM = state.master.widthMm / 1000;
  const areaM2 = (state.master.weightKg * 1000) / state.master.gsm;
  state.master.linearMeters = Math.round(areaM2 / masterWidthM);

  const lengthEl = document.getElementById('kpiLinearMeters');
  if (lengthEl) lengthEl.innerText = `${state.master.linearMeters.toLocaleString()} m`;

  // Calculate Max Linear Meters for Target OD & Core Tube
  state.master.maxRollMeters = calculateRollLength(
    activeThicknessMicrons, 
    state.master.targetOdInch, 
    state.master.coreDiaInch
  );

  // UNIFORM CYCLES / ROUNDS CALCULATION (Zero odd stub rolls)
  let cyclesCount;
  if (state.master.userCycleOverride && state.master.userCycleOverride > 0) {
    cyclesCount = state.master.userCycleOverride;
  } else {
    cyclesCount = Math.max(1, Math.ceil(state.master.linearMeters / state.master.maxRollMeters));
  }
  state.master.uniformCyclesCount = cyclesCount;

  // EXACT Uniform meters per cycle:
  state.master.uniformCycleMeters = Math.round(state.master.linearMeters / cyclesCount);

  // Calculate resulting OD
  const baseAreaFactor = (10 * 10 - 3 * 3);
  const baseConstant = 37200;
  const targetArea = (state.master.uniformCycleMeters * activeThicknessMicrons) / baseConstant * baseAreaFactor;
  const idSquared = (state.master.coreDiaInch * state.master.coreDiaInch);
  const resultingOd = Math.sqrt(idSquared + Math.max(0, targetArea));
  state.master.resultingOdInch = +resultingOd.toFixed(1);

  // Update UI Displays
  const rollMeterDisp = document.getElementById('computedRollMeterDisplay');
  if (rollMeterDisp) rollMeterDisp.innerText = `${state.master.uniformCycleMeters.toLocaleString()} m / cycle`;

  const maxMeterBadge = document.getElementById('maxMeterBadge');
  if (maxMeterBadge) maxMeterBadge.innerText = `${state.master.uniformCyclesCount} Uniform Cycles`;

  // Estimated Machine Runtime: Slitting run + 1-time blade setup + roll changes
  const slittingMinutes = state.master.machineSpeed > 0 ? (state.master.linearMeters / state.master.machineSpeed) : 0;
  const rollChangeTotalMinutes = Math.max(0, state.master.uniformCyclesCount - 1) * (state.master.rollChangeMinutes || 5);
  const totalMinutes = Math.round(slittingMinutes + (state.master.setupMinutes || 20) + rollChangeTotalMinutes);
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  state.master.estTimeStr = hrs > 0 ? `~${hrs} hr ${mins} min` : `~${mins} min`;
}

function renderOrdersTable() {
  const tbody = document.getElementById('ordersTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  let totalTargetKg = 0;
  let hasMechanicalViolation = false;

  state.orders.forEach((order, index) => {
    totalTargetKg += (order.targetKg || 0);
    const isBelowMin = order.width < state.master.minSlitWidth;
    if (isBelowMin) hasMechanicalViolation = true;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <span style="display:inline-block; width:12px; height:12px; border-radius:2px; background:${getColorForWidth(order.width)}; margin-right:6px; vertical-align:middle;"></span>
        <strong>#${index + 1}</strong>
      </td>
      <td>
        <input type="number" step="0.5" min="1" value="${order.width}" data-field="width" data-id="${order.id}" class="row-input" style="width:80px"> mm
      </td>
      <td>
        <input type="number" step="1" min="1" value="${order.targetKg}" data-field="targetKg" data-id="${order.id}" class="row-input" style="width:90px"> kg
      </td>
      <td>
        ${isBelowMin ? `<span class="badge badge-danger">⚠️ &lt; ${state.master.minSlitWidth}mm (Impossible)</span>` : `<span class="badge badge-success">✓ Feasible</span>`}
      </td>
      <td style="text-align:right">
        <button class="btn-del-row" data-id="${order.id}" title="Remove cut">✕</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Attach input listeners
  tbody.querySelectorAll('.row-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const id = parseInt(e.target.dataset.id);
      const field = e.target.dataset.field;
      const val = parseFloat(e.target.value) || 0;
      const order = state.orders.find(o => o.id === id);
      if (order) {
        order[field] = val;
        renderOrdersTable();
        runOptimizer();
      }
    });
  });

  tbody.querySelectorAll('.btn-del-row').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id);
      state.orders = state.orders.filter(o => o.id !== id);
      renderOrdersTable();
      runOptimizer();
    });
  });

  const totalTargetEl = document.getElementById('totalTargetKgDisplay');
  if (totalTargetEl) {
    totalTargetEl.innerText = `${totalTargetKg.toFixed(1)} kg`;
  }

  // Update order feasibility warning banner
  const alertEl = document.getElementById('mechanicalAlert');
  if (alertEl) {
    if (hasMechanicalViolation) {
      alertEl.style.display = 'flex';
      alertEl.className = 'alert alert-danger';
      alertEl.innerHTML = `<div><strong>Mechanical Limit Error:</strong> One or more slit widths are below the machine's minimum knife spacing (${state.master.minSlitWidth} mm). On standard shear/knife shafts, such narrow widths will cause blade clash, web tearing, or core winding failure. Please adjust or reject cuts under ${state.master.minSlitWidth} mm.</div>`;
    } else {
      alertEl.style.display = 'none';
    }
  }
}

/**
 * High-Speed Combinatorial Optimizer for Single-Setup Slitting
 * Finds integer blade allocation (n_1, n_2, ..., n_k) that fits in usable roll width,
 * minimizes edge scrap, and achieves closest proportional target weights.
 */
function runOptimizer() {
  const usableWidth = state.master.widthMm - (state.master.minTrimLeft + state.master.minTrimRight);
  const masterWeight = state.master.weightKg;
  const masterWidth = state.master.widthMm;

  if (state.orders.length === 0) {
    state.solutions = [];
    state.selectedSolution = null;
    renderAll();
    return;
  }

  // Check if mechanical violations exist
  const hasMinViolations = state.orders.some(o => o.width < state.master.minSlitWidth);
  if (hasMinViolations) {
    state.solutions = [];
    state.selectedSolution = null;
    renderAll();
    return;
  }

  // Check if minimum single cut of each item exceeds usable width
  const minSum = state.orders.reduce((sum, o) => sum + o.width, 0);
  const feasibilityBanner = document.getElementById('feasibilityBanner');

  if (minSum > usableWidth) {
    if (feasibilityBanner) {
      feasibilityBanner.style.display = 'flex';
      feasibilityBanner.className = 'alert alert-warning';
      feasibilityBanner.innerHTML = `<div><strong>Single-Setup Roll Capacity Warning:</strong> The sum of just one cut of each requested size (${minSum} mm) exceeds the usable slitting width (${usableWidth} mm). It is physically impossible to produce ALL requested sizes simultaneously in 1 blade setup. To fulfill the complete order, you will either need to run multiple master rolls or split into 2 setups. Below we have optimized the best single-run combination that maximizes master roll yield.</div>`;
    }
  } else {
    if (feasibilityBanner) {
      feasibilityBanner.style.display = 'none';
    }
  }

  // Target weights and sizes
  const items = state.orders.map(o => ({
    id: o.id,
    width: o.width,
    targetKg: o.targetKg
  }));

  const totalTargetKg = items.reduce((s, it) => s + it.targetKg, 0);

  // Combinatorial search
  const candidates = [];
  const initialBlades = {};
  items.forEach(it => { initialBlades[it.width] = (minSum <= usableWidth) ? 1 : 0; });

  const maxTolMm = state.master.parentTolMm || 2;
  const maxSearchWidth = usableWidth + maxTolMm;

  // Recursive search to find optimal blade counts
  function search(index, currentWidth, currentCounts) {
    if (index === items.length) {
      if (currentWidth > 0 && currentWidth <= maxSearchWidth) {
        evaluateCandidate(currentCounts, currentWidth);
      }
      return;
    }

    const item = items[index];
    const width = item.width;
    const minCuts = (minSum <= usableWidth) ? 1 : 0;

    // Estimate ideal cut count based on target weight proportion
    const idealKgFraction = totalTargetKg > 0 ? (item.targetKg / totalTargetKg) : (1 / items.length);
    const idealWidthAllocation = usableWidth * idealKgFraction;
    const idealCuts = Math.max(minCuts, Math.round(idealWidthAllocation / width));
    
    // Search a practical range around ideal cuts
    const maxPossible = Math.floor((maxSearchWidth - currentWidth) / width);
    const low = minCuts;
    const high = Math.min(maxPossible, Math.max(idealCuts + 3, minCuts + 2));

    for (let c = low; c <= high; c++) {
      const nextWidth = currentWidth + (c * width);
      if (nextWidth <= maxSearchWidth) {
        currentCounts[width] = (currentCounts[width] || 0) + c;
        search(index + 1, nextWidth, currentCounts);
        currentCounts[width] -= c;
      }
    }
  }

  function evaluateCandidate(bladeCounts, cutsWidth) {
    const totalBlades = Object.values(bladeCounts).reduce((a, b) => a + b, 0);
    const isTolAllowed = totalBlades > 12; // Factory rule: tolerance adjustment permitted only if > 12 blades
    const allowedParentWidth = isTolAllowed ? (masterWidth + maxTolMm) : masterWidth;
    const minRequiredTrim = (state.master.minTrimLeft + state.master.minTrimRight);
    const maxAllowedCutsWidth = allowedParentWidth - minRequiredTrim;

    if (cutsWidth > maxAllowedCutsWidth) return;

    // Determine if this candidate uses the parent roll tolerance
    let usedTolMm = 0;
    let effectiveRollWidth = masterWidth;
    if (cutsWidth > usableWidth) {
      if (!isTolAllowed) return; // Strict lock: cannot exceed nominal width if <= 12 blades
      usedTolMm = +(cutsWidth - usableWidth).toFixed(1);
      effectiveRollWidth = masterWidth + usedTolMm;
    }

    const trimWidth = effectiveRollWidth - cutsWidth;
    if (trimWidth < minRequiredTrim && !isTolAllowed) return;

    const scrapPct = (trimWidth / effectiveRollWidth) * 100;

    let totalWeightDiff = 0;
    let maxPctDiff = 0;
    let totalPctDiff = 0;
    let fulfilledCount = 0;

    const cutsMap = [];
    items.forEach(it => {
      const count = bladeCounts[it.width] || 0;
      if (count > 0) fulfilledCount++;
      const producedKg = masterWeight * ((count * it.width) / masterWidth);
      const diffKg = producedKg - it.targetKg;
      const pctDiff = it.targetKg > 0 ? (Math.abs(diffKg) / it.targetKg) * 100 : 0;

      totalWeightDiff += Math.abs(diffKg);
      totalPctDiff += pctDiff;
      if (pctDiff > maxPctDiff) maxPctDiff = pctDiff;

      cutsMap.push({
        width: it.width,
        count: count,
        totalWidth: count * it.width,
        producedKg: +producedKg.toFixed(1),
        targetKg: it.targetKg,
        diffKg: +diffKg.toFixed(1),
        pctDiff: +pctDiff.toFixed(1)
      });
    });

    const meanPctDiff = cutsMap.length > 0 ? (totalPctDiff / cutsMap.length) : 0;

    // Multi-objective scores
    // Score 1 (Balanced): Equal balance of scrap control and weight deviation
    const scoreBalanced = (scrapPct * 1.5) + (meanPctDiff * 0.8) + (maxPctDiff * 0.4);

    // Score 2 (Min Scrap): Heavy weight on scrap minimization
    const scoreMinScrap = (scrapPct * 4.0) + (meanPctDiff * 0.5);

    // Score 3 (Weight Fidelity): Heavy weight on precision kg delivery
    const scoreExactKg = (scrapPct * 0.5) + (meanPctDiff * 2.5) + (maxPctDiff * 1.5);

    candidates.push({
      bladeCounts: { ...bladeCounts },
      cutsMap,
      cutsWidth,
      trimWidth,
      effectiveRollWidth,
      usedTolMm,
      toleranceActive: usedTolMm > 0,
      trimLeft: +(trimWidth / 2).toFixed(1),
      trimRight: +(trimWidth / 2).toFixed(1),
      scrapPct: +scrapPct.toFixed(2),
      scrapKg: +(masterWeight * (trimWidth / effectiveRollWidth)).toFixed(1),
      fgKg: +(masterWeight * (cutsWidth / effectiveRollWidth)).toFixed(1),
      totalBlades,
      fulfilledCount,
      meanPctDiff: +meanPctDiff.toFixed(1),
      maxPctDiff: +maxPctDiff.toFixed(1),
      scoreBalanced,
      scoreMinScrap,
      scoreExactKg
    });
  }

  // Run the branch-and-bound search
  search(0, 0, {});

  if (candidates.length === 0) {
    // Fallback: simple proportional allocation
    const fallbackCounts = {};
    let usedW = 0;
    items.forEach(it => {
      const c = 1;
      if (usedW + it.width <= usableWidth) {
        fallbackCounts[it.width] = 1;
        usedW += it.width;
      } else {
        fallbackCounts[it.width] = 0;
      }
    });
    evaluateCandidate(fallbackCounts, usedW);
  }

  // Filter and pick Top 3 Distinct Recipes
  // 1. Champion Balanced
  candidates.sort((a, b) => a.scoreBalanced - b.scoreBalanced);
  const bestBalanced = candidates[0];

  // 2. Minimum Scrap Champion
  const minScrapList = [...candidates].sort((a, b) => a.scoreMinScrap - b.scoreMinScrap);
  const bestMinScrap = minScrapList.find(c => JSON.stringify(c.bladeCounts) !== JSON.stringify(bestBalanced?.bladeCounts)) || minScrapList[0];

  // 3. Precision Weight Fidelity Champion
  const exactKgList = [...candidates].sort((a, b) => a.scoreExactKg - b.scoreExactKg);
  const bestExactKg = exactKgList.find(c => 
    JSON.stringify(c.bladeCounts) !== JSON.stringify(bestBalanced?.bladeCounts) && 
    JSON.stringify(c.bladeCounts) !== JSON.stringify(bestMinScrap?.bladeCounts)
  ) || exactKgList[0];

  state.solutions = [
    { type: 'balanced', title: 'Recipe A: Optimal Balanced (Recommended)', badge: 'Best Trade-Off', data: bestBalanced },
    { type: 'minscrap', title: 'Recipe B: Maximum Roll Yield', badge: 'Lowest Scrap', data: bestMinScrap },
    { type: 'exactkg',  title: 'Recipe C: Precision Target Weight', badge: 'Closest Kg', data: bestExactKg }
  ];

  // Keep selection or default to Recipe A
  if (!state.selectedSolution || !state.solutions.some(s => s.type === state.selectedSolution.type)) {
    selectRecipe(state.solutions[0]);
  } else {
    const current = state.solutions.find(s => s.type === state.selectedSolution.type);
    selectRecipe(current);
  }

  renderAll();
}

function selectRecipe(sol) {
  state.selectedSolution = sol;
  state.customBlades = { ...sol.data.bladeCounts };
  renderAll();
}

/**
 * Updates calculation when Production Manager manually tweaks a blade count (+/-)
 */
function updateCustomBladeCount(width, delta) {
  const current = state.customBlades[width] || 0;
  const next = Math.max(0, current + delta);
  state.customBlades[width] = next;

  // Recalculate custom live metrics
  const masterWidth = state.master.widthMm;
  const masterWeight = state.master.weightKg;

  let cutsWidth = 0;
  let totalBlades = 0;
  const cutsMap = [];

  state.orders.forEach(it => {
    const count = state.customBlades[it.width] || 0;
    const w = it.width;
    cutsWidth += count * w;
    totalBlades += count;

    const producedKg = masterWeight * ((count * w) / masterWidth);
    const diffKg = producedKg - it.targetKg;
    const pctDiff = it.targetKg > 0 ? (Math.abs(diffKg) / it.targetKg) * 100 : 0;

    cutsMap.push({
      width: w,
      count: count,
      totalWidth: count * w,
      producedKg: +producedKg.toFixed(1),
      targetKg: it.targetKg,
      diffKg: +diffKg.toFixed(1),
      pctDiff: +pctDiff.toFixed(1)
    });
  });

  const trimWidth = masterWidth - cutsWidth;
  const scrapPct = (trimWidth / masterWidth) * 100;
  const trimLeft = +(trimWidth / 2).toFixed(1);
  const trimRight = +(trimWidth / 2).toFixed(1);

  state.selectedSolution.data = {
    ...state.selectedSolution.data,
    bladeCounts: { ...state.customBlades },
    cutsMap,
    cutsWidth,
    trimWidth,
    trimLeft,
    trimRight,
    scrapPct: +scrapPct.toFixed(2),
    scrapKg: +(masterWeight * (trimWidth / masterWidth)).toFixed(1),
    fgKg: +(masterWeight * (cutsWidth / masterWidth)).toFixed(1),
    totalBlades
  };

  renderAll();
}

function renderAll() {
  renderKPIRibbon();
  renderRecipeCards();
  renderRollVisualizer();
  renderBladeStopsTable();
  renderComparisonTable();
  renderRollSetsTable();
  renderPrintJobCard();
}

function renderKPIRibbon() {
  if (!state.selectedSolution) return;
  const d = state.selectedSolution.data;

  const totalSets = state.master.uniformCyclesCount;
  const setMeters = state.master.uniformCycleMeters;

  document.getElementById('kpiFgWeight').innerText = `${d.fgKg} kg`;
  document.getElementById('kpiFgSub').innerText = `${((d.fgKg / state.master.weightKg) * 100).toFixed(1)}% yield from master`;

  document.getElementById('kpiScrap').innerText = `${d.scrapKg} kg (${d.scrapPct}%)`;
  document.getElementById('kpiScrapSub').innerText = `Trim L: ${d.trimLeft}mm | R: ${d.trimRight}mm`;

  document.getElementById('kpiLinearMeters').innerText = `${state.master.linearMeters.toLocaleString()} m`;

  const kpiSets = document.getElementById('kpiRollSets');
  if (kpiSets) kpiSets.innerText = `${totalSets} Uniform Cycles`;
  const kpiSetsSub = document.getElementById('kpiRollSetsSub');
  if (kpiSetsSub) kpiSetsSub.innerText = `${setMeters.toLocaleString()}m / cycle (${state.master.estTimeStr})`;

  const kpiTargetOd = document.getElementById('kpiTargetOd');
  if (kpiTargetOd) kpiTargetOd.innerText = `${state.master.resultingOdInch}" OD`;
  const kpiCoreDia = document.getElementById('kpiCoreDia');
  if (kpiCoreDia) kpiCoreDia.innerText = `${state.master.coreDiaInch}" Core (${(state.master.coreDiaInch * 25.4).toFixed(1)} mm)`;

  document.getElementById('kpiBlades').innerText = `${d.totalBlades} Cuts`;
  const bladesSubEl = document.getElementById('kpiBladesSub');
  if (bladesSubEl) {
    if (d.totalBlades > 12) {
      if (d.usedTolMm > 0) {
        bladesSubEl.innerHTML = `<strong style="color:var(--accent-orange)">⚡ Tol. +${d.usedTolMm}mm Active</strong>`;
      } else {
        bladesSubEl.innerHTML = `<span style="color:var(--accent-green)">⚡ Tol. Active (&gt;12 blades)</span>`;
      }
    } else {
      bladesSubEl.innerHTML = `<span style="color:var(--text-muted)">🔒 Tol. Locked (&le;12 blades)</span>`;
    }
  }

  // Update Operator Action Directive Banner
  const directiveMain = document.getElementById('directiveMainText');
  if (directiveMain) {
    directiveMain.innerText = `RUN ${totalSets} CYCLES OF EXACTLY ${setMeters.toLocaleString()} METERS EACH`;
  }
  const directiveSub = document.getElementById('directiveSubText');
  if (directiveSub) {
    directiveSub.innerHTML = `All finished rolls will have identical <strong>${state.master.resultingOdInch}" OD</strong> on <strong>${state.master.coreDiaInch}" Core</strong> | Single Knife Setup (${d.totalBlades} Cuts) | <strong>ZERO stub/odd rolls!</strong>`;
  }
  const cycleCountDisp = document.getElementById('cycleCountDisplay');
  if (cycleCountDisp) {
    cycleCountDisp.innerText = `${totalSets} Rounds`;
  }

  // Update tolerance rule text in master card
  const parentTolStatus = document.getElementById('parentTolStatus');
  if (parentTolStatus) {
    if (d.totalBlades > 12) {
      parentTolStatus.innerHTML = `⚡ <strong>Tolerance Active:</strong> ${d.totalBlades} blades mounted (>12). ±${state.master.parentTolMm}mm parent roll tolerance is enabled for micro-fit.`;
      parentTolStatus.style.color = 'var(--accent-green)';
    } else {
      parentTolStatus.innerHTML = `🔒 <strong>Tolerance Locked:</strong> Only ${d.totalBlades} blades mounted. Tolerance rule requires &gt; 12 blades.`;
      parentTolStatus.style.color = 'var(--accent-amber)';
    }
  }
}

function renderRecipeCards() {
  const container = document.getElementById('recipeCardsContainer');
  if (!container) return;
  container.innerHTML = '';

  state.solutions.forEach(sol => {
    const isSelected = state.selectedSolution && state.selectedSolution.type === sol.type;
    const d = sol.data;

    const div = document.createElement('div');
    div.className = `recipe-card ${isSelected ? 'active' : ''}`;
    div.innerHTML = `
      <span class="recipe-badge ${sol.type === 'balanced' ? 'badge-champion' : ''}">${sol.badge}</span>
      <div class="recipe-header">
        <div class="recipe-title">${sol.title}</div>
      </div>
      <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:6px;">
        Cuts: <strong>${d.totalBlades}</strong> (${d.cutsWidth} mm) | Trim: <strong>${d.trimWidth} mm</strong> (${d.scrapPct}%)
      </div>
      ${d.usedTolMm > 0 ? `<div style="font-size:0.7rem; color:var(--accent-orange); margin-bottom:6px; font-weight:600;">⚡ +${d.usedTolMm} mm Parent Roll Tolerance Applied across ${d.totalBlades} Blades</div>` : ''}
      <div class="recipe-stats">
        <div><strong>FG Yield:</strong> ${d.fgKg} kg</div>
        <div><strong>Scrap Loss:</strong> ${d.scrapKg} kg</div>
        <div><strong>Mean Var:</strong> ±${d.meanPctDiff}%</div>
        <div><strong>Max Var:</strong> ±${d.maxPctDiff}%</div>
      </div>
    `;

    div.addEventListener('click', () => {
      selectRecipe(sol);
    });

    container.appendChild(div);
  });
}

function renderRollSetsTable() {
  if (!state.selectedSolution) return;
  const d = state.selectedSolution.data;
  const tbody = document.getElementById('rollSetsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const totalSets = state.master.uniformCyclesCount;
  const setMeters = state.master.uniformCycleMeters;

  const setsBadge = document.getElementById('setsCardBadge');
  if (setsBadge) {
    setsBadge.innerText = `${totalSets} Uniform Cycles @ ${setMeters.toLocaleString()}m / roll`;
  }

  let grandTotalRolls = 0;

  d.cutsMap.forEach(cut => {
    const rollsPerSet = cut.count;
    const totalRolls = rollsPerSet * totalSets;
    grandTotalRolls += totalRolls;

    // Weight of 1 full roll: Length(m) * Width(m) * GSM / 1000 kg
    const singleRollKg = +(setMeters * (cut.width / 1000) * (state.master.gsm / 1000)).toFixed(2);
    const totalWidthAlloc = cut.count * cut.width;
    const totalFgKg = +(state.master.weightKg * (totalWidthAlloc / state.master.widthMm)).toFixed(1);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <span style="display:inline-block; width:8px; height:8px; border-radius:2px; background:${getColorForWidth(cut.width)}; margin-right:4px;"></span>
        <strong>${cut.width} mm</strong>
      </td>
      <td><strong>${cut.count}</strong> cuts</td>
      <td><strong>${rollsPerSet}</strong> /cycle</td>
      <td><strong style="color:var(--accent-orange); font-size:0.85rem;">${totalRolls}</strong> rolls</td>
      <td><strong>${singleRollKg} kg</strong></td>
      <td><strong style="color:var(--accent-blue);">${totalFgKg} kg</strong></td>
      <td>
        <span class="badge badge-info" style="padding:1px 5px; font-size:0.7rem;">${state.master.coreDiaInch}" Core</span>
        <span style="font-size:0.7rem; color:var(--text-muted); margin-left:3px;">${state.master.resultingOdInch}" OD</span>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const footer = document.getElementById('setsSummaryFooter');
  if (footer) {
    footer.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div>
          <strong>100% Uniform OD Production:</strong> Exactly ${totalSets} Uniform Cycles of ${setMeters.toLocaleString()}m each. Every roll produced is identical in OD (${state.master.resultingOdInch}"). <strong>Zero mix-and-match, zero stub rolls.</strong>
        </div>
        <div>
          <strong>Total Finished Reels:</strong> <span style="color:var(--accent-orange); font-weight:700; font-size:0.95rem;">${grandTotalRolls} rolls</span>
        </div>
      </div>
    `;
  }
}

function renderRollVisualizer() {
  if (!state.selectedSolution) return;
  const d = state.selectedSolution.data;
  const schematic = document.getElementById('rollSchematic');
  const scale = document.getElementById('rulerScale');
  if (!schematic) return;

  schematic.innerHTML = '';
  if (scale) scale.innerHTML = '';

  const masterWidth = state.master.widthMm;

  // Left Trim Segment
  if (d.trimLeft > 0) {
    const leftTrimPct = (d.trimLeft / masterWidth) * 100;
    const seg = document.createElement('div');
    seg.className = 'roll-segment segment-trim';
    seg.style.width = `${leftTrimPct}%`;
    seg.title = `Left Edge Trim: ${d.trimLeft} mm`;
    seg.innerHTML = `<span>Trim ${d.trimLeft}m</span>`;
    schematic.appendChild(seg);
  }

  // Finished Product Slits
  let reelNumber = 1;
  d.cutsMap.forEach(cut => {
    for (let i = 0; i < cut.count; i++) {
      const cutPct = (cut.width / masterWidth) * 100;
      const seg = document.createElement('div');
      seg.className = 'roll-segment';
      seg.style.width = `${cutPct}%`;
      seg.style.backgroundColor = getColorForWidth(cut.width);
      
      const singleReelKg = (state.master.weightKg * (cut.width / masterWidth)).toFixed(1);
      seg.title = `Reel #${reelNumber}: ${cut.width} mm (${singleReelKg} kg, ${state.master.linearMeters}m)`;
      seg.innerHTML = `
        <div style="font-size:0.75rem">${cut.width} mm</div>
        <div style="font-size:0.6rem; opacity:0.85">#${reelNumber} (${singleReelKg}kg)</div>
      `;
      schematic.appendChild(seg);
      reelNumber++;
    }
  });

  // Right Trim Segment
  if (d.trimRight > 0) {
    const rightTrimPct = (d.trimRight / masterWidth) * 100;
    const seg = document.createElement('div');
    seg.className = 'roll-segment segment-trim';
    seg.style.width = `${rightTrimPct}%`;
    seg.title = `Right Edge Trim: ${d.trimRight} mm`;
    seg.innerHTML = `<span>Trim ${d.trimRight}m</span>`;
    schematic.appendChild(seg);
  }

  // Ruler markings
  if (scale) {
    scale.innerHTML = `
      <div style="position:absolute; left:0;">0 mm</div>
      <div style="position:absolute; left:25%; transform:translateX(-50%)">${masterWidth * 0.25} mm</div>
      <div style="position:absolute; left:50%; transform:translateX(-50%)">${masterWidth * 0.5} mm (Center)</div>
      <div style="position:absolute; left:75%; transform:translateX(-50%)">${masterWidth * 0.75} mm</div>
      <div style="position:absolute; right:0;">${masterWidth} mm</div>
    `;
  }
}

function renderBladeStopsTable() {
  if (!state.selectedSolution) return;
  const d = state.selectedSolution.data;
  const tbody = document.getElementById('bladeStopsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  let currentStop = 0;
  let knifeIndex = 1;

  // Blade 0 / Left Trim Stop
  currentStop += d.trimLeft;

  let reelIndex = 1;
  d.cutsMap.forEach(cut => {
    for (let i = 0; i < cut.count; i++) {
      const nextStop = currentStop + cut.width;
      const singleReelKg = +(state.master.weightKg * (cut.width / state.master.widthMm)).toFixed(1);
      const isTop = (knifeIndex % 2 === 1);
      const shaftBadge = isTop
        ? `<span class="shaft-badge shaft-top">Top Shaft</span>`
        : `<span class="shaft-badge shaft-bottom">Bottom Shaft</span>`;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="color:var(--text-muted); font-weight:700;">#${knifeIndex}</td>
        <td><strong>R${reelIndex}</strong></td>
        <td><span style="font-family:var(--font-mono); font-weight:700; color:var(--accent-blue); white-space:nowrap;">${currentStop.toFixed(1)} &rarr; ${nextStop.toFixed(1)} mm</span></td>
        <td><span class="badge badge-info" style="padding:1px 6px;">${cut.width} mm</span></td>
        <td><strong style="white-space:nowrap;">${singleReelKg} kg</strong></td>
        <td><span style="color:var(--text-muted); font-size:0.75rem; white-space:nowrap;">${state.master.uniformCycleMeters.toLocaleString()} m</span></td>
        <td>${shaftBadge}</td>
      `;
      tbody.appendChild(tr);

      currentStop = nextStop;
      knifeIndex++;
      reelIndex++;
    }
  });

  // Final trim summary row
  const trTrim = document.createElement('tr');
  trTrim.style.background = 'rgba(239, 68, 68, 0.08)';
  trTrim.innerHTML = `
    <td colspan="2"><strong style="color:var(--accent-red)">Edge Trims</strong></td>
    <td colspan="2"><span style="white-space:nowrap;">Left: <strong>${d.trimLeft}mm</strong> | Right: <strong>${d.trimRight}mm</strong></span></td>
    <td><strong>${d.scrapKg} kg</strong></td>
    <td><span style="color:var(--text-muted); font-size:0.75rem;">${d.scrapPct}% waste</span></td>
    <td><span class="badge badge-danger" style="padding:1px 6px;">Edge Blower</span></td>
  `;
  tbody.appendChild(trTrim);
}

function renderComparisonTable() {
  if (!state.selectedSolution) return;
  const d = state.selectedSolution.data;
  const tbody = document.getElementById('comparisonTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  d.cutsMap.forEach(cut => {
    const isOver = cut.diffKg > 0;
    const isWithinTol = Math.abs(cut.pctDiff) <= state.master.weightTolerancePct;
    const tolBadge = isWithinTol 
      ? `<span class="badge badge-success">✓ OK (±${cut.pctDiff}%)</span>`
      : `<span class="badge badge-warning">⚠️ High Var (±${cut.pctDiff}%)</span>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <span style="display:inline-block; width:8px; height:8px; border-radius:2px; background:${getColorForWidth(cut.width)}; margin-right:4px;"></span>
        <strong>${cut.width} mm</strong>
      </td>
      <td>
        <div style="display:flex; align-items:center; gap:4px;">
          <button class="counter-btn" onclick="updateCustomBladeCount(${cut.width}, -1)">-</button>
          <span class="counter-value">${cut.count}</span>
          <button class="counter-btn" onclick="updateCustomBladeCount(${cut.width}, 1)">+</button>
        </div>
      </td>
      <td>${cut.totalWidth} mm</td>
      <td>${cut.targetKg} kg</td>
      <td><strong style="color:var(--accent-blue)">${cut.producedKg} kg</strong></td>
      <td style="color:${isOver ? 'var(--accent-green)' : 'var(--accent-amber)'}">
        ${isOver ? '+' : ''}${cut.diffKg} kg
      </td>
      <td>${tolBadge}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderPrintJobCard() {
  if (!state.selectedSolution) return;
  const sheet = document.getElementById('operatorPrintSheet');
  if (!sheet) return;

  const d = state.selectedSolution.data;
  const isPlastic = state.master.materialCategory === 'plastic';
  const totalSets = state.master.uniformCyclesCount;
  const setMeters = state.master.uniformCycleMeters;
  const resultingOd = state.master.resultingOdInch;
  const coreDia = state.master.coreDiaInch;

  const dateStr = new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  let materialDesc = '';
  if (isPlastic) {
    const pName = MATERIAL_PRESETS[state.master.plasticType]?.name || 'Polyester Film';
    materialDesc = `${pName} | ${state.master.thicknessMicrons} µm | Density: ${state.master.density} g/cm³ (${state.master.gsm} GSM)`;
  } else {
    materialDesc = `Paper / Board | ${state.master.paperGsm} GSM (Tester) | Caliper: ${state.master.paperThicknessMicrons} µm`;
  }

  // Generate Knife Setup Ruler Rows
  let currentStop = d.trimLeft;
  let knifeIndex = 1;
  let reelIndex = 1;
  let bladeRowsHtml = '';

  d.cutsMap.forEach(cut => {
    for (let i = 0; i < cut.count; i++) {
      const nextStop = currentStop + cut.width;
      const isTopShaft = (knifeIndex % 2 === 1);
      const shaftName = isTopShaft ? 'TOP REWIND SHAFT' : 'BOTTOM REWIND SHAFT';
      const singleRollKg = +(setMeters * (cut.width / 1000) * (state.master.gsm / 1000)).toFixed(2);
      const totalCutRolls = cut.count * totalSets;

      bladeRowsHtml += `
        <tr>
          <td style="text-align:center; font-weight:700;">#${knifeIndex}</td>
          <td style="text-align:center;">Reel #${reelIndex}</td>
          <td style="font-weight:700; font-family:var(--font-mono); font-size:9pt; color:#1F3C88;">
            ${currentStop.toFixed(1)} mm &rarr; ${nextStop.toFixed(1)} mm
          </td>
          <td style="text-align:center; font-weight:800; font-size:9.5pt; color:#1F3C88;">
            ${cut.width} mm
          </td>
          <td style="font-weight:600; text-align:center; ${isTopShaft ? 'background:#f0f4fc; color:#1F3C88;' : 'background:#f4fbf7; color:#0e6245;'}">
            ${shaftName}
          </td>
          <td style="text-align:center;">1 roll / cycle</td>
          <td style="text-align:center; font-weight:700;">${totalSets} rolls</td>
          <td style="text-align:right;">${singleRollKg} kg</td>
          <td style="text-align:center;">[ &nbsp; ]</td>
        </tr>
      `;

      currentStop = nextStop;
      knifeIndex++;
      reelIndex++;
    }
  });

  // Generate Packaging Manifest Rows
  let manifestRowsHtml = '';
  let grandTotalRolls = 0;

  d.cutsMap.forEach(cut => {
    const totalRolls = cut.count * totalSets;
    grandTotalRolls += totalRolls;
    const singleRollKg = +(setMeters * (cut.width / 1000) * (state.master.gsm / 1000)).toFixed(2);
    const diffSign = cut.diffKg >= 0 ? `+${cut.diffKg}` : `${cut.diffKg}`;

    manifestRowsHtml += `
      <tr>
        <td style="font-weight:800; font-size:9.5pt; color:#1F3C88;">${cut.width} mm</td>
        <td style="text-align:center; font-weight:700;">${cut.count} cuts</td>
        <td style="text-align:right;">${cut.targetKg} kg</td>
        <td style="text-align:right; font-weight:700;">${cut.producedKg} kg</td>
        <td style="text-align:right; font-size:8pt;">${diffSign} kg (${cut.pctDiff}%)</td>
        <td style="text-align:center; font-weight:800; color:#F36F21; font-size:9.5pt;">${totalRolls} Rolls</td>
        <td style="text-align:right;">${singleRollKg} kg / roll</td>
        <td style="text-align:center;">${coreDia}" Core &times; ${resultingOd}" OD</td>
      </tr>
    `;
  });

  sheet.innerHTML = `
    <!-- PRINT HEADER -->
    <div class="print-header-box">
      <div style="display:flex; align-items:center; gap:12px;">
        <img src="logo.png" alt="Progressive Enterprises" class="print-header-logo">
        <div>
          <div style="font-size:14pt; font-weight:800; color:#1F3C88; text-transform:uppercase; letter-spacing:-0.02em;">
            Progressive Enterprises
          </div>
          <div style="font-size:8pt; color:#555; font-weight:600;">
            Machine Operator Production Job Card &bull; Single-Setup Zero-Blade-Changeover Run
          </div>
        </div>
      </div>
      <div style="text-align:right; font-size:8pt; line-height:1.4;">
        <div><strong>Print Date:</strong> ${dateStr}</div>
        <div><strong>Shift:</strong> ______________</div>
        <div><strong>Machine No:</strong> SLIT-01</div>
      </div>
    </div>

    <!-- MANDATORY OPERATOR ACTION DIRECTIVE BOX -->
    <div class="print-directive-box">
      <div class="print-directive-heading">
        ⚡ MANDATORY OPERATOR ACTION: RUN ${totalSets} CYCLES OF EXACTLY ${setMeters.toLocaleString()} METERS EACH
      </div>
      <div class="print-directive-sub">
        Finished Roll Specification: <strong>${resultingOd}" OD</strong> on <strong>${coreDia}" Paper Tube Core</strong> &bull; 
        <strong>100% UNIFORM OD &bull; ZERO STUB / MIX-AND-MATCH ROLLS</strong> &bull; Lock all ${d.totalBlades} Blades ONCE!
      </div>
    </div>

    <!-- MASTER ROLL & JOB SPECIFICATIONS GRID -->
    <div class="print-meta-grid">
      <div><strong>Material Type:</strong> ${isPlastic ? 'Plastic Film' : 'Paper / Board'}</div>
      <div><strong>Substrate Specs:</strong> ${materialDesc}</div>
      <div><strong>Master Roll Width:</strong> ${state.master.widthMm} mm (±${state.master.parentTolMm}mm tol)</div>
      <div><strong>Tolerance Status:</strong> ${d.totalBlades > 12 ? (d.usedTolMm > 0 ? `+${d.usedTolMm}mm Active` : 'Active (>12 blades)') : 'Locked (<=12 blades)'}</div>
      <div><strong>Master Gross Weight:</strong> ${state.master.weightKg} kg</div>
      <div><strong>Total Linear Web:</strong> ${state.master.linearMeters.toLocaleString()} running meters</div>
      <div><strong>Finished Goods Yield:</strong> ${d.fgKg} kg (${((d.fgKg/state.master.weightKg)*100).toFixed(1)}%)</div>
      <div><strong>Edge Offcut Scrap:</strong> ${d.scrapKg} kg (${d.scrapPct}%) | L: ${d.trimLeft}mm, R: ${d.trimRight}mm</div>
      <div><strong>Slitter Speed:</strong> ${state.master.machineSpeed} m/min</div>
      <div><strong>Total Machine Rounds:</strong> ${totalSets} Uniform Cycles</div>
      <div><strong>Rewind Core:</strong> ${coreDia}" Paper Tube (${(coreDia * 25.4).toFixed(1)} mm ID)</div>
      <div><strong>Estimated Job Time:</strong> ${state.master.estTimeStr}</div>
    </div>

    <!-- KNIFE STOP SETUP RULER TABLE (OPERATOR GUIDE) -->
    <div class="print-section-title">
      <span>1. Machine Blade Setup Ruler (Lock Knives At mm Positions Across Shaft)</span>
      <span style="font-size:7.5pt; font-weight:600; color:#555;">Zero Changeover &bull; Total Knives: ${d.totalBlades} &bull; Web Span: ${d.cutsWidth} mm</span>
    </div>

    <table class="print-table">
      <thead>
        <tr>
          <th style="width:45px; text-align:center;">Knife #</th>
          <th style="width:55px; text-align:center;">Reel #</th>
          <th style="width:165px;">Position Stop Marks (mm)</th>
          <th style="width:75px; text-align:center;">Slit Width</th>
          <th style="width:170px; text-align:center;">Rewind Shaft Assignment</th>
          <th style="width:85px; text-align:center;">Rolls / Cycle</th>
          <th style="width:90px; text-align:center;">Total FG Reels</th>
          <th style="width:85px; text-align:right;">Single Reel Wt</th>
          <th style="width:50px; text-align:center;">Locked</th>
        </tr>
      </thead>
      <tbody>
        <!-- Left Trim Indicator -->
        <tr style="background:#fff3f3;">
          <td style="text-align:center; font-weight:700;">-</td>
          <td style="text-align:center;">Left Trim</td>
          <td style="font-family:var(--font-mono); font-size:8pt; color:#b91c1c;">0.0 mm &rarr; ${d.trimLeft.toFixed(1)} mm</td>
          <td style="text-align:center; color:#b91c1c; font-weight:700;">${d.trimLeft} mm</td>
          <td style="text-align:center; color:#777; font-size:7.5pt;">Edge Trim Blower / Suction</td>
          <td style="text-align:center;">-</td>
          <td style="text-align:center;">-</td>
          <td style="text-align:right; color:#b91c1c;">Scrap</td>
          <td style="text-align:center;">✓</td>
        </tr>
        ${bladeRowsHtml}
        <!-- Right Trim Indicator -->
        <tr style="background:#fff3f3;">
          <td style="text-align:center; font-weight:700;">-</td>
          <td style="text-align:center;">Right Trim</td>
          <td style="font-family:var(--font-mono); font-size:8pt; color:#b91c1c;">${(state.master.widthMm - d.trimRight).toFixed(1)} mm &rarr; ${state.master.widthMm.toFixed(1)} mm</td>
          <td style="text-align:center; color:#b91c1c; font-weight:700;">${d.trimRight} mm</td>
          <td style="text-align:center; color:#777; font-size:7.5pt;">Edge Trim Blower / Suction</td>
          <td style="text-align:center;">-</td>
          <td style="text-align:center;">-</td>
          <td style="text-align:right; color:#b91c1c;">Scrap</td>
          <td style="text-align:center;">✓</td>
        </tr>
      </tbody>
    </table>

    <!-- PACKAGING & DELIVERY MANIFEST -->
    <div class="print-section-title">
      <span>2. Finished Goods Packaging & Delivery Manifest</span>
      <span style="font-size:7.5pt; font-weight:600; color:#555;">Total Finished Reels: ${grandTotalRolls} &bull; Target OD: ${resultingOd}"</span>
    </div>

    <table class="print-table">
      <thead>
        <tr>
          <th>Slit Size</th>
          <th style="text-align:center;">Blades Locked</th>
          <th style="text-align:right;">Target Order Wt</th>
          <th style="text-align:right;">Produced FG Wt</th>
          <th style="text-align:right;">Variance (Δ)</th>
          <th style="text-align:center;">Total Rolls to Pack</th>
          <th style="text-align:right;">Single Roll Wt</th>
          <th style="text-align:center;">Packaging Spec</th>
        </tr>
      </thead>
      <tbody>
        ${manifestRowsHtml}
        <tr style="background:#f7f9fc; font-weight:700;">
          <td>TOTALS</td>
          <td style="text-align:center;">${d.totalBlades} Blades</td>
          <td style="text-align:right;">${state.orders.reduce((s,o)=>s+o.targetKg,0).toFixed(1)} kg</td>
          <td style="text-align:right; color:#1F3C88;">${d.fgKg} kg</td>
          <td style="text-align:right;">Yield: ${((d.fgKg/state.master.weightKg)*100).toFixed(1)}%</td>
          <td style="text-align:center; color:#F36F21; font-size:9.5pt;">${grandTotalRolls} Finished Reels</td>
          <td style="text-align:right;">Uniform OD</td>
          <td style="text-align:center;">100% Uniform ${resultingOd}" OD</td>
        </tr>
      </tbody>
    </table>

    <!-- OPERATOR PRE-RUN CHECKLIST & SIGN-OFFS -->
    <div style="display:grid; grid-template-columns: 1.3fr 1fr; gap:16px; margin-top:8px; page-break-inside:avoid;">
      <div style="border:1px solid #777; padding:6px 10px; background:#fafafa; font-size:8pt; border-radius:3px;">
        <div style="font-weight:700; color:#1F3C88; margin-bottom:4px; text-transform:uppercase;">
          Operator Pre-Run Quality Checklist
        </div>
        <div style="line-height:1.55;">
          <div>[ &nbsp; ] Master roll centered & web aligned with unwind edge-guide</div>
          <div>[ &nbsp; ] All ${d.totalBlades} bottom shear knives & top razor blades locked tight to ruler stops</div>
          <div>[ &nbsp; ] Core spacers placed on Top and Bottom shafts (alternating layout)</div>
          <div>[ &nbsp; ] Meter counter calibrated and reset to <strong>0000 m</strong></div>
          <div>[ &nbsp; ] Digital stop programmed to trip at <strong>${setMeters.toLocaleString()} m</strong> per cycle</div>
        </div>
      </div>

      <div style="display:flex; flex-direction:column; justify-content:space-between; font-size:8pt;">
        <div class="sign-line" style="margin-bottom:6px;">
          <strong>Machine Operator Signature:</strong> ______________________ (Emp ID: _______)
        </div>
        <div class="sign-line" style="margin-bottom:6px;">
          <strong>QA Inspector Roll OD Verification:</strong> ________________ (Measured OD: ____")
        </div>
        <div class="sign-line">
          <strong>Production Manager Final Sign-Off:</strong> ________________ (Date: ___________)
        </div>
      </div>
    </div>
  `;
}

// Load the user's specific sample order from prompt
function loadUserSample() {
  state.master.materialCategory = 'plastic';
  state.master.widthMm = 1020; // 1020 mm standard parent roll as stated by user
  state.master.parentTolMm = 2; // ±2 mm
  state.master.weightKg = 1000;
  state.master.thicknessMicrons = 23;
  state.master.density = 1.395;
  state.master.plasticType = 'polyester';
  state.master.minTrimLeft = 10;
  state.master.minTrimRight = 10;
  state.master.minSlitWidth = 12;
  state.master.coreDiaInch = 3;
  state.master.targetOdInch = 10;
  state.master.userCycleOverride = null;

  // The user's exact specification:
  // 50 kg of 15 mm, 80 kg of 20 mm, 100 kg of 18 mm, 60 kg of 120 mm
  state.orders = [
    { id: 1, width: 120, targetKg: 60 },
    { id: 2, width: 20,  targetKg: 80 },
    { id: 3, width: 18,  targetKg: 100 },
    { id: 4, width: 15,  targetKg: 50 },
    { id: 5, width: 25,  targetKg: 100 },
    { id: 6, width: 30,  targetKg: 100 }
  ];

  // Update UI toggles and form inputs
  const switchPlasticBtn = document.getElementById('switchPlasticBtn');
  const switchPaperBtn = document.getElementById('switchPaperBtn');
  const plasticSection = document.getElementById('plasticSpecificSection');
  const paperSection = document.getElementById('paperSpecificSection');

  if (switchPlasticBtn && switchPaperBtn) {
    switchPlasticBtn.classList.add('active');
    switchPaperBtn.classList.remove('active');
  }
  if (plasticSection) plasticSection.style.display = 'block';
  if (paperSection) paperSection.style.display = 'none';

  const plasticSelect = document.getElementById('plasticFilmSelect');
  if (plasticSelect) plasticSelect.value = 'polyester';

  const thickInput = document.getElementById('thicknessInput');
  if (thickInput) thickInput.value = 23;
  const densInput = document.getElementById('densityInput');
  if (densInput) densInput.value = 1.395;
  const widthInput = document.getElementById('masterWidthInput');
  if (widthInput) widthInput.value = 1020;
  const tolInput = document.getElementById('parentTolInput');
  if (tolInput) tolInput.value = 2;
  const weightInput = document.getElementById('masterWeightInput');
  if (weightInput) weightInput.value = 1000;
  const coreSelect = document.getElementById('coreDiaSelect');
  if (coreSelect) coreSelect.value = '3';
  const odInput = document.getElementById('targetOdInput');
  if (odInput) odInput.value = 10;

  renderOrdersTable();
  calculateMaterialSpecs();
  runOptimizer();
}
