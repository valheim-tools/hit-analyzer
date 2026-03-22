package valheim.calculator.core;

public class DamageCalculator {

    /**
     * Stagger bar is 40% of the player's maximum health.
     */
    public static double calculateStaggerBar(double maxHealth) {
        return 0.40 * maxHealth;
    }

    /**
     * Effective blocking armor = (blockingSkill * 0.005 * blockingArmor + blockingArmor) * parryMultiplier.
     * Equivalent to: blockingArmor * (1 + 0.005 * blockingSkill) * parryMultiplier.
     * If not parrying, parryMultiplier should be 1.
     */
    public static double calculateBlockingArmor(double blockingSkill, double blockingArmor,
                                                double parryMultiplier) {
        return (blockingSkill * 0.005 * blockingArmor + blockingArmor) * parryMultiplier;
    }

    /**
     * Shared armor reduction formula.
     * Uses strict {@code <} for the threshold check (matching Valheim behaviour).
     *
     * If armor < half of damage  →  reduced = damage - armor
     * Else                       →  reduced = damage² / (armor * 4)
     */
    public static double applyArmorReduction(double damage, double armor) {
        if (armor < damage / 2.0) {
            return damage - armor;
        } else {
            return (damage * damage) / (armor * 4.0);
        }
    }

    /**
     * Runs the full damage pipeline for a single scenario.
     *
     * @param player     player stats
     * @param mob        mob stats (base raw damage + star level)
     * @param difficulty game difficulty mode, used to scale raw damage
     * @param useShield  whether the player is blocking with a shield
     * @param isParry    whether the player parried (only relevant if useShield is true)
     * @return a {@link DamageResult} with all computed values
     */
    public static DamageResult calculate(PlayerStats player, MobStats mob,
                                         GameDifficulty difficulty,
                                         boolean useShield, boolean isParry) {
        double baseRawDamage      = mob.rawDamage();
        double effectiveRawDamage = mob.getEffectiveRawDamage(difficulty);
        double staggerBar         = calculateStaggerBar(player.maxHealth());

        // --- Blocking phase ---
        double blockingReducedDamage = effectiveRawDamage; // default: no shield → no blocking reduction
        boolean staggeredOnBlock = false;

        if (useShield) {
            double parryMultiplier = isParry ? player.parryMultiplier() : 1.0;
            double effectiveBlockArmor = calculateBlockingArmor(
                    player.blockingSkill(), player.blockingArmor(), parryMultiplier);

            double afterBlock = applyArmorReduction(effectiveRawDamage, effectiveBlockArmor);

            if (afterBlock > staggerBar) {
                // Player is staggered on block — no damage is reduced by blocking
                blockingReducedDamage = effectiveRawDamage;
                staggeredOnBlock = true;
            } else {
                blockingReducedDamage = afterBlock;
            }
        }

        // --- Armor phase ---
        double afterArmor = applyArmorReduction(blockingReducedDamage, player.armor());

        // Determine stagger: block-stagger gates armor-stagger (no double-stagger).
        StaggerResult stagger;
        if (staggeredOnBlock) {
            stagger = StaggerResult.ON_BLOCK;
        } else if (afterArmor > staggerBar) {
            stagger = StaggerResult.ON_ARMOR;
        } else {
            stagger = StaggerResult.NONE;
        }

        double remainingHealth = player.maxHealth() - afterArmor;

        String scenarioName;
        if (!useShield) {
            scenarioName = "No Shield";
        } else if (isParry) {
            scenarioName = "Parry";
        } else {
            scenarioName = "Block";
        }

        return DamageResult.builder()
                .scenarioName(scenarioName)
                .blockingReducedDamage(blockingReducedDamage)
                .finalReducedDamage(afterArmor)
                .remainingHealth(remainingHealth)
                .stagger(stagger)
                .build();
    }
}

