package valheim.calculator.core;

public enum ParryBonus {

    X1  (1.0,  "×1"),
    X1_5(1.5,  "×1.5"),
    X2  (2.0,  "×2"),
    X2_5(2.5,  "×2.5"),
    X4  (4.0,  "×4"),
    X6  (6.0,  "×6");

    private final double multiplier;
    private final String displayName;

    ParryBonus(double multiplier, String displayName) {
        this.multiplier  = multiplier;
        this.displayName = displayName;
    }

    public double multiplier()    { return multiplier; }
    public String getDisplayName() { return displayName; }
}

