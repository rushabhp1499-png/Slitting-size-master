# SlitSmart Factory OS | Progressive Enterprises
### Industrial Slitting Optimizer & Single-Setup Production Management System

SlitSmart Factory OS is a precision web-based converting and slitting management application developed for **Progressive Enterprises**. It optimizes job-work slitting operations for paper and plastic films (polyester BOPET, BOPP, CPP, PVC) from jumbo parent rolls down to customer-specified cut widths and weights.

---

## 🎯 Core Engineering & Factory Features

### 1. Single-Setup Zero-Blade-Changeover Optimization
- Solves the knapsack/cutting-stock problem by calculating integer blade allocations $(n_1, n_2, \dots, n_k)$ locked across the parent roll once.
- Mass distribution is strictly proportional to $n_i \cdot w_i$, preventing mid-job machine shutdowns and knife resets.
- Multi-recipe selector: **Balanced (Champion)**, **Maximum Web Yield**, and **Customer Weight Accuracy**.

### 2. Material Classification Switch
- **🎞️ Plastic / Film Mode:** Calculates roll dynamics using thickness in microns ($\mu\text{m}$) and substrate density ($\text{g/cm}^3$, default 1.395 for BOPET).
  $$\text{GSM} = \text{Thickness in } \mu\text{m} \times \text{Density in g/cm}^3$$
- **📄 Paper / Board Mode:** Direct input for **GSM** (from factory GSM tester) and **Paper Caliper / Thickness ($\mu\text{m}$)**.

### 3. 100% Uniform Roll OD & Zero-Stub-Rolls Engine
- Eliminates uneven mix-and-match rolls and leftover stub rolls (e.g. 10 sets of 350m + odd 50m waste).
- Calculates the maximum linear web length for the target finished roll diameter (default 10" OD on 3" paper tube core).
- Divides the total master web length **evenly into $N$ identical cycles**:
  $$\text{Uniform Cycle Length} = \text{round}\left(\frac{\text{Total Master Linear Length}}{N}\right)$$
- Displays a mandatory operator mandate: **"RUN $N$ CYCLES OF EXACTLY $L$ METERS EACH"** with `-1` and `+1` round adjustment controls.

### 4. Parent Roll Width Tolerance Rule ($\pm 2\text{ mm}$)
- Nominal standard parent roll width: **$1020\text{ mm}$** with $\pm 2\text{ mm}$ tolerance.
- **Strict Guardrail:** Tolerance is locked when machine blades $\le 12$. Active only when blade count $> 12$, allowing micro-adjustments to absorb cuts against tolerance.

### 5. High-Density, Anti-Clipping Operator Setup Table
- Displays millimeter knife stop coordinates across the drive shaft (`11.0 → 131.0 mm`).
- Automatic alternating **Top Rewind Shaft** vs. **Bottom Rewind Shaft** assignments to prevent web interweaving.
- Responsive, horizontal-scroll protected container with single-line rows and no dead vertical blank space.

### 6. Ultra-Clean Machine Operator Print Sheet (A4)
- Clicking **🖨️ Print Job Card** or pressing `Ctrl + P` strips away all web forms, inputs, buttons, and navigation.
- Prints a dedicated, noise-free A4 sheet with:
  1. Company Header with logo
  2. Mandatory Run Directive Box
  3. Master Roll Specs Grid
  4. Knife Setup Ruler Table with check-off boxes
  5. Finished Goods Packaging & Delivery Manifest
  6. Operator Pre-Run Quality Checklist & Sign-Offs (Operator, QA Inspector, Production Manager)

---

## 🚀 Getting Started

### Prerequisites
- Any modern web browser (Google Chrome, Microsoft Edge, Mozilla Firefox, Opera).
- Node.js (optional, for local web server).

### Launching the Application
- **Option 1 (Direct in Browser):** Open `index.html` directly.
- **Option 2 (Local Server via Batch Script):** Double-click `start-slitsmart.bat`.
- **Option 3 (CLI):**
  ```bash
  node server.js
  ```
  Open `http://localhost:3030` in your web browser.

---

## 📁 Repository Structure
```
├── index.html          # Dual-role factory UI & dedicated operator print sheet
├── app.js              # Calculation engine, uniform cycle distributor & optimizer
├── styles.css          # Poppins typography, high-contrast industrial theme & print styles
├── server.js           # Lightweight zero-dependency HTTP server
├── start-slitsmart.bat # 1-click Windows desktop launcher
├── logo.png            # Progressive Enterprises full branding logo
├── logo-mark.png       # Compact branding mark
├── test_math.js        # Mathematical validation & benchmark tests
└── README.md           # Engineering documentation
```

---

## 🏢 Organization
**Progressive Enterprises**  
Precision Slitting, Rewinding & Converting Job Work Services.
