package valheim.calculator.core;

import lombok.Builder;

@Builder
public record MobStats(double rawDamage, int starLevel) {

    public MobStats {
        if (starLevel < 0 || starLevel > 3) {
            throw new IllegalArgumentException("Star level must be between 0 and 3.");
        }
    }

    /**
     * Applies the combined damage multiplier from game difficulty and mob star level.
     * Both bonuses are added together before scaling:
     *   effectiveDamage = rawDamage * (1 + physicalDamageBonus + starBonus)
     * e.g. Hard (+50%) + 1★ (+50%) = rawDamage * 2.0  (not 1.5 * 1.5)
     */
    public double getEffectiveRawDamage(GameDifficulty difficulty) {
        double starBonus = starLevel * 0.50;
        return rawDamage * (1.0 + difficulty.getPhysicalDamageBonus() + starBonus);
    }
}

