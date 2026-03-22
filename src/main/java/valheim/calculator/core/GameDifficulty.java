package valheim.calculator.core;

public enum GameDifficulty {

    NORMAL("Normal", 0.0),
    HARD("Hard", 0.5),
    VERY_HARD("Very Hard", 1.0);

    private final String displayName;
    private final double physicalDamageBonus;

    GameDifficulty(String displayName, double physicalDamageBonus) {
        this.displayName = displayName;
        this.physicalDamageBonus = physicalDamageBonus;
    }

    public String getDisplayName() {
        return displayName;
    }

    public double getPhysicalDamageBonus() {
        return physicalDamageBonus;
    }
}

