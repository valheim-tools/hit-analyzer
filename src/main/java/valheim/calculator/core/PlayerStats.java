package valheim.calculator.core;

import lombok.Builder;

@Builder
public record PlayerStats(
        double maxHealth,
        double blockingSkill,
        double blockingArmor,
        double armor,
        ParryBonus parryBonus
) {
    /** Convenience accessor used by DamageCalculator. */
    public double parryMultiplier() {
        return parryBonus.multiplier();
    }
}

