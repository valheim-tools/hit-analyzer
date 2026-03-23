package valheim.calculator.web;

/**
 * JSON request body for POST /calculate.
 * Record components map directly to JSON field names for Jackson deserialization.
 */
public record CalculateRequest(
        double rawDamage,
        int    starLevel,
        Double extraDamage,
        Double extraDamagePercent,
        String difficulty,
        double maxHealth,
        double blockingSkill,
        double blockingArmor,
        double armor,
        String parryBonus,
        Double parryMultiplier
) {}

