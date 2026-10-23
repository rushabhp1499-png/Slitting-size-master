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
    filmName: 'Polyester', // free-text film type typed by the user
    thicknessMicrons: 23,
    density: 1.395, // g/cm3 for BOPET
    paperGsm: 70,
    paperThicknessMicrons: 91, // calibrated ~ 1.3 um per GSM (editable by user)
    gsm: 32.085,
    widthMm: 1020, // standard parent roll width (1020 mm)
    parentTolMm: 2, // ±2 mm allowable parent roll tolerance
    weightKg: 1000,
    // Fixed factory settings (not shown in the UI)
    minTrimLeft: 0,
    minTrimRight: 0,
    minSlitWidth: 6, // standard minimum slit width
    maxKnives: 50, // most knives the slitter shaft can hold
    weightTolerancePct: 15, // weight variance shown as OK vs High Var
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
 * Decides the maximum meters per cycle (finished roll length):
 * 1. Manual length, when the user ticked "Enter length manually"
 * 2. Factory standard for a listed thickness (scaled if OD/core differ from 10" on 3")
 * 3. Otherwise calculated from the target OD and core, calibrated against the factory standards
 * Returns { meters, source } where source is a short explanation shown under the value.
 */
function resolveRollMeters(thicknessMicrons, targetOdInch, coreDiaInch) {
  if (state.master.manualRollLength && state.master.manualRollMeters > 0) {
    return { meters: Math.round(state.master.manualRollMeters), source: 'Entered manually' };
  }
  if (!thicknessMicrons || thicknessMicrons <= 0) {
    return { meters: 1000, source: 'Enter a thickness to calculate' };
  }

  const baseAreaFactor = (10 * 10 - 3 * 3); // 91 sq. in (Standard reference for 10" OD / 3" Tube)
  const currentAreaFactor = (targetOdInch * targetOdInch - coreDiaInch * coreDiaInch);
  if (currentAreaFactor <= 0) {
    return { meters: 100, source: 'Target OD must be larger than the core' };
  }
  const isStandardRoll = targetOdInch === 10 && coreDiaInch === 3;

  const standard = EMPIRICAL_OD10_BENCHMARKS[thicknessMicrons];
  if (standard) {
    const meters = Math.round(standard * (currentAreaFactor / baseAreaFactor));
    return {
      meters,
      source: isStandardRoll
        ? `Factory standard for ${thicknessMicrons} µm`
        : `Factory standard for ${thicknessMicrons} µm, adjusted to ${targetOdInch}" OD on ${coreDiaInch}" core`
    };
  }

  // Calibrated constant ~ 37,200 um * m (from empirical measurements: 23um * 1600m = 36,800; 50um * 800m = 40,000)
  const baseConstant = 37200;
  const scaledConstant = baseConstant * (currentAreaFactor / baseAreaFactor);
  return {
    meters: Math.max(50, Math.round(scaledConstant / thicknessMicrons)),
    source: `Calculated for ${thicknessMicrons} µm at ${targetOdInch}" OD on ${coreDiaInch}" core`
  };
}

/**
 * Shows the meters-per-cycle value and where it came from (runs on every input, it's cheap)
 */
