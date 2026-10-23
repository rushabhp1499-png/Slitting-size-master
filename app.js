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
    // Minimum edge trim, always taken on one side: 6 mm above 150 µm, else 8 mm (set in calculateMaterialSpecs)
    minTrimLeft: 0,
    minTrimRight: 8,
    minSlitWidth: 6, // standard minimum slit width
    maxKnives: 50, // most knives the slitter shaft can hold
    weightTolerancePct: 15, // weight variance shown as OK vs High Var
    machineSpeed: 400,
    setupMinutes: 20,
    rollChangeMinutes: 5, // minutes per roll set changeover
    // Finished Roll OD & Core Tube Specs
    coreDiaInch: 3, // 3" standard paper tube core
    targetOdInch: 10, // 10" max outside diameter
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
  jobCard: { machineNo: '', operatorName: '' }, // printed on the job card
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

/*
 * Roll geometry: OD <-> meters per roll. Wound area grows with length × thickness, so
 *   meters = K(t) / t × (OD² − core²) / (10² − 3²)
 * where K(t) = thickness × meters for a 10" OD on a 3" core. For a listed thickness K comes
 * from the factory standard (23 µm → 1600 m), otherwise ~37,200 (calibrated across the list).
 */
const STANDARD_ROLL_AREA = 10 * 10 - 3 * 3; // 91 sq. in: 10" OD on 3" core

function rollConstant(thicknessMicrons) {
  const standard = EMPIRICAL_OD10_BENCHMARKS[thicknessMicrons];
  return standard ? standard * thicknessMicrons : 37200;
}

function activeThicknessMicrons() {
  return state.master.materialCategory === 'plastic'
    ? state.master.thicknessMicrons
    : (state.master.paperThicknessMicrons || Math.round(state.master.gsm * 1.3));
}

function metersForOd(odInch, coreInch, thicknessMicrons) {
  const area = odInch * odInch - coreInch * coreInch;
  if (area <= 0 || !thicknessMicrons) return 0;
  return (rollConstant(thicknessMicrons) / thicknessMicrons) * (area / STANDARD_ROLL_AREA);
}

function odForMeters(meters, coreInch, thicknessMicrons) {
  if (!thicknessMicrons) return coreInch;
  return Math.sqrt(coreInch * coreInch + (meters * thicknessMicrons * STANDARD_ROLL_AREA) / rollConstant(thicknessMicrons));
}

/**
 * Writes the current core / OD / length / rounds into their boxes,
 * except the box the user is typing in (so their typing isn't overwritten).
 */
function syncRollFields(skipId) {
  const values = {
    coreDiaSelect: String(state.master.coreDiaInch),
    targetOdInput: state.master.resultingOdInch,
    rollLengthInput: state.master.uniformCycleMeters,
    roundsInput: state.master.uniformCyclesCount
  };
  Object.entries(values).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el && id !== skipId) el.value = value;
  });
}

/**
 * Live update after the user changes one of core / OD / length / rounds.
 * Rounds don't change the knife layout, so this redraws without a new Calculate.
 */
