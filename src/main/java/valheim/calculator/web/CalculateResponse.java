package valheim.calculator.web;

import valheim.calculator.core.DamageResult;

/**
 * JSON response body for POST /calculate.
 * Wraps the three scenario results so the UI can display them as a table.
 */
public record CalculateResponse(
        double baseRawDamage,
        double effectiveRawDamage,
        DamageResult noShield,
        DamageResult block,
        DamageResult parry
) {}

