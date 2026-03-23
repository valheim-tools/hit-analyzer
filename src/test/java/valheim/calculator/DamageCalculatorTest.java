package valheim.calculator;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import valheim.calculator.console.ResultPrinter;
import valheim.calculator.core.DamageCalculator;
import valheim.calculator.core.DamageResult;
import valheim.calculator.core.GameDifficulty;
import valheim.calculator.core.MobStats;
import valheim.calculator.core.ParryBonus;
import valheim.calculator.core.PlayerStats;
import valheim.calculator.core.StaggerResult;

import java.io.InputStream;
import java.util.Arrays;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;

class DamageCalculatorTest {

    @ParameterizedTest(name = "{0}")
    @MethodSource("loadTestCases")
    void calculate(TestCase tc) {
        MobStats mob = MobStats.builder()
                .rawDamage(tc.mob.rawDamage)
                .starLevel(tc.mob.starLevel)
                .extraDamagePercent(tc.mob.extraDamagePercent != null ? tc.mob.extraDamagePercent : 0.0)
                .build();

        PlayerStats player = PlayerStats.builder()
                .maxHealth(tc.player.maxHealth)
                .blockingSkill(tc.player.blockingSkill)
                .blockingArmor(tc.player.blockingArmor)
                .armor(tc.player.armor)
                .parryMultiplier(resolveParryMultiplier(tc.player))
                .build();

        GameDifficulty difficulty = GameDifficulty.valueOf(tc.difficulty);

        DamageResult noShield = DamageCalculator.calculate(player, mob, difficulty, false, false);
        DamageResult block    = DamageCalculator.calculate(player, mob, difficulty, true,  false);
        DamageResult parry    = DamageCalculator.calculate(player, mob, difficulty, true,  true);

        ResultPrinter.printTable(Arrays.asList(noShield, block, parry), difficulty, tc.mob.starLevel,
                mob.rawDamage(), mob.getEffectiveRawDamage(difficulty));

        DamageResult result = !tc.useShield ? noShield : tc.isParry ? parry : block;

        ExpectedOutput exp = tc.expected;
        assertAll(
                () -> assertEquals(exp.baseRawDamage,           mob.rawDamage(),                        0.001, "baseRawDamage"),
                () -> assertEquals(exp.effectiveRawDamage,      mob.getEffectiveRawDamage(difficulty),  0.001, "effectiveRawDamage"),
                () -> assertEquals(exp.blockingReducedDamage,   result.blockingReducedDamage(),         0.001, "blockingReducedDamage"),
                () -> assertEquals(exp.finalReducedDamage,      result.finalReducedDamage(),            0.001, "finalReducedDamage"),
                () -> assertEquals(exp.remainingHealth,         result.remainingHealth(),               0.001, "remainingHealth"),
                () -> assertEquals(StaggerResult.valueOf(exp.stagger), result.stagger(),                       "stagger"),
                () -> assertEquals(exp.minHealthForNoStagger,   result.minHealthForNoStagger(),                "minHealthForNoStagger")
        );
    }

    static Stream<Arguments> loadTestCases() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        try (InputStream is = DamageCalculatorTest.class.getResourceAsStream("/damage-calculator-test-cases.json")) {
            return Arrays.stream(mapper.readValue(is, TestCase[].class)).map(Arguments::of);
        }
    }

    // ── Inner data classes ─────────────────────────────────────────────────

    static class TestCase {
        public String name;
        public MobInput mob;
        public PlayerInput player;
        public String difficulty;
        public boolean useShield;
        public boolean isParry;
        public ExpectedOutput expected;

        @Override public String toString() { return name; }
    }

    static class MobInput {
        public double rawDamage;
        public int starLevel;
        public Double extraDamagePercent;
    }

    static class PlayerInput {
        public double maxHealth;
        public double blockingSkill;
        public double blockingArmor;
        public double armor;
        public String parryBonus;
        public Double parryMultiplier;
    }

    private static double resolveParryMultiplier(PlayerInput player) {
        if (player.parryMultiplier != null) {
            return player.parryMultiplier;
        }
        return ParryBonus.valueOf(player.parryBonus).multiplier();
    }

    static class ExpectedOutput {
        public double baseRawDamage;
        public double effectiveRawDamage;
        public double blockingReducedDamage;
        public double finalReducedDamage;
        public double remainingHealth;
        public String stagger;
        public int minHealthForNoStagger;
    }
}
