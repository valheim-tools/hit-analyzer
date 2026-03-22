package valheim.calculator;

import lombok.extern.log4j.Log4j2;
import valheim.calculator.console.InputReader;
import valheim.calculator.console.ResultPrinter;
import valheim.calculator.core.DamageCalculator;
import valheim.calculator.core.DamageResult;
import valheim.calculator.core.GameDifficulty;
import valheim.calculator.core.MobStats;
import valheim.calculator.core.ParryBonus;
import valheim.calculator.core.PlayerStats;
import valheim.calculator.web.WebServer;

import java.util.Arrays;
import java.util.Scanner;

@Log4j2
public class Main {

    public static void main(String[] args) throws Exception {

        // ── Server mode (launched by launch.ps1) ─────────────────────────────
        if (args.length > 0 && "--server".equals(args[0])) {
            WebServer.start();
            // Non-daemon threads in the cached thread-pool keep the JVM alive.
            return;
        }

        // ── Interactive console mode ──────────────────────────────────────────
        Scanner scanner = new Scanner(System.in);
        InputReader reader = InputReader.builder().scanner(scanner).build();

        log.info("========================================");
        log.info("    Valheim Physical Damage Calculator");
        log.info("========================================");
        log.info("");

        // --- Mob stats ---
        log.info("-- Mob Stats --");
        double rawDamage = reader.readPositiveDouble("Raw damage");

        GameDifficulty[] difficulties = GameDifficulty.values();
        String[] difficultyLabels = Arrays.stream(difficulties)
                .map(d -> String.format("%s (+%.0f%%)", d.getDisplayName(), d.getPhysicalDamageBonus() * 100))
                .toArray(String[]::new);
        int difficultyIndex = reader.readChoice("Game difficulty", difficultyLabels, 0);
        GameDifficulty difficulty = difficulties[difficultyIndex];

        int starLevel = reader.readInt("Mob star level (0 = no star)", 0, 3);

        MobStats mob = MobStats.builder().rawDamage(rawDamage).starLevel(starLevel).build();
        log.info("");

        // --- Player stats ---
        log.info("-- Player Stats --");
        double maxHealth       = reader.readPositiveDouble("Max health");
        double blockingSkill   = reader.readDouble("Blocking skill", 0.0, 200.0);
        double blockingArmor   = reader.readPositiveDouble("Blocking armor");
        double armor           = reader.readPositiveDouble("Armor");

        ParryBonus[] parryBonuses = ParryBonus.values();
        String[] parryLabels = Arrays.stream(parryBonuses)
                .map(ParryBonus::getDisplayName)
                .toArray(String[]::new);
        int parryIndex = reader.readChoice("Parry bonus", parryLabels, 0);
        ParryBonus parryBonus = parryBonuses[parryIndex];

        PlayerStats player = PlayerStats.builder()
                .maxHealth(maxHealth)
                .blockingSkill(blockingSkill)
                .blockingArmor(blockingArmor)
                .armor(armor)
                .parryBonus(parryBonus)
                .build();

        // --- Calculate all three scenarios ---
        DamageResult noShield = DamageCalculator.calculate(player, mob, difficulty, false, false);
        DamageResult block    = DamageCalculator.calculate(player, mob, difficulty, true, false);
        DamageResult parry    = DamageCalculator.calculate(player, mob, difficulty, true, true);

        // --- Print results ---
        ResultPrinter.printTable(Arrays.asList(noShield, block, parry), difficulty, starLevel,
                mob.rawDamage(), mob.getEffectiveRawDamage(difficulty));

        scanner.close();
    }
}
