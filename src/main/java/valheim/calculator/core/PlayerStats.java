package valheim.calculator.core;

import lombok.Builder;

@Builder
public record PlayerStats(
        double maxHealth,
        double blockingSkill,
        double blockingArmor,
        double armor,
        double parryMultiplier
) {
    public PlayerStats {
        if (!Double.isFinite(parryMultiplier) || parryMultiplier <= 0.0) {
            throw new IllegalArgumentException("Parry multiplier must be a positive number.");
        }
    }
}

