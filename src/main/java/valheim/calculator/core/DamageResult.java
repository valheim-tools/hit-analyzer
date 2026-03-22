package valheim.calculator.core;

import lombok.Builder;

@Builder
public record DamageResult(
        String scenarioName,
        double blockingReducedDamage,
        double finalReducedDamage,
        double remainingHealth,
        StaggerResult stagger
) {}

