package valheim.calculator.console;

import lombok.extern.log4j.Log4j2;
import valheim.calculator.core.DamageResult;
import valheim.calculator.core.GameDifficulty;

import java.util.List;

@Log4j2
public class ResultPrinter {

    private static final String DIVIDER = "+" + "-".repeat(24)
            + "+" + "-".repeat(16)
            + "+" + "-".repeat(16)
            + "+" + "-".repeat(16) + "+";

    public static void printTable(List<DamageResult> results,
                                  GameDifficulty difficulty, int starLevel,
                                  double baseRawDamage, double effectiveRawDamage) {
        if (results.size() != 3) {
            throw new IllegalArgumentException("Expected exactly 3 results (No Shield, Block, Parry)");
        }

        DamageResult noShield = results.get(0);

        log.info("");
        log.info("=== Valheim Damage Calculator Results ===");
        log.info("");

        // --- Modifier summary ---
        printModifierSummary(difficulty, starLevel, baseRawDamage, effectiveRawDamage);

        DamageResult block = results.get(1);
        DamageResult parry = results.get(2);

        // Header
        log.info(DIVIDER);
        log.info(String.format("| %-22s | %-14s | %-14s | %-14s |",
                "", noShield.scenarioName(), block.scenarioName(), parry.scenarioName()));
        log.info(DIVIDER);

        // Rows
        printRow("Blocking-Reduced Damage",
                noShield.blockingReducedDamage(), block.blockingReducedDamage(), parry.blockingReducedDamage());
        printRow("Final/Armor-Reduced Damage",
                noShield.finalReducedDamage(), block.finalReducedDamage(), parry.finalReducedDamage());
        printRow("Remaining Health",
                noShield.remainingHealth(), block.remainingHealth(), parry.remainingHealth());

        log.info(DIVIDER);

        // Stagger row
        printEnumRow("Stagger",
                noShield.stagger().name(), block.stagger().name(), parry.stagger().name());

        log.info(DIVIDER);
        log.info("");
    }

    private static void printModifierSummary(GameDifficulty difficulty, int starLevel,
                                             double baseRaw, double effectiveRaw) {
        double difficultyBonus = difficulty.getPhysicalDamageBonus();
        double starBonus       = starLevel * 0.50;
        double totalBonus      = difficultyBonus + starBonus;

        if (totalBonus == 0.0) {
            log.info("Damage Modifier : No modifier");
        } else {
            // Build the breakdown string, only including non-zero components
            StringBuilder breakdown = new StringBuilder();
            if (difficultyBonus > 0.0) {
                breakdown.append(difficulty.getDisplayName())
                         .append(String.format(" +%.0f%%", difficultyBonus * 100));
            }
            if (starBonus > 0.0) {
                if (breakdown.length() > 0) breakdown.append("  |  ");
                breakdown.append(starLevel).append("\u2605")
                         .append(String.format(" +%.0f%%", starBonus * 100));
            }
            log.info(String.format("Damage Modifier : +%.0f%%  [%s]", totalBonus * 100, breakdown));
        }

        log.info(String.format("Base Raw Damage : %.2f  →  Effective: %.2f", baseRaw, effectiveRaw));
        log.info("");
    }

    private static void printRow(String label, double v1, double v2, double v3) {
        log.info(String.format("| %-22s | %14.2f | %14.2f | %14.2f |", label, v1, v2, v3));
    }

    private static void printEnumRow(String label, String v1, String v2, String v3) {
        log.info(String.format("| %-22s | %-14s | %-14s | %-14s |",
                label, v1, v2, v3));
    }
}

