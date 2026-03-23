/**
 * Core API client — the only layer that knows about the Java backend.
 * All calculation logic lives in DamageCalculator.java; this module is
 * purely a thin transport wrapper so the UI (and any future desktop shell)
 * has a single clean call to make.
 *
 * @param {Object} inputs
 * @param {number} inputs.rawDamage
 * @param {number} inputs.starLevel        0–3
 * @param {number} inputs.extraDamagePercent Optional additive damage bonus as a percentage (>= 0)
 * @param {string} inputs.difficulty       "NORMAL" | "HARD" | "VERY_HARD"
 * @param {number} inputs.maxHealth
 * @param {number} inputs.blockingSkill    0–200
 * @param {number} inputs.blockingArmor
 * @param {number} inputs.armor
 * @param {number} inputs.parryMultiplier  Custom shield parry multiplier (> 0)
 *
 * @returns {Promise<{noShield: DamageResult, block: DamageResult, parry: DamageResult}>}
 */
export async function calculate(inputs) {
    const response = await fetch("http://localhost:8080/calculate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(inputs),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(err.error ?? "Calculation failed");
    }

    return response.json();
}

