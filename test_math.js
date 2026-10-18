const masterWidth = 1000;
const masterWeight = 1000;
const minTrim = 20; // 10mm each side
const usableWidth = masterWidth - minTrim; // 980mm

const cuts = [
  { width: 120, targetKg: 60 },
  { width: 20, targetKg: 80 },
  { width: 18, targetKg: 100 },
  { width: 15, targetKg: 50 }
];

const totalTargetKg = cuts.reduce((s, c) => s + c.targetKg, 0); // 290 kg

// Notice: In the user's order, total ordered kg is 290 kg, but master roll is 1000 kg.
// If the customer says "I am sending you 1000 kg and want 50 kg of 15mm, 80 kg of 20mm, 100 kg of 18mm, 60 kg of 120mm. Like this, they give an entire order for 1000 kg."
// In reality, the customer either:
// Case A: Lists items where proportions matter, or lists items that add up to 1000 kg.
// Case B: Customer has 1000 kg roll, and their target weights are scaled to 1000 kg (e.g. 207 kg of 120mm, 276 kg of 20mm, 345 kg of 18mm, 172 kg of 15mm), OR
// Case C: They only run a fraction of the roll for this customer, or run the whole 1000 kg roll and want the cuts to match the 290 kg proportions!

// Let's verify how single-setup physics works:
// In a single setup across the entire 1000 kg roll:
// Every 1 cut of 120 mm produces exactly: 1000 * (120 / 1000) = 120 kg!
// Every 1 cut of 20 mm produces exactly: 1000 * (20 / 1000) = 20 kg!
// Every 1 cut of 18 mm produces exactly: 1000 * (18 / 1000) = 18 kg!
// Every 1 cut of 15 mm produces exactly: 1000 * (15 / 1000) = 15 kg!

console.log("=== EXACT PHYSICS CHECK FOR 1000 KG ROLL ===");
console.log("1 cut of 120 mm produces:", 1000 * (120/1000), "kg");
console.log("1 cut of 20 mm produces:",  1000 * (20/1000),  "kg");
console.log("1 cut of 18 mm produces:",  1000 * (18/1000),  "kg");
console.log("1 cut of 15 mm produces:",  1000 * (15/1000),  "kg");

// To get close to customer targets (60kg of 120mm, 80kg of 20mm, 100kg of 18mm, 50kg of 15mm):
// If the whole 1000 kg is slit in one setup:
// 1 cut of 120 mm yields 120 kg (which is the minimum possible for 120 mm on a 1000 kg roll!).
// 4 cuts of 20 mm yield 4 * 20 = 80 kg (EXACT MATCH!)
// 5 cuts of 18 mm yield 5 * 18 = 90 kg (close to 100 kg!) or 6 cuts = 108 kg!
// 3 cuts of 15 mm yield 3 * 15 = 45 kg (close to 50 kg!) or 4 cuts = 60 kg!
// But wait! Total width: 120 + 4*20 + 5*18 + 3*15 = 120 + 80 + 90 + 45 = 335 mm.
// If total width used is 335 mm out of 1000 mm, then 665 mm (66.5%) would be waste!
// Why? Because 290 kg is only 29% of 1000 kg!
// That's why the user noted: "Like this, they give an entire order for 1000 kg."
// In a real 1000 kg order, the customer will either specify more items totaling ~1000 kg,
// OR the order targets are scaled to utilize the full 1000 mm roll!
