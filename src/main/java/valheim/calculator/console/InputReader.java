package valheim.calculator.console;

import lombok.Builder;
import lombok.RequiredArgsConstructor;
import lombok.extern.log4j.Log4j2;

import java.util.Scanner;

@Log4j2
@RequiredArgsConstructor
@Builder
public class InputReader {

    private final Scanner scanner;

    /**
     * Prompts the user for a double value within [min, max].
     * Re-prompts on invalid input (non-numeric or out-of-range).
     */
    public double readDouble(String prompt, double min, double max) {
        while (true) {
            log.info(String.format("%s [%.1f - %.1f]: ", prompt, min, max));
            String input = scanner.nextLine().trim();

            try {
                double value = Double.parseDouble(input);
                if (value < min || value > max) {
                    log.info(String.format("  Error: value must be between %.1f and %.1f.", min, max));
                    continue;
                }
                return value;
            } catch (NumberFormatException e) {
                log.info("  Error: please enter a valid number.");
            }
        }
    }

    /**
     * Prompts the user for a positive double (> 0, up to a large max).
     */
    public double readPositiveDouble(String prompt) {
        return readDouble(prompt, 0.1, 99999.0);
    }

    /**
     * Displays a numbered menu and returns the index of the chosen option.
     * Pressing Enter selects the default option.
     */
    public int readChoice(String prompt, String[] options, int defaultIndex) {
        while (true) {
            log.info(prompt);
            for (int i = 0; i < options.length; i++) {
                String marker = (i == defaultIndex) ? " (default)" : "";
                log.info(String.format("  %d. %s%s", i + 1, options[i], marker));
            }
            log.info("  Enter choice [1-" + options.length + "]: ");
            String input = scanner.nextLine().trim();

            if (input.isEmpty()) {
                return defaultIndex;
            }

            try {
                int choice = Integer.parseInt(input);
                if (choice >= 1 && choice <= options.length) {
                    return choice - 1;
                }
                log.info(String.format("  Error: please enter a number between 1 and %d.", options.length));
            } catch (NumberFormatException e) {
                log.info("  Error: please enter a valid number.");
            }
        }
    }

    /**
     * Prompts the user for an integer value within [min, max].
     * Re-prompts on invalid input (non-numeric or out-of-range).
     */
    public int readInt(String prompt, int min, int max) {
        while (true) {
            log.info(String.format("%s [%d - %d]: ", prompt, min, max));
            String input = scanner.nextLine().trim();

            try {
                int value = Integer.parseInt(input);
                if (value < min || value > max) {
                    log.info(String.format("  Error: value must be between %d and %d.", min, max));
                    continue;
                }
                return value;
            } catch (NumberFormatException e) {
                log.info("  Error: please enter a valid integer.");
            }
        }
    }
}

