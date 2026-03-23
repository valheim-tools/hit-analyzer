package valheim.calculator.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import lombok.extern.log4j.Log4j2;
import valheim.calculator.core.DamageCalculator;
import valheim.calculator.core.DamageResult;
import valheim.calculator.core.GameDifficulty;
import valheim.calculator.core.MobStats;
import valheim.calculator.core.ParryBonus;
import valheim.calculator.core.PlayerStats;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@Log4j2
public class CalculateHandler implements HttpHandler {

    private final ObjectMapper mapper = new ObjectMapper();

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "POST, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");

        if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            return;
        }

        if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(405, -1);
            return;
        }

        try {
            CalculateRequest req = mapper.readValue(exchange.getRequestBody(), CalculateRequest.class);

            MobStats mob = MobStats.builder()
                    .rawDamage(req.rawDamage())
                    .starLevel(req.starLevel())
                    .extraDamagePercent(resolveExtraDamagePercent(req))
                    .build();

            PlayerStats player = PlayerStats.builder()
                    .maxHealth(req.maxHealth())
                    .blockingSkill(req.blockingSkill())
                    .blockingArmor(req.blockingArmor())
                    .armor(req.armor())
                    .parryMultiplier(resolveParryMultiplier(req))
                    .build();

            GameDifficulty difficulty = GameDifficulty.valueOf(req.difficulty());

            DamageResult noShield = DamageCalculator.calculate(player, mob, difficulty, false, false);
            DamageResult block    = DamageCalculator.calculate(player, mob, difficulty, true,  false);
            DamageResult parry    = DamageCalculator.calculate(player, mob, difficulty, true,  true);

            CalculateResponse resp = new CalculateResponse(
                    mob.rawDamage(),
                    mob.getEffectiveRawDamage(difficulty),
                    noShield, block, parry);
            byte[] body = mapper.writeValueAsBytes(resp);
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(body);
            }

        } catch (Exception e) {
            log.error("Error handling /calculate request", e);
            byte[] body = ("{\"error\":\"" + e.getMessage() + "\"}").getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(400, body.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(body);
            }
        }
    }

    private double resolveParryMultiplier(CalculateRequest req) {
        if (req.parryMultiplier() != null) {
            double multiplier = req.parryMultiplier();
            if (!Double.isFinite(multiplier) || multiplier <= 0.0) {
                throw new IllegalArgumentException("parryMultiplier must be a positive number.");
            }
            return multiplier;
        }

        if (req.parryBonus() != null && !req.parryBonus().isBlank()) {
            return ParryBonus.valueOf(req.parryBonus()).multiplier();
        }

        throw new IllegalArgumentException("parryMultiplier is required.");
    }

    private double resolveExtraDamagePercent(CalculateRequest req) {
        Double extraDamagePercent = req.extraDamagePercent() != null ? req.extraDamagePercent() : req.extraDamage();
        if (extraDamagePercent == null) {
            return 0.0;
        }
        if (!Double.isFinite(extraDamagePercent) || extraDamagePercent < 0.0) {
            throw new IllegalArgumentException("extraDamagePercent must be a non-negative number.");
        }
        return extraDamagePercent;
    }
}