function updateRollMeterInfo() {
  const isPlastic = state.master.materialCategory === 'plastic';
  const thickness = isPlastic ? state.master.thicknessMicrons : state.master.paperThicknessMicrons;
  const { meters, source } = resolveRollMeters(thickness, state.master.targetOdInch, state.master.coreDiaInch);
  const valueEl = document.getElementById('computedRollMeterDisplay');
  if (valueEl) valueEl.innerText = `${meters.toLocaleString()} m`;
  const sourceEl = document.getElementById('rollMeterSource');
  if (sourceEl) sourceEl.innerText = source;
}

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
      markResultsStale();
    });

    switchPaperBtn.addEventListener('click', () => {
      switchPaperBtn.classList.add('active');
      switchPlasticBtn.classList.remove('active');
      state.master.materialCategory = 'paper';
      if (plasticSection) plasticSection.style.display = 'none';
      if (paperSection) paperSection.style.display = 'block';
      state.master.userCycleOverride = null;
      markResultsStale();
    });
  }

  // Film type is a free-text label (only shown on the job card, so no recalculation needed)
  const filmTypeInput = document.getElementById('filmTypeInput');
  if (filmTypeInput) {
    filmTypeInput.addEventListener('input', () => {
      state.master.filmName = filmTypeInput.value.trim() || 'Polyester';
      renderPrintJobCard();
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
      markResultsStale();
    });
  }
  if (paperThicknessInput) {
    paperThicknessInput.addEventListener('input', () => {
      state.master.paperThicknessMicrons = parseFloat(paperThicknessInput.value) || 90;
      state.master.userCycleOverride = null;
      markResultsStale();
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
    'machineSpeedInput', 'setupTimeInput', 'targetOdInput'
  ];

  masterInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        readMasterInputs();
        state.master.userCycleOverride = null;
        markResultsStale();
      });
    }
  });

  // Core Diameter select listener
  const coreSelect = document.getElementById('coreDiaSelect');
  if (coreSelect) {
    coreSelect.addEventListener('change', (e) => {
      state.master.coreDiaInch = parseFloat(e.target.value) || 3;
      state.master.userCycleOverride = null;
      markResultsStale();
    });
  }

  // Manual roll length: when ticked it replaces the factory standard / calculated meters
  const manualCheck = document.getElementById('manualRollLengthCheck');
  const manualInput = document.getElementById('manualRollLengthInput');
  if (manualCheck && manualInput) {
    const applyManual = () => {
      manualInput.disabled = !manualCheck.checked;
      state.master.manualRollLength = manualCheck.checked;
      state.master.manualRollMeters = parseFloat(manualInput.value) || 0;
      state.master.userCycleOverride = null;
      updateRollMeterInfo();
      markResultsStale();
    };
    manualCheck.addEventListener('change', () => {
      applyManual();
      if (manualCheck.checked) manualInput.select();
    });
    manualInput.addEventListener('input', applyManual);
  }

  // Keep the meters-per-roll readout live while thickness / OD / core are edited
  document.addEventListener('input', updateRollMeterInfo);
  document.addEventListener('change', updateRollMeterInfo);

  // Add cut row
  document.getElementById('addCutBtn').addEventListener('click', () => {
    const nextId = state.orders.length ? Math.max(...state.orders.map(o => o.id)) + 1 : 1;
    state.orders.push({ id: nextId, width: 25, targetKg: 50 });
    renderOrdersTable();
    markResultsStale();
    // Jump straight into the new row's width box
    const inputs = document.querySelectorAll('#ordersTableBody .row-input[data-field="width"]');
    if (inputs.length) inputs[inputs.length - 1].select();
  });

  // Calculate button + Ctrl/Cmd+Enter shortcut anywhere on the page
  document.getElementById('calculateBtn').addEventListener('click', calculateNow);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      calculateNow();
    }
  });

  // Paste-a-list panel
  const pastePanel = document.getElementById('pasteListPanel');
  const pasteText = document.getElementById('pasteListText');
  document.getElementById('pasteListBtn').addEventListener('click', () => {
    const open = pastePanel.style.display === 'none';
    pastePanel.style.display = open ? 'block' : 'none';
    if (open) pasteText.focus();
  });
  document.getElementById('pasteListCancelBtn').addEventListener('click', () => {
    pastePanel.style.display = 'none';
  });
  document.getElementById('pasteListApplyBtn').addEventListener('click', () => {
    if (loadOrdersFromText(pasteText.value)) {
      pasteText.value = '';
      pastePanel.style.display = 'none';
      calculateNow();
    }
  });

  // Print button
  document.getElementById('printJobCardBtn').addEventListener('click', () => {
    if (state.resultsStale) calculateNow();
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
  state.master.maxRollMeters = resolveRollMeters(
    activeThicknessMicrons,
    state.master.targetOdInch,
    state.master.coreDiaInch
  ).meters;

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
  updateRollMeterInfo();

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

  state.orders.forEach((order, index) => {
    const isBelowMin = order.width < state.master.minSlitWidth;

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
  // Typing only updates state + totals (no table rebuild, no optimizer run) so focus stays put
  tbody.querySelectorAll('.row-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const id = parseInt(e.target.dataset.id);
      const field = e.target.dataset.field;
      const order = state.orders.find(o => o.id === id);
      if (order) {
        order[field] = parseFloat(e.target.value) || 0;
        updateOrdersSummary();
        markResultsStale();
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        calculateNow();
      }
    });
    // Pasting several lines (e.g. two columns copied from Excel) loads the whole list
    input.addEventListener('paste', (e) => {
      const text = (e.clipboardData || window.clipboardData).getData('text');
      if (/[\r\n]/.test(text.trim())) {
        e.preventDefault();
        if (loadOrdersFromText(text)) calculateNow();
      }
    });
  });

  tbody.querySelectorAll('.btn-del-row').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id);
      state.orders = state.orders.filter(o => o.id !== id);
      renderOrdersTable();
      markResultsStale();
    });
  });

  updateOrdersSummary();
}