function applyRollChange(editedId) {
  calculateMaterialSpecs();
  syncRollFields(editedId);
  renderAll();
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
  syncRollFields();
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

  // Job card details: printed as typed (no recalculation needed)
  [['machineNoInput', 'machineNo'], ['operatorNameInput', 'operatorName']].forEach(([id, key]) => {
    const el = document.getElementById(id);
    el?.addEventListener('input', () => {
      state.jobCard[key] = el.value.trim();
      renderPrintJobCard();
    });
  });

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

  // Numeric inputs listener
  const masterInputs = [
    'thicknessInput', 'densityInput',
    'masterWidthInput', 'parentTolInput', 'masterWeightInput',
    'machineSpeedInput', 'setupTimeInput'
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

  // ── Core / OD / Length / Rounds: four linked boxes, all live ──
  // Rounds is the source of truth: length = total web ÷ rounds, OD follows from length.
  const coreSelect = document.getElementById('coreDiaSelect');
  const odInput = document.getElementById('targetOdInput');
  const lengthInput = document.getElementById('rollLengthInput');
  const roundsInput = document.getElementById('roundsInput');

  // Core or OD changed: fit as much length as the OD allows -> rounds -> uniform length
  coreSelect?.addEventListener('change', () => {
    state.master.coreDiaInch = parseFloat(coreSelect.value) || 3;
    state.master.userCycleOverride = null;
    applyRollChange('coreDiaSelect');
  });
  odInput?.addEventListener('input', () => {
    const od = parseFloat(odInput.value);
    if (!(od > state.master.coreDiaInch)) return; // wait for a usable value
    state.master.targetOdInch = od;
    state.master.userCycleOverride = null;
    applyRollChange('targetOdInput');
  });

  // Length changed: nearest whole number of rounds -> OD follows
  lengthInput?.addEventListener('input', () => {
    const meters = parseFloat(lengthInput.value);
    if (!(meters > 0)) return;
    state.master.userCycleOverride = Math.max(1, Math.round(state.master.linearMeters / meters));
    applyRollChange('rollLengthInput');
    state.master.targetOdInch = state.master.resultingOdInch;
  });

  // Rounds changed: length and OD follow
  roundsInput?.addEventListener('input', () => {
    const rounds = parseInt(roundsInput.value, 10);
    if (!(rounds >= 1)) return;
    state.master.userCycleOverride = rounds;
    applyRollChange('roundsInput');
    state.master.targetOdInch = state.master.resultingOdInch;
  });

  // Leaving a box tidies it to the actual value (e.g. uniform length, achievable OD)
  [odInput, lengthInput, roundsInput].forEach(el => el?.addEventListener('change', () => syncRollFields()));

  // Material / weight / width edits change the total web length, so refresh the roll boxes live
  document.addEventListener('input', (e) => {
    const id = e.target.id;
    if (['targetOdInput', 'rollLengthInput', 'roundsInput'].includes(id) || e.target.classList.contains('row-input')) return;
    calculateMaterialSpecs();
    syncRollFields();
  });

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

  // Thick material (> 150 µm) can be trimmed down to 6 mm; thinner material needs at least 8 mm.
  // All trim is on one side, so it is applied to the right edge only.
  state.master.minTrimLeft = 0;
  state.master.minTrimRight = activeThicknessMicrons > 150 ? 6 : 8;

  const gsmBadge = document.getElementById('computedGsmBadge');
  if (gsmBadge) gsmBadge.innerText = `${state.master.gsm} GSM (${isPlastic ? 'Film' : 'Paper'})`;

  // Total Master Linear Web length: L = (Weight in kg * 1,000,000) / (GSM * Width in mm)
  const masterWidthM = state.master.widthMm / 1000;
  const areaM2 = (state.master.weightKg * 1000) / state.master.gsm;
  state.master.linearMeters = Math.round(areaM2 / masterWidthM);

  const lengthEl = document.getElementById('kpiLinearMeters');
  if (lengthEl) lengthEl.innerText = `${state.master.linearMeters.toLocaleString()} m`;

  // Most meters one roll can hold at the target OD on this core
  state.master.maxRollMeters = Math.max(1,
    metersForOd(state.master.targetOdInch, state.master.coreDiaInch, activeThicknessMicrons));

  // UNIFORM CYCLES / ROUNDS (zero odd stub rolls): user-set rounds, or the fewest that fit the OD
  let cyclesCount;
  if (state.master.userCycleOverride && state.master.userCycleOverride > 0) {
    cyclesCount = state.master.userCycleOverride;
  } else {
    cyclesCount = Math.max(1, Math.ceil(state.master.linearMeters / state.master.maxRollMeters));
  }
  state.master.uniformCyclesCount = cyclesCount;

  // EXACT Uniform meters per cycle:
  state.master.uniformCycleMeters = Math.round(state.master.linearMeters / cyclesCount);

  // Actual finished OD of those rolls
  state.master.resultingOdInch = +odForMeters(
    state.master.uniformCycleMeters, state.master.coreDiaInch, activeThicknessMicrons).toFixed(1);

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
      <td class="order-num">
        <span class="order-swatch" style="background:${getColorForWidth(order.width)};"></span>${index + 1}
      </td>
      <td>
        <input type="number" step="0.5" min="1" value="${order.width}" data-field="width" data-id="${order.id}" class="row-input" aria-label="Cut width ${index + 1} in mm">
      </td>
      <td>
        <input type="number" step="1" min="1" value="${order.targetKg}" data-field="targetKg" data-id="${order.id}" class="row-input" aria-label="Target weight ${index + 1} in kg">
      </td>
      <td class="order-status">${feasibilityIcon(order)}</td>
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
 * Compact per-row status: a tick, or a warning when the cut is below the minimum slit width
 */
function feasibilityIcon(order) {
  return order.width < state.master.minSlitWidth
    ? `<span class="status-bad" title="Below ${state.master.minSlitWidth} mm minimum slit width">⚠</span>`
    : `<span class="status-ok" title="Feasible">✓</span>`;
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
    cell.innerHTML = feasibilityIcon(order);
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
    syncRollFields();
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

    // Score 2 (Min Scrap): factory priority. Least trim always wins (a 0.01% scrap difference
    // outweighs any weight difference); weight accuracy only breaks ties between equal trims.
    const scoreMinScrap = (scrapPct * 100000) + meanPctDiff + (maxPctDiff * 0.1);

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
      // All trim goes on one side (never split), so knives start at 0 mm
      trimLeft: 0,
      trimRight: +trimWidth.toFixed(1),
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

  // Pick 3 distinct recipes. Factory priority: minimum wastage first.
  const sameBlades = (a, b) => JSON.stringify(a?.bladeCounts) === JSON.stringify(b?.bladeCounts);

  // 1. Minimum Wastage (the true best, never displaced by another recipe)
  const minScrapList = [...candidates].sort((a, b) => a.scoreMinScrap - b.scoreMinScrap);
  const bestMinScrap = minScrapList[0];

  // 2. Balanced trade-off between wastage and kg accuracy
  const balancedList = [...candidates].sort((a, b) => a.scoreBalanced - b.scoreBalanced);
  const bestBalanced = balancedList.find(c => !sameBlades(c, bestMinScrap)) || balancedList[0];

  // 3. Closest to the requested kg
  const exactKgList = [...candidates].sort((a, b) => a.scoreExactKg - b.scoreExactKg);
  const bestExactKg = exactKgList.find(c => !sameBlades(c, bestMinScrap) && !sameBlades(c, bestBalanced)) || exactKgList[0];

  state.solutions = [
    { type: 'minscrap', title: 'Recipe A: Minimum Wastage (Recommended)', badge: 'Lowest Trim', data: bestMinScrap },
    { type: 'balanced', title: 'Recipe B: Balanced', badge: 'Trade-Off', data: bestBalanced },
    { type: 'exactkg',  title: 'Recipe C: Closest to Ordered Kg', badge: 'Closest Kg', data: bestExactKg }
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
  const trimLeft = 0; // all trim on one side
  const trimRight = +trimWidth.toFixed(1);

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
  document.getElementById('kpiScrapSub').innerText = `Trim: ${d.trimWidth.toFixed(1)} mm (one side)`;

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
      <span class="recipe-badge ${sol.type === 'minscrap' ? 'badge-champion' : ''}">${sol.badge}</span>
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
  // Includes the parent-roll tolerance when used, so the strips always add up to 100%
  const rollWidth = d.effectiveRollWidth || masterWidth;

  // Operator view: each strip shows only its size in mm. The diagram always fits the panel
  // width (never scrolls); fitSegmentLabels() picks horizontal or vertical text per strip.
  function addSegment(widthMm, label, extraClass, color) {
    const pct = (widthMm / rollWidth) * 100;
    const seg = document.createElement('div');
    seg.className = `roll-segment ${extraClass}`;
    seg.style.width = `${pct}%`;
    if (color) seg.style.backgroundColor = color;
    seg.title = label;
    seg.innerHTML = `<span class="seg-label">${label}</span>`;
    schematic.appendChild(seg);
  }

  if (d.trimLeft > 0) addSegment(d.trimLeft, `Trim ${d.trimLeft} mm`, 'segment-trim');

  d.cutsMap.forEach(cut => {
    for (let i = 0; i < cut.count; i++) {
      addSegment(cut.width, `${cut.width} mm`, '', getColorForWidth(cut.width));
    }
  });

  if (d.trimRight > 0) addSegment(d.trimRight, `Trim ${d.trimRight} mm`, 'segment-trim');

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

  fitSegmentLabels();
}

/**
 * Makes every strip label fit its strip: large horizontal text when there is room,
 * otherwise vertical text shrunk to the strip width (down to a 7px floor for very thin cuts).
 */
function fitSegmentLabels() {
  document.querySelectorAll('#rollSchematic .roll-segment').forEach(seg => {
    const label = seg.querySelector('.seg-label');
    const w = seg.getBoundingClientRect().width;
    if (!label || w === 0) return; // not laid out (hidden)
    label.classList.remove('seg-label-vertical');
    label.style.fontSize = '';
    if (label.getBoundingClientRect().width <= w - 6) return; // horizontal fits

    label.classList.add('seg-label-vertical');
    // Vertical text with line-height 1 is about as wide as its font size
    label.style.fontSize = `${Math.max(7, Math.min(15, Math.floor(w - 2)))}px`;
  });
}

// Re-fit labels when the window size changes (strip widths change with it)
let fitLabelsTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(fitLabelsTimer);
  fitLabelsTimer = setTimeout(fitSegmentLabels, 100);
});

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
  const rollWidth = d.effectiveRollWidth || state.master.widthMm;

  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const material = isPlastic
    ? `${escapeHtml(state.master.filmName || 'Polyester')} Film, ${state.master.thicknessMicrons} µm`
    : `Paper / Board, ${state.master.paperThicknessMicrons} µm`;

  // A filled value, or a blank line to write on by hand
  const fillIn = (value) => value ? `<strong>${escapeHtml(value)}</strong>` : '<span class="jc-blank"></span>';

  // ── Cross-section: strips sized for the landscape A4 width (281 mm printable) ──
  const PRINT_WIDTH_PT = 281 * 2.835; // mm -> pt
  const strips = [];
  d.cutsMap.forEach(cut => {
    for (let i = 0; i < cut.count; i++) strips.push({ width: cut.width, label: `${cut.width}`, trim: false });
  });
  if (d.trimRight > 0) strips.push({ width: d.trimRight, label: `${d.trimRight}`, trim: true });

  const stripsHtml = strips.map(s => {
    const stripPt = (s.width / rollWidth) * PRINT_WIDTH_PT;
    // Horizontal 13pt bold needs about 0.62em per character + padding; otherwise write it vertically
    const fitsFlat = stripPt - 6 >= s.label.length * 0.62 * 13;
    const fontPt = fitsFlat ? 13 : Math.max(5, Math.min(12, stripPt - 1.5));
    // A thin trim is just hatching (its width is printed in the specs row)
    const label = s.trim && stripPt < 9 ? ''
      : `<span class="${fitsFlat ? '' : 'jc-vertical'}" style="font-size:${fontPt.toFixed(1)}pt">${s.label}</span>`;
    return `<div class="jc-strip${s.trim ? ' jc-trim' : ''}" style="width:${(s.width / rollWidth) * 100}%">${label}</div>`;
  }).join('');

  // ── Size table (no packaging spec column) ──
  let grandTotalRolls = 0;
  const rowsHtml = d.cutsMap.filter(c => c.count > 0).map(cut => {
    const totalRolls = cut.count * totalSets;
    grandTotalRolls += totalRolls;
    const kgPerRoll = +(setMeters * (cut.width / 1000) * (state.master.gsm / 1000)).toFixed(2);
    const diff = cut.diffKg >= 0 ? `+${cut.diffKg}` : `${cut.diffKg}`;
    return `
      <tr>
        <td class="jc-size">${cut.width} mm</td>
        <td class="num">${cut.count}</td>
        <td class="num">${cut.targetKg}</td>
        <td class="num">${cut.producedKg}</td>
        <td class="num">${diff}</td>
        <td class="num"><strong>${totalRolls}</strong></td>
        <td class="num">${kgPerRoll}</td>
      </tr>`;
  }).join('');

  sheet.innerHTML = `
    <div class="jc-header">
      <img src="logo.png" alt="Progressive Enterprises" class="jc-logo">
      <div class="jc-title">Job Card</div>
      <div class="jc-date">Date: <strong>${dateStr}</strong></div>
    </div>

    <div class="jc-details">
      <div>Machine No: ${fillIn(state.jobCard.machineNo)}</div>
      <div>Operator: ${fillIn(state.jobCard.operatorName)}</div>
      <div>Start Time: <span class="jc-blank short"></span></div>
      <div>End Time: <span class="jc-blank short"></span></div>
    </div>

    <div class="jc-specs">
      <div><span>Material</span><strong>${material}</strong></div>
      <div><span>Master Roll</span><strong>${state.master.widthMm} mm &times; ${state.master.weightKg} kg</strong></div>
      <div><span>Core / OD</span><strong>${coreDia}" / ${resultingOd}"</strong></div>
      <div><span>Length per Roll</span><strong>${setMeters.toLocaleString()} m</strong></div>
      <div><span>Rounds</span><strong>${totalSets}</strong></div>
      <div><span>Knives</span><strong>${d.totalBlades}</strong></div>
      <div><span>Trim (one side)</span><strong>${d.trimWidth.toFixed(1)} mm</strong></div>
    </div>

    <div class="jc-section-title">Master Roll Cross-Section <span>(sizes in mm, left to right; hatched = trim)</span></div>
    <div class="jc-roll">${stripsHtml}</div>
    <div class="jc-ruler">
      <span>0</span><span>${Math.round(rollWidth / 2)} mm</span><span>${rollWidth} mm</span>
    </div>

    <table class="jc-table">
      <thead>
        <tr>
          <th>Slit Size</th>
          <th class="num">Knives</th>
          <th class="num">Ordered (kg)</th>
          <th class="num">Produced (kg)</th>
          <th class="num">Difference (kg)</th>
          <th class="num">Total Rolls</th>
          <th class="num">Kg per Roll</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        <tr class="jc-total">
          <td>Total</td>
          <td class="num">${d.totalBlades}</td>
          <td class="num">${state.orders.reduce((s, o) => s + o.targetKg, 0).toFixed(1)}</td>
          <td class="num">${d.fgKg}</td>
          <td class="num"></td>
          <td class="num">${grandTotalRolls}</td>
          <td class="num"></td>
        </tr>
      </tbody>
    </table>

    <div class="jc-signoff">
      <div>Operator Signature</div>
      <div>Production Manager Approval</div>
    </div>
  `;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
