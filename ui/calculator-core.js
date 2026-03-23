/**
 * Core calculator bridge — the only layer the UI imports for calculations.
 *
 * Previously this was a thin fetch wrapper that POSTed to the Java backend.
 * Now all game math runs client-side via damage-calculator.js, so the app
 * can be served as pure static files with no backend.
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
import { calculate as calcLocal } from './damage-calculator.js';

export async function calculate(inputs) {
    return calcLocal(inputs);
}