/**
 * Refreshes the total kg, per-row feasibility badges and the min-width alert in place
 */
function updateOrdersSummary() {
  const totalTargetKg = state.orders.reduce((s, o) => s + (o.targetKg || 0), 0);
  const hasMechanicalViolation = state.orders.some(o => o.width < state.master.minSlitWidth);

  const totalTargetEl = document.getElementById('totalTargetKgDisplay');
  if (totalTargetEl) {
    totalTargetEl.innerText = `${totalTargetKg.toFixed(1)} kg`;
  }

  document.querySelectorAll('#ordersTableBody tr').forEach((tr, i) => {
    const order = state.orders[i];
    const cell = tr.children[3];
    if (!order || !cell) return;
    cell.innerHTML = order.width < state.master.minSlitWidth
      ? `<span class="badge badge-danger">⚠️ &lt; ${state.master.minSlitWidth}mm (Impossible)</span>`
      : `<span class="badge badge-success">✓ Feasible</span>`;
  });

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
 * Inputs changed: dim the results until the user presses Calculate
 */
function markResultsStale() {
  state.resultsStale = true;
  document.body.classList.add('results-stale');
  const btn = document.getElementById('calculateBtn');
  if (btn) btn.innerText = '⚡ Calculate (inputs changed)';
}

/**
 * Runs the full calculation once, on demand (Calculate button / Enter / paste)
 */
function calculateNow() {
  const errorEl = document.getElementById('calcErrorBanner');
  try {
    calculateMaterialSpecs();
    updateOrdersSummary();
    runOptimizer();
    if (errorEl) errorEl.style.display = 'none';
  } catch (err) {
    console.error(err);
    if (errorEl) {
      errorEl.style.display = 'flex';
      errorEl.innerHTML = `<div><strong>Could not calculate:</strong> please check the sizes and roll specs for empty or zero values, then press Calculate again.</div>`;
    }
  }
  state.resultsStale = false;
  document.body.classList.remove('results-stale');
  const btn = document.getElementById('calculateBtn');
  if (btn) btn.innerText = '⚡ Calculate';
}

/**
 * Replaces the size list with rows parsed from pasted text.
 * One size per line: width (mm) then target weight (kg), separated by tab, comma or space.
 * Lines without two numbers (headers, blanks) are skipped.
 */
function loadOrdersFromText(text) {
  const rows = [];
  text.split(/\r?\n/).forEach(line => {
    const nums = (line.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    if (nums.length >= 2 && nums[0] > 0 && rows.length < 200) {
      rows.push({ id: rows.length + 1, width: nums[0], targetKg: nums[1] });
    }
  });

  if (rows.length === 0) {
    alert('No sizes found. Paste one size per line: width in mm, then weight in kg (for example: 120  60).');
    return false;
  }

  state.orders = rows;
  renderOrdersTable();
  return true;
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

  // Target weights and sizes (rows with the same width are merged: they share the same knives)
  const items = [];
  state.orders.forEach(o => {
    const existing = items.find(it => it.width === o.width);
    if (existing) existing.targetKg += o.targetKg;
    else items.push({ id: o.id, width: o.width, targetKg: o.targetKg });
  });

  const candidates = [];
  const maxTolMm = state.master.parentTolMm || 2;
  const maxSearchWidth = usableWidth + maxTolMm;
  const minCuts = (minSum <= usableWidth) ? 1 : 0;
  const maxKnives = state.master.maxKnives || 50;
  let bladeLimitRejects = 0;

  function evaluateCandidate(bladeCounts, cutsWidth) {
    const totalBlades = Object.values(bladeCounts).reduce((a, b) => a + b, 0);
    if (totalBlades > maxKnives) { // Machine shaft cannot hold more knives
      bladeLimitRejects++;
      return null;
    }
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

    const candidate = {
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
    };
    candidates.push(candidate);
    return candidate;
  }

  function widthOf(bladeCounts) {
    return items.reduce((sum, it) => sum + (bladeCounts[it.width] || 0) * it.width, 0);
  }

  // Dynamic-programming search over total cut width in 0.1 mm steps.
  // For every reachable total width it keeps the blade allocation with the smallest summed
  // % weight deviation (+ an optional per-knife penalty). Work grows linearly with the number
  // of sizes (the old recursive search grew exponentially and froze the browser beyond ~8 sizes).
  const SCALE = 10;
  const cap = Math.floor(maxSearchWidth * SCALE + 1e-6);

  function runWidthDp(perKnifePenalty) {
    let best = new Float64Array(cap + 1).fill(Infinity);
    best[0] = 0;
    const picks = []; // picks[i][w] = cuts of item i on the best path reaching width w

    items.forEach(it => {
      const unit = Math.round(it.width * SCALE);
      const maxCuts = Math.min(maxKnives, Math.floor(cap / unit));
      const devByCuts = new Float64Array(maxCuts + 1);
      for (let c = 0; c <= maxCuts; c++) {
        const producedKg = masterWeight * ((c * it.width) / masterWidth);
        devByCuts[c] = (it.targetKg > 0 ? (Math.abs(producedKg - it.targetKg) / it.targetKg) * 100 : 0)
          + perKnifePenalty * c;
      }

      const next = new Float64Array(cap + 1).fill(Infinity);
      const pick = new Uint16Array(cap + 1);
      for (let w = 0; w <= cap; w++) {
        const base = best[w];
        if (base === Infinity) continue;
        for (let c = minCuts, nw = w + minCuts * unit; c <= maxCuts && nw <= cap; c++, nw += unit) {
          const v = base + devByCuts[c];
          if (v < next[nw]) { next[nw] = v; pick[nw] = c; }
        }
      }
      picks.push({ pick, unit });
      best = next;
    });

    // One candidate per reachable total width (at most ~10,000), each with its best kg match
    for (let w = 1; w <= cap; w++) {
      if (best[w] === Infinity) continue;
      const counts = {};
      let rem = w;
      for (let i = items.length - 1; i >= 0; i--) {
        const c = picks[i].pick[rem];
        counts[items[i].width] = c;
        rem -= c * picks[i].unit;
      }
      evaluateCandidate(counts, widthOf(counts));
    }
  }

  runWidthDp(0);
  // Some widths needed more knives than the shaft holds: re-run with a growing per-knife
  // penalty so the search also offers layouts within the knife limit for those widths.
  for (const penalty of [0.5, 2, 8, 32]) {
    if (bladeLimitRejects === 0) break;
    bladeLimitRejects = 0;
    runWidthDp(penalty);
  }

  // Local polish: the DP ignores the max-deviation term of the scores, so nudge the best
  // recipe for each score by +/-1 blade (or moving a blade between sizes) while it improves.
  function polish(start, scoreKey) {
    let current = start;
    for (let round = 0; round < 100; round++) {
      let improved = null;
      const tryCounts = counts => {
        if (items.some(it => (counts[it.width] || 0) < minCuts)) return;
        const w = widthOf(counts);
        if (w <= 0 || w > maxSearchWidth) return;
        const before = candidates.length;
        const cand = evaluateCandidate(counts, w);
        if (candidates.length > before) candidates.pop(); // only keep winners
        if (cand && cand[scoreKey] < (improved || current)[scoreKey] - 1e-9) improved = cand;
      };
      items.forEach((a, i) => {
        [-1, 1].forEach(d => tryCounts({ ...current.bladeCounts, [a.width]: (current.bladeCounts[a.width] || 0) + d }));
        items.forEach((b, j) => {
          if (i === j) return;
          tryCounts({ ...current.bladeCounts,
            [a.width]: (current.bladeCounts[a.width] || 0) + 1,
            [b.width]: (current.bladeCounts[b.width] || 0) - 1 });
        });
      });
      if (!improved) break;
      current = improved;
    }
    if (current !== start) candidates.push(current);
  }

  if (candidates.length > 0) {
    ['scoreBalanced', 'scoreMinScrap', 'scoreExactKg'].forEach(key => {
      const top = candidates.reduce((a, b) => (b[key] < a[key] ? b : a));
      polish(top, key);
    });
  }

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

  if (candidates.length === 0) {
    if (feasibilityBanner) {
      feasibilityBanner.style.display = 'flex';
      feasibilityBanner.className = 'alert alert-danger';
      feasibilityBanner.innerHTML = `<div><strong>No single-setup layout found:</strong> these sizes cannot be cut from one roll within ${maxKnives} knives and the usable width (${usableWidth} mm). Remove some sizes or split the order into two setups.</div>`;
    }
    state.solutions = [];
    state.selectedSolution = null;
    renderAll();
    return;
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
  const maxKnives = state.master.maxKnives || 50;
  const bladesNow = Object.values(state.customBlades).reduce((a, b) => a + b, 0);
  if (delta > 0 && bladesNow >= maxKnives) {
    alert(`The machine holds at most ${maxKnives} knives. Remove a knife from another size first.`);
    return;
  }
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
    const pName = `${state.master.filmName || 'Polyester'} Film`;
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
