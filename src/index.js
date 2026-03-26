import { calculate, calculateShieldBlockArmor, sampleRng, getPercentileRng } from './damage-calculator.js?v=9';
import { initTooltipClamping } from './mobile.js?v=9';

/* ── Constants ── */
const DAMAGE_TYPE_NAMES = ['Blunt', 'Slash', 'Pierce', 'Fire', 'Frost', 'Lightning', 'Poison', 'Spirit'];
const DAMAGE_TYPE_ICONS = { Blunt: '🔨', Slash: '⚔', Pierce: '🏹', Fire: '🔥', Frost: '❄', Lightning: '⚡', Poison: '☠', Spirit: '👻' };
const DAMAGE_TYPE_CLASSES = { Blunt: 'dt-blunt', Slash: 'dt-slash', Pierce: 'dt-pierce', Fire: 'dt-fire', Frost: 'dt-frost', Lightning: 'dt-lightning', Poison: 'dt-poison', Spirit: 'dt-spirit' };
const DOT_CSS_CLASSES = { fire: 'sim-dot-fire', poison: 'sim-dot-poison', spirit: 'sim-dot-spirit' };

const DEFAULTS = Object.freeze({
    mobPreset: 'troll_log_swing_v',
    damageTypes: { Blunt: 70 },
    starLevel: 0,
    difficulty: 'NORMAL',
    maxHealth: 120,
    blockingSkill: 15,
    blockArmor: 28,
    armor: 45,
    parryMultiplier: 2.5,
    extraDamagePercent: 0,
    resistanceModifiers: {},
    percentile: 100,
    shieldPreset: 'ShieldBronzeBuckler',
    shieldQuality: 3,
    dotSpeed: 3,
});
const LS_FORM = 'valheim-form';
const LEGACY_PARRY_MULTIPLIERS = { X1: 1, X1_5: 1.5, X2: 2, X2_5: 2.5, X4: 4, X6: 6 };
const PARRY_MULTIPLIER_PRESETS = [1, 1.5, 2, 2.5, 4, 6];

/* ── DOM refs ── */
const form = document.getElementById('calcForm');
const errBox = document.getElementById('error');
const results = document.getElementById('results');
const formulaDetailsEl = document.getElementById('formulaDetails');
const formulaEl = document.getElementById('formula');
const damageSummaryEl = document.getElementById('damageSummary');
const modifierLineEl = document.getElementById('modifierLine');
const tbodyEl = document.getElementById('tbody');
const columnEls = [
    document.getElementById('col0'),
    document.getElementById('col1'),
    document.getElementById('col2'),
];
const damageTypeInputsEl = document.getElementById('damageTypeInputs');
const addDamageTypeBtnEl = document.getElementById('addDamageTypeBtn');
const starLevelRadios = () => document.querySelectorAll('input[name="starLevel"]');
const difficultyRadios = () => document.querySelectorAll('input[name="difficulty"]');
const maxHealthEl = document.getElementById('maxHealth');
const blockingSkillEl = document.getElementById('blockingSkill');
const blockArmorEl = document.getElementById('blockArmor');
const armorEl = document.getElementById('armor');
const extraDamageInputsEl = document.getElementById('extraDamageInputs');
const addExtraDamageBtnEl = document.getElementById('addExtraDamageBtn');
const parryPresetEl = document.getElementById('parryMultiplierPreset');
const parryCustomFieldEl = document.getElementById('customParryMultiplierField');
const parryCustomInputEl = document.getElementById('parryMultiplier');
const resetBtnEl = document.getElementById('resetBtn');
const mobPresetEl = document.getElementById('mobPreset');
const mobPresetDropdownEl = document.getElementById('mobPresetDropdown');
const mobPresetTriggerEl = document.getElementById('mobPresetTrigger');
const mobPresetTriggerTextEl = document.getElementById('mobPresetTrigger').querySelector('.mob-preset-trigger-text');
const mobPresetPanelEl = document.getElementById('mobPresetPanel');
const mobPresetSearchEl = document.getElementById('mobPresetSearch');
const mobPresetListEl = document.getElementById('mobPresetList');
const shieldPresetEl = document.getElementById('shieldPreset');
const shieldPresetDropdownEl = document.getElementById('shieldPresetDropdown');
const shieldPresetTriggerEl = document.getElementById('shieldPresetTrigger');
const shieldPresetTriggerTextEl = document.getElementById('shieldPresetTrigger').querySelector('.shield-preset-trigger-text');
const shieldPresetPanelEl = document.getElementById('shieldPresetPanel');
const shieldPresetListEl = document.getElementById('shieldPresetList');
const shieldQualityGroupEl = document.getElementById('shieldQualityGroup');
const shieldQualityRadios = () => document.querySelectorAll('input[name="shieldQuality"]');
const simRandomHitBtnEl = document.getElementById('simRandomHitBtn');
const percentileInputEl = document.getElementById('percentileInput');
const dotSpeedSliderEl = document.getElementById('dotSpeedSlider');
const dotSpeedValueEl = document.getElementById('dotSpeedValue');
const resistanceTypeInputsEl = document.getElementById('resistanceTypeInputs');
const addResistanceTypeBtnEl = document.getElementById('addResistanceTypeBtn');

/* ── Tab DOM refs ── */
const tabSimulatorEl   = document.getElementById('tab-simulator');
const tabCalculatorEl  = document.getElementById('tab-calculator');

function switchTab(name) {
    const isSimulator = name === 'simulator';
    tabSimulatorEl.hidden  = !isSimulator;
    tabCalculatorEl.hidden = isSimulator;
    document.querySelectorAll('.tab-btn').forEach(button => {
        const active = button.dataset.tab === name;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
}

/* ── Hit Simulator DOM refs ── */
const simTakeHitBtnEl     = document.getElementById('simTakeHitBtn');
const simResetBtnEl       = document.getElementById('simResetBtn');
const simClearLogBtnEl    = document.getElementById('simClearLogBtn');
const simBarFillEl        = document.getElementById('simBarFill');
const simHealthCurrentEl  = document.getElementById('simHealthCurrent');
const simHealthMaxEl      = document.getElementById('simHealthMax');
const simDeathIconEl      = document.getElementById('simDeathIcon');
const simErrorEl          = document.getElementById('simError');
const simLogEl            = document.getElementById('simLog');
const simScenarioRadios   = () => document.querySelectorAll('input[name="simScenario"]');

/* ── Combat Arena DOM refs ── */
const simArenaEl          = document.getElementById('simArena');
const arenaMobEl          = document.getElementById('arenaMob');
const arenaProjectileEl   = document.getElementById('arenaProjectile');
const arenaPlayerEl       = document.getElementById('arenaPlayer');
const arenaPlayerShieldEl = document.getElementById('arenaPlayerShield');
const arenaMobIconEl      = document.getElementById('arenaMobIcon');

const SHIELD_IMAGE_BLOCK = 'src/assets/images/animations/blue-shield.png';
const SHIELD_IMAGE_PARRY = 'src/assets/images/animations/yellow-shield.png';
const SHIELD_IMAGE_BROKEN = 'src/assets/images/animations/red-shield.png';

new Image().src = SHIELD_IMAGE_BLOCK;
new Image().src = SHIELD_IMAGE_PARRY;
new Image().src = SHIELD_IMAGE_BROKEN;

/* ── Damage type input management ── */

const DAMAGE_TYPE_ROW_TEMPLATE = `
    <select class="damage-type-select" aria-label="Damage type">
        <optgroup label="⚔ Instant">
            <option value="Blunt">🔨 Blunt</option>
            <option value="Slash">⚔ Slash</option>
            <option value="Pierce">🏹 Pierce</option>
            <option value="Frost">❄ Frost</option>
            <option value="Lightning">⚡ Lightning</option>
        </optgroup>
        <optgroup label="⏳ Damage over Time">
            <option value="Fire">🔥 Fire</option>
            <option value="Poison">☠ Poison</option>
            <option value="Spirit">👻 Spirit</option>
        </optgroup>
    </select>
    <input type="number" class="damage-type-value" value="0" min="0" max="1000" step="0.1" aria-label="Damage value">
    <button type="button" class="damage-type-remove" title="Remove" aria-label="Remove damage type">✕</button>`;

function addDamageTypeRow(typeName = 'Blunt', value = 0) {
    const row = document.createElement('div');
    row.className = 'damage-type-row';
    row.innerHTML = DAMAGE_TYPE_ROW_TEMPLATE;
    row.querySelector('.damage-type-select').value = typeName;
    row.querySelector('.damage-type-value').value = value;
    row.querySelector('.damage-type-remove').addEventListener('click', () => {
        row.remove();
        saveForm();
    });
    damageTypeInputsEl.appendChild(row);
}

function collectDamageTypesFromUi() {
    const damageTypes = {};
    const rows = damageTypeInputsEl.querySelectorAll('.damage-type-row');
    for (const row of rows) {
        const typeName = row.querySelector('.damage-type-select').value;
        const value = parseFloat(row.querySelector('.damage-type-value').value) || 0;
        if (value > 0) {
            damageTypes[typeName] = (damageTypes[typeName] || 0) + value;
        }
    }
    return damageTypes;
}

function setDamageTypesInUi(damageTypes) {
    damageTypeInputsEl.innerHTML = '';
    const entries = Object.entries(damageTypes || {}).filter(([, value]) => value > 0);
    if (entries.length === 0) {
        addDamageTypeRow('Blunt', 60);
    } else {
        for (const [typeName, value] of entries) {
            addDamageTypeRow(typeName, value);
        }
    }
}

/* ── Resistance type input management ── */

const RESISTANCE_TYPE_SELECT_OPTIONS = `
    <optgroup label="⚔ Instant">
        <option value="Blunt">🔨 Blunt</option>
        <option value="Slash">⚔ Slash</option>
        <option value="Pierce">🏹 Pierce</option>
        <option value="Frost">❄ Frost</option>
        <option value="Lightning">⚡ Lightning</option>
    </optgroup>
    <optgroup label="⏳ Damage over Time">
        <option value="Fire">🔥 Fire</option>
        <option value="Poison">☠ Poison</option>
        <option value="Spirit">👻 Spirit</option>
    </optgroup>`;

const RESISTANCE_ROW_TEMPLATE = `
    <select class="resistance-type-select" aria-label="Damage type">${RESISTANCE_TYPE_SELECT_OPTIONS}</select>
    <input type="number" class="resistance-percent-value" value="100" min="0" max="200" step="1" aria-label="Resistance percent">
    <span class="resistance-percent-symbol">%</span>
    <button type="button" class="resistance-type-remove" title="Remove" aria-label="Remove resistance modifier">✕</button>`;

function getUsedResistanceTypes() {
    const usedTypes = new Set();
    const rows = resistanceTypeInputsEl.querySelectorAll('.resistance-type-row');
    for (const row of rows) {
        usedTypes.add(row.querySelector('.resistance-type-select').value);
    }
    return usedTypes;
}

function syncResistanceTypeOptions() {
    const rows = resistanceTypeInputsEl.querySelectorAll('.resistance-type-row');
    const usedTypes = getUsedResistanceTypes();

    for (const row of rows) {
        const selectElement = row.querySelector('.resistance-type-select');
        const currentValue = selectElement.value;
        const options = selectElement.querySelectorAll('option');
        for (const option of options) {
            option.disabled = option.value !== currentValue && usedTypes.has(option.value);
        }
    }

    // Hide add button if all 8 types are used
    addResistanceTypeBtnEl.hidden = usedTypes.size >= DAMAGE_TYPE_NAMES.length;
}

function findFirstUnusedResistanceType() {
    const usedTypes = getUsedResistanceTypes();
    for (const typeName of DAMAGE_TYPE_NAMES) {
        if (!usedTypes.has(typeName)) return typeName;
    }
    return DAMAGE_TYPE_NAMES[0];
}

function resistanceMultiplierToPercent(multiplier) {
    return Math.round(multiplier * 100);
}

function addResistanceTypeRow(typeName = null, multiplier = 1.0) {
    const resolvedTypeName = typeName ?? findFirstUnusedResistanceType();
    const percent = resistanceMultiplierToPercent(multiplier);

    const row = document.createElement('div');
    row.className = 'resistance-type-row';
    row.innerHTML = RESISTANCE_ROW_TEMPLATE;

    const typeSelect = row.querySelector('.resistance-type-select');
    const percentInput = row.querySelector('.resistance-percent-value');

    typeSelect.value = resolvedTypeName;
    percentInput.value = percent;

    // Type change handler — sync duplicate prevention
    typeSelect.addEventListener('change', () => {
        syncResistanceTypeOptions();
        saveForm();
    });

    // Remove button handler
    row.querySelector('.resistance-type-remove').addEventListener('click', () => {
        row.remove();
        syncResistanceTypeOptions();
        saveForm();
    });

    // Percent input handler
    percentInput.addEventListener('input', () => saveForm());

    resistanceTypeInputsEl.appendChild(row);
    syncResistanceTypeOptions();
}

function collectResistanceModifiersFromUi() {
    const resistanceModifiers = {};
    const rows = resistanceTypeInputsEl.querySelectorAll('.resistance-type-row');
    for (const row of rows) {
        const typeName = row.querySelector('.resistance-type-select').value;
        let percent = parseFloat(row.querySelector('.resistance-percent-value').value);
        if (!Number.isFinite(percent)) percent = 100;
        percent = Math.max(0, Math.min(200, percent));
        resistanceModifiers[typeName] = percent / 100;
    }
    return resistanceModifiers;
}

function setResistanceModifiersInUi(resistanceModifiers) {
    resistanceTypeInputsEl.innerHTML = '';
    if (!resistanceModifiers || Object.keys(resistanceModifiers).length === 0) {
        syncResistanceTypeOptions();
        return;
    }
    for (const [typeName, multiplier] of Object.entries(resistanceModifiers)) {
        if (DAMAGE_TYPE_NAMES.includes(typeName)) {
            addResistanceTypeRow(typeName, multiplier);
        }
    }
}

/* ── Formatting helpers ── */

function resolveExtraDamagePercentValue(values = {}) {
    if (values.extraDamagePercent != null && values.extraDamagePercent !== '') {
        const parsed = Number(values.extraDamagePercent);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULTS.extraDamagePercent;
    }
    if (values.extraDamage != null && values.extraDamage !== '') {
        const parsed = Number(values.extraDamage);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULTS.extraDamagePercent;
    }
    return DEFAULTS.extraDamagePercent;
}

function addExtraDamageRow(percent = 0) {
    extraDamageInputsEl.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'extra-damage-row';
    row.innerHTML = `
        <input type="number" class="extra-damage-value" value="${percent}" min="0" max="10000" step="0.1" aria-label="Extra damage bonus percentage">
        <span class="extra-damage-percent-symbol">%</span>
        <button type="button" class="extra-damage-remove" title="Remove" aria-label="Remove extra damage bonus">✕</button>`;

    row.querySelector('.extra-damage-remove').addEventListener('click', () => {
        row.remove();
        addExtraDamageBtnEl.hidden = false;
        saveForm();
    });

    row.querySelector('.extra-damage-value').addEventListener('input', () => saveForm());

    extraDamageInputsEl.appendChild(row);
    addExtraDamageBtnEl.hidden = true;
}

function getExtraDamagePercentFromUi() {
    const input = extraDamageInputsEl.querySelector('.extra-damage-value');
    if (!input) return 0;
    const parsed = Number(input.value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function setExtraDamageInUi(values = {}) {
    const percent = resolveExtraDamagePercentValue(values);
    const hasExtraDamage = percent > 0 && values.extraDamageEnabled !== 'no';
    extraDamageInputsEl.innerHTML = '';
    if (hasExtraDamage) {
        addExtraDamageRow(percent);
    } else {
        addExtraDamageBtnEl.hidden = false;
    }
}

function sanitizeParryMultiplier(value, fallback = DEFAULTS.parryMultiplier) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveParryMultiplierValue(values = {}) {
    if (values.parryMultiplier != null && values.parryMultiplier !== '') {
        return sanitizeParryMultiplier(values.parryMultiplier);
    }
    if (values.parryBonus && LEGACY_PARRY_MULTIPLIERS[values.parryBonus] != null) {
        return LEGACY_PARRY_MULTIPLIERS[values.parryBonus];
    }
    return DEFAULTS.parryMultiplier;
}

function formatParryMultiplier(multiplier) {
    const value = sanitizeParryMultiplier(multiplier);
    return `×${Number.isInteger(value) ? value.toFixed(0) : String(value)}`;
}

function formatPercent(value) {
    const parsed = Number(value);
    const normalized = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    return Number.isInteger(normalized) ? normalized.toFixed(0) : String(parseFloat(normalized.toFixed(3)));
}

function resolveParryMultiplierMode(values = {}) {
    if (values.parryMultiplierMode === 'custom') return 'custom';
    if (values.parryMultiplierMode === 'preset') return 'preset';
    return isPresetParryMultiplier(resolveParryMultiplierValue(values)) ? 'preset' : 'custom';
}

function isPresetParryMultiplier(multiplier) {
    return PARRY_MULTIPLIER_PRESETS.some(preset => Math.abs(preset - multiplier) < 1e-9);
}

function syncParryMultiplierUi(values = {}) {
    const multiplier = resolveParryMultiplierValue(values);
    const isCustom = resolveParryMultiplierMode(values) === 'custom';
    parryPresetEl.value = isCustom ? 'custom' : String(multiplier);
    parryCustomFieldEl.hidden = !isCustom;
    parryCustomInputEl.disabled = !isCustom;
    if (isCustom || !parryCustomInputEl.value || values === DEFAULTS) {
        parryCustomInputEl.value = multiplier;
    }
}

function getParryMultiplierFromUi() {
    if (parryPresetEl.value === 'custom') {
        return sanitizeParryMultiplier(parryCustomInputEl.value);
    }
    return sanitizeParryMultiplier(parryPresetEl.value);
}

/* ── Shield presets ── */
let shieldPresets = [];

function populateShieldPresets(shields) {
    shieldPresets = shields;
    shields.forEach(shield => {
        const row = document.createElement('div');
        row.className = 'shield-preset-option';
        row.dataset.value = shield.prefab;

        const iconImg = document.createElement('img');
        iconImg.className = 'shield-preset-option-icon';
        iconImg.src = `src/assets/images/presets/shields/${shield.prefab}.png`;
        iconImg.alt = shield.item_name;
        iconImg.loading = 'lazy';

        const textSpan = document.createElement('span');
        textSpan.className = 'shield-preset-option-text';
        textSpan.textContent = shield.item_name;

        row.appendChild(iconImg);
        row.appendChild(textSpan);
        shieldPresetListEl.appendChild(row);
    });
}

function openShieldPresetDropdown() {
    shieldPresetPanelEl.hidden = false;
    shieldPresetDropdownEl.classList.add('open');
}

function closeShieldPresetDropdown() {
    shieldPresetPanelEl.hidden = true;
    shieldPresetDropdownEl.classList.remove('open');
}

function selectShieldPreset(prefab) {
    shieldPresetEl.value = prefab;
    const shield = shieldPresets.find(shield => shield.prefab === prefab);
    if (shield) {
        shieldPresetTriggerTextEl.textContent = shield.item_name;
        // Show icon in trigger
        let triggerIcon = shieldPresetTriggerEl.querySelector('.shield-preset-trigger-icon');
        if (!triggerIcon) {
            triggerIcon = document.createElement('img');
            triggerIcon.className = 'shield-preset-trigger-icon';
            shieldPresetTriggerEl.insertBefore(triggerIcon, shieldPresetTriggerTextEl);
        }
        triggerIcon.src = `src/assets/images/presets/shields/${shield.prefab}.png`;
        triggerIcon.alt = '';
        triggerIcon.hidden = false;
    } else {
        shieldPresetTriggerTextEl.textContent = 'Custom';
        const triggerIcon = shieldPresetTriggerEl.querySelector('.shield-preset-trigger-icon');
        if (triggerIcon) triggerIcon.hidden = true;
    }
    closeShieldPresetDropdown();
    shieldPresetEl.dispatchEvent(new Event('change'));
}

function getShieldQuality() {
    for (const radio of shieldQualityRadios()) {
        if (radio.checked) return parseInt(radio.value, 10) || 1;
    }
    return 1;
}

function setShieldQuality(quality) {
    for (const radio of shieldQualityRadios()) {
        radio.checked = parseInt(radio.value, 10) === quality;
    }
}

function setShieldQualityDisabled(isDisabled) {
    for (const radio of shieldQualityRadios()) {
        radio.disabled = isDisabled;
    }
    shieldQualityGroupEl.classList.toggle('disabled', isDisabled);
}

function syncShieldUi() {
    const selectedPrefab = shieldPresetEl.value;
    const shield = shieldPresets.find(shield => shield.prefab === selectedPrefab);
    if (shield) {
        const quality = getShieldQuality();
        const blockArmor = calculateShieldBlockArmor(shield.block_armor, shield.block_per_level, quality);
        blockArmorEl.value = blockArmor;
        // Auto-set parry multiplier from shield data
        const parryBonus = shield.parry_bonus || 1.0;
        if (isPresetParryMultiplier(parryBonus)) {
            parryPresetEl.value = String(parryBonus);
            parryCustomFieldEl.hidden = true;
            parryCustomInputEl.disabled = true;
        } else {
            parryPresetEl.value = 'custom';
            parryCustomInputEl.value = parryBonus;
            parryCustomFieldEl.hidden = false;
            parryCustomInputEl.disabled = false;
        }
        setShieldQualityDisabled(false);
    } else {
        setShieldQualityDisabled(true);
    }
}

/* ── Form state ── */

function collectFormState() {
    return {
        mobPreset: mobPresetEl.value,
        damageTypes: collectDamageTypesFromUi(),
        starLevel: parseInt(document.querySelector('input[name="starLevel"]:checked').value, 10),
        extraDamagePercent: getExtraDamagePercentFromUi(),
        difficulty: document.querySelector('input[name="difficulty"]:checked').value,
        maxHealth: parseFloat(maxHealthEl.value),
        resistanceModifiers: collectResistanceModifiersFromUi(),
        blockingSkill: parseFloat(blockingSkillEl.value),
        blockArmor: parseFloat(blockArmorEl.value),
        armor: parseFloat(armorEl.value),
        parryMultiplier: getParryMultiplierFromUi(),
        parryMultiplierMode: parryPresetEl.value === 'custom' ? 'custom' : 'preset',
        percentile: percentileInputEl.value,
        shieldPreset: shieldPresetEl.value,
        shieldQuality: getShieldQuality(),
        dotSpeed: parseFloat(dotSpeedSliderEl.value) || DEFAULTS.dotSpeed,
    };
}

/* ── Hit Simulator state ── */
let simState = null;
let dotAnimationTimer = null;
let isDotAnimating = false;

function getSelectedSimScenario() {
    for (const radio of simScenarioRadios()) {
        if (radio.checked) return radio.value;
    }
    return 'noShield';
}

const SIM_SCENARIO_LABELS = { noShield: 'No Shield', block: 'Block', parry: 'Parry' };

function initHitSimulator() {
    const maxHealth = parseFloat(maxHealthEl.value) || 0;
    simState = { maxHealth, currentHealth: maxHealth, hitCount: 0 };
    simLogEl.innerHTML = '';
    simErrorEl.hidden = true;
    cancelDotAnimation();
    resetArenaAnimations();
    resetArenaDeathState();
    renderHitSimulator();
}

function syncSimMaxHealth() {
    if (!simState) { initHitSimulator(); return; }
    const newMaxHealth = parseFloat(maxHealthEl.value) || 0;
    if (simState.hitCount === 0) {
        simState.maxHealth = newMaxHealth;
        simState.currentHealth = newMaxHealth;
    } else {
        simState.maxHealth = newMaxHealth;
    }
    renderHitSimulator();
}

function renderHitSimulator() {
    if (!simState) return;
    const { maxHealth, currentHealth } = simState;
    const isDead = currentHealth <= 0;
    const healthPercent = maxHealth > 0 ? Math.max(0, (currentHealth / maxHealth) * 100) : 0;

    simHealthMaxEl.textContent = formatNumber(maxHealth);
    simHealthCurrentEl.textContent = isDead ? '0.000' : formatNumber(currentHealth);
    simDeathIconEl.hidden = !isDead;

    simBarFillEl.style.width = healthPercent + '%';
    simBarFillEl.classList.remove('sim-bar-warning', 'sim-bar-critical', 'sim-bar-dead');
    if (isDead) {
        simBarFillEl.classList.add('sim-bar-dead');
    } else if (healthPercent <= 20) {
        simBarFillEl.classList.add('sim-bar-critical');
    } else if (healthPercent <= 50) {
        simBarFillEl.classList.add('sim-bar-warning');
    }

    const disableHitButtons = isDead || isDotAnimating;
    simTakeHitBtnEl.disabled = disableHitButtons;
    simRandomHitBtnEl.disabled = disableHitButtons;
}

function appendSimLogEntry(hitNumber, scenarioKey, damage, remainingHealth, staggered, exactRemainingHealth, rngFactor = null) {
    const isDead = remainingHealth <= 0;
    const healthText = isDead
        ? `<span class="sim-log-hp sim-log-dead tip-wrap">💀<span class="tip-text">${formatNumber(exactRemainingHealth)}</span></span>`
        : `<span class="sim-log-hp">${formatNumber(remainingHealth)} HP</span>`;
    const staggerBadge = staggered ? `<span class="sim-log-stagger">⚠<span class="sim-log-stagger-text"> Staggered</span></span>` : '';
    const scenarioLabel = SIM_SCENARIO_LABELS[scenarioKey] ?? scenarioKey;
    const factorBadge = rngFactor !== null
        ? `<span class="sim-log-factor" title="RNG factor: ×${formatNumber(rngFactor)} (rng=${formatNumber(rngFactor * rngFactor)})">×${formatNumber(rngFactor)}</span>`
        : `<span class="sim-log-factor"></span>`;

    const li = document.createElement('li');
    li.className = 'sim-log-entry';
    li.innerHTML = `<span class="sim-log-hit-num"><span class="sim-log-hit-prefix">Hit </span>#${hitNumber}</span>`
        + `<span class="sim-log-scenario">[${scenarioLabel}]</span>`
        + `<span class="sim-log-dmg">−${formatNumber(damage)}</span>`
        + factorBadge
        + healthText
        + staggerBadge;
    simLogEl.appendChild(li);
    simLogEl.scrollTop = simLogEl.scrollHeight;
}

function appendDotTickLogEntry(dotTypeName, tickIndex, totalTicks, tickDamage, remainingHealth) {
    const isDead = remainingHealth <= 0;
    const icon = DAMAGE_TYPE_ICONS[dotTypeName] || '⏱';
    const healthText = isDead
        ? `<span class="sim-log-hp sim-log-dead">💀</span>`
        : `<span class="sim-log-hp">${formatNumber(remainingHealth)} HP</span>`;

    const li = document.createElement('li');
    li.className = 'sim-log-entry sim-log-dot-entry';
    li.innerHTML = `<span class="sim-log-dot-icon">${icon}</span>`
        + `<span class="sim-log-dot-label">${dotTypeName} ${tickIndex + 1}/${totalTicks}</span>`
        + `<span class="sim-log-dmg sim-log-dot-dmg">−${formatNumber(tickDamage)}</span>`
        + healthText;
    simLogEl.appendChild(li);
    simLogEl.scrollTop = simLogEl.scrollHeight;
}

/* ── DoT Animation ── */

function cancelDotAnimation() {
    if (dotAnimationTimer) {
        clearTimeout(dotAnimationTimer);
        dotAnimationTimer = null;
    }
    isDotAnimating = false;
    simBarFillEl.classList.remove('sim-dot-fire', 'sim-dot-poison', 'sim-dot-spirit');
}

function playDotAnimation(dotBreakdown) {
    // Collect all ticks from all DoT types into a unified timeline
    const allTicks = [];
    for (const [dotKey, dotData] of Object.entries(dotBreakdown)) {
        if (dotData.total <= 0 || dotData.ticks.length === 0) continue;
        const dotTypeName = dotKey.charAt(0).toUpperCase() + dotKey.slice(1);
        const totalTicks = dotData.ticks.length;
        dotData.ticks.forEach((tick, index) => {
            allTicks.push({
                dotKey,
                dotTypeName,
                tickIndex: index,
                totalTicks,
                tickDamage: tick.damage,
                gameTime: tick.time,
            });
        });
    }

    if (allTicks.length === 0) return;

    // Sort by game time
    allTicks.sort((a, b) => a.gameTime - b.gameTime);

    const dotSpeed = parseFloat(dotSpeedSliderEl.value) || DEFAULTS.dotSpeed;
    isDotAnimating = true;
    renderHitSimulator();

    let tickIndex = 0;
    let activeDotCssClass = '';

    function applyNextTick() {
        if (tickIndex >= allTicks.length || !simState || simState.currentHealth <= 0) {
            cancelDotAnimation();
            renderHitSimulator();
            return;
        }

        const tick = allTicks[tickIndex];

        // Switch bar color to match the current tick's damage type
        const nextDotCssClass = DOT_CSS_CLASSES[tick.dotKey] || '';
        if (nextDotCssClass !== activeDotCssClass) {
            if (activeDotCssClass) simBarFillEl.classList.remove(activeDotCssClass);
            if (nextDotCssClass) simBarFillEl.classList.add(nextDotCssClass);
            activeDotCssClass = nextDotCssClass;
        }

        simState.currentHealth = Math.max(0, simState.currentHealth - tick.tickDamage);
        appendDotTickLogEntry(tick.dotTypeName, tick.tickIndex, tick.totalTicks, tick.tickDamage, simState.currentHealth);
        renderHitSimulator();

        tickIndex++;

        if (tickIndex < allTicks.length && simState.currentHealth > 0) {
            const nextTick = allTicks[tickIndex];
            const delay = ((nextTick.gameTime - tick.gameTime) / dotSpeed) * 1000;
            dotAnimationTimer = setTimeout(applyNextTick, Math.max(delay, 50));
        } else {
            cancelDotAnimation();
            renderHitSimulator();
        }
    }

    // First tick is instant (game time 0)
    applyNextTick();
}

/* ── Combat Arena Animation ── */
let arenaCleanupTimer = null;
let arenaReactionTimer = null;

const ARENA_ANIMATION_CLASSES = Object.freeze([
    'arena-animating',
    'arena-hit-no-shield',
    'arena-hit-block',
    'arena-hit-parry',
    'arena-stagger',
    'arena-shield-break',
    'arena-death',
    'arena-parry-flash',
    'arena-mob-stagger',
]);

function resetArenaAnimations() {
    if (arenaCleanupTimer) {
        clearTimeout(arenaCleanupTimer);
        arenaCleanupTimer = null;
    }
    if (arenaReactionTimer) {
        clearTimeout(arenaReactionTimer);
        arenaReactionTimer = null;
    }
    arenaMobEl.classList.remove('arena-animating');
    arenaMobEl.classList.remove('arena-mob-stagger');
    arenaProjectileEl.classList.remove('arena-animating');
    ARENA_ANIMATION_CLASSES.forEach(className => {
        arenaPlayerEl.classList.remove(className);
        simArenaEl.classList.remove(className);
    });
}

function resetArenaDeathState() {
    arenaPlayerEl.classList.remove('arena-dead');
}

function triggerCombatAnimation(scenarioKey, isStaggered, isDead) {
    resetArenaAnimations();
    resetArenaDeathState();
    void arenaPlayerEl.offsetWidth;

    arenaMobEl.classList.add('arena-animating');
    arenaProjectileEl.classList.add('arena-animating');

    const playerHitClass = {
        noShield: 'arena-hit-no-shield',
        block:    'arena-hit-block',
        parry:    'arena-hit-parry',
    }[scenarioKey] || 'arena-hit-no-shield';

    const reactionDelay = 267;
    const isShieldScenario = scenarioKey === 'block' || scenarioKey === 'parry';

    if (isShieldScenario) {
        arenaPlayerShieldEl.src = scenarioKey === 'parry' ? SHIELD_IMAGE_PARRY : SHIELD_IMAGE_BLOCK;
    }

    arenaReactionTimer = setTimeout(() => {
        arenaReactionTimer = null;
        if (isDead) {
            arenaPlayerEl.classList.add('arena-death');
        } else if (isStaggered) {
            arenaPlayerEl.classList.add(playerHitClass);
            arenaPlayerEl.classList.add('arena-stagger');
            if (isShieldScenario) {
                arenaPlayerEl.classList.add('arena-shield-break');
            }
        } else {
            arenaPlayerEl.classList.add(playerHitClass);
        }
        if (scenarioKey === 'parry' && !isStaggered && !isDead) {
            simArenaEl.classList.add('arena-parry-flash');
            arenaMobEl.classList.add('arena-mob-stagger');
        }
    }, reactionDelay);

    const totalDuration = isDead ? 1600 : isStaggered ? 1733 : 1200;
    arenaCleanupTimer = setTimeout(() => {
        resetArenaAnimations();
        if (isDead) {
            arenaPlayerEl.classList.add('arena-dead');
        }
        arenaCleanupTimer = null;
    }, totalDuration);
}

/* ── Form persistence ── */
function applyForm(values) {
    // Damage types
    if (values.damageTypes) {
        setDamageTypesInUi(values.damageTypes);
    } else if (values.baseDamage != null) {
        // Legacy: baseDamage → Blunt
        setDamageTypesInUi({ Blunt: values.baseDamage });
    } else {
        setDamageTypesInUi(DEFAULTS.damageTypes);
    }

    // Mob preset
    const savedMobPresetId = values.mobPreset ?? DEFAULTS.mobPreset;
    mobPresetEl.value = savedMobPresetId;
    const savedMobPreset = flatMobPresets.find(preset => preset._id === savedMobPresetId);
    if (savedMobPreset) {
        mobPresetTriggerTextEl.textContent = savedMobPreset._label;
        let triggerIcon = mobPresetTriggerEl.querySelector('.mob-preset-trigger-icon');
        if (!triggerIcon) {
            triggerIcon = document.createElement('img');
            triggerIcon.className = 'mob-preset-trigger-icon';
            mobPresetTriggerEl.insertBefore(triggerIcon, mobPresetTriggerTextEl);
        }
        triggerIcon.src = `src/assets/images/presets/mobs/${savedMobPreset._mobPrefab}.png`;
        triggerIcon.hidden = false;
    } else if (savedMobPresetId === '') {
        mobPresetTriggerTextEl.textContent = 'Custom';
        const triggerIcon = mobPresetTriggerEl.querySelector('.mob-preset-trigger-icon');
        if (triggerIcon) triggerIcon.hidden = true;
    } else {
        mobPresetTriggerTextEl.textContent = '— Select a mob attack —';
        const triggerIcon = mobPresetTriggerEl.querySelector('.mob-preset-trigger-icon');
        if (triggerIcon) triggerIcon.hidden = true;
    }

    const starLevelValue = String(values.starLevel ?? DEFAULTS.starLevel);
    for (const radio of starLevelRadios()) radio.checked = radio.value === starLevelValue;
    setExtraDamageInUi(values);
    const difficultyValue = values.difficulty ?? DEFAULTS.difficulty;
    for (const radio of difficultyRadios()) radio.checked = radio.value === difficultyValue;
    maxHealthEl.value = values.maxHealth ?? DEFAULTS.maxHealth;
    setResistanceModifiersInUi(values.resistanceModifiers ?? DEFAULTS.resistanceModifiers);
    blockingSkillEl.value = values.blockingSkill ?? DEFAULTS.blockingSkill;
    blockArmorEl.value = values.blockArmor ?? DEFAULTS.blockArmor;
    armorEl.value = values.armor ?? DEFAULTS.armor;
    syncParryMultiplierUi(values);
    percentileInputEl.value = values.percentile ?? DEFAULTS.percentile;
    const savedShieldPrefab = values.shieldPreset ?? DEFAULTS.shieldPreset;
    shieldPresetEl.value = savedShieldPrefab;
    // Sync shield trigger display
    const savedShield = shieldPresets.find(shield => shield.prefab === savedShieldPrefab);
    if (savedShield) {
        shieldPresetTriggerTextEl.textContent = savedShield.item_name;
        let triggerIcon = shieldPresetTriggerEl.querySelector('.shield-preset-trigger-icon');
        if (!triggerIcon) {
            triggerIcon = document.createElement('img');
            triggerIcon.className = 'shield-preset-trigger-icon';
            shieldPresetTriggerEl.insertBefore(triggerIcon, shieldPresetTriggerTextEl);
        }
        triggerIcon.src = `src/assets/images/presets/shields/${savedShield.prefab}.png`;
        triggerIcon.hidden = false;
    } else {
        shieldPresetTriggerTextEl.textContent = 'Custom';
        const triggerIcon = shieldPresetTriggerEl.querySelector('.shield-preset-trigger-icon');
        if (triggerIcon) triggerIcon.hidden = true;
    }
    setShieldQuality(values.shieldQuality ?? DEFAULTS.shieldQuality);
    dotSpeedSliderEl.value = values.dotSpeed ?? DEFAULTS.dotSpeed;
    dotSpeedValueEl.textContent = `${dotSpeedSliderEl.value}×`;
    syncShieldUi();
}

function collectInputs() {
    const { parryMultiplierMode, percentile, shieldPreset, shieldQuality, dotSpeed, ...requestInputs } = collectFormState();
    return requestInputs;
}

function getPercentile() {
    const inputValue = parseFloat(percentileInputEl.value);
    if (!Number.isFinite(inputValue) || inputValue < 1 || inputValue > 100) return DEFAULTS.percentile;
    return Math.round(inputValue * 10) / 10;
}

function getPercentileRngOpts() {
    const percentile = getPercentile();
    if (percentile >= 100) return {};
    return { rng: getPercentileRng(percentile / 100) };
}

function saveForm() {
    localStorage.setItem(LS_FORM, JSON.stringify(collectFormState()));
}

function resetForm() {
    applyForm(DEFAULTS);
    localStorage.removeItem(LS_FORM);
    results.style.display = 'none';
    errBox.style.display = 'none';
    formulaDetailsEl.hidden = true;
    formulaDetailsEl.open = false;
    initHitSimulator();
}

function loadSavedForm(fallback = DEFAULTS) {
    try {
        const saved = JSON.parse(localStorage.getItem(LS_FORM));
        applyForm(saved ?? fallback);
    } catch {
        applyForm(fallback);
    }
}

/* ── Mob presets ── */
let mobAttackData = {};
let flatMobPresets = [];

function extractMobFields(preset) {
    const damageTypes = {};
    for (const typeName of DAMAGE_TYPE_NAMES) {
        if (preset[typeName] != null && preset[typeName] > 0) {
            damageTypes[typeName] = preset[typeName];
        }
    }
    return { damageTypes, mobPrefab: preset._mobPrefab, mobIconFile: preset._mobIconFile };
}

function populateMobPresets(data) {
    mobAttackData = data;
    flatMobPresets = [];

    const biomeOrder = ['Meadows', 'Black Forest', 'Ocean', 'Swamp', 'Mountain', 'Plains', 'Mistlands', 'Ashlands', 'Boss', 'Miniboss', 'Passive'];
    const biomes = biomeOrder.filter(biome => data[biome]);

    mobPresetListEl.innerHTML = '';

    for (const biome of biomes) {
        const biomeHeader = document.createElement('div');
        biomeHeader.className = 'mob-preset-biome-header';
        biomeHeader.textContent = biome;
        mobPresetListEl.appendChild(biomeHeader);

        const mobs = data[biome];
        for (const mob of mobs) {
            // Mob sub-header with icon and name
            const mobHeader = document.createElement('div');
            mobHeader.className = 'mob-preset-mob-header';
            mobHeader.dataset.searchText = mob.mob_name.toLowerCase();

            const mobIconImg = document.createElement('img');
            mobIconImg.className = 'mob-preset-mob-icon';
            mobIconImg.src = `src/assets/images/presets/mobs/${mob.prefab}.png`;
            mobIconImg.alt = mob.mob_name;
            mobIconImg.loading = 'lazy';

            const mobNameSpan = document.createElement('span');
            mobNameSpan.className = 'mob-preset-mob-name';
            mobNameSpan.textContent = mob.mob_name;

            mobHeader.appendChild(mobIconImg);
            mobHeader.appendChild(mobNameSpan);
            mobPresetListEl.appendChild(mobHeader);

            for (const attack of mob.attacks) {
                const typeEntries = DAMAGE_TYPE_NAMES
                    .filter(typeName => attack[typeName] > 0)
                    .map(typeName => `${attack[typeName]} ${typeName}`);
                const typeSummary = typeEntries.join(' + ');
                const label = `${mob.mob_name} — ${attack.attack_name} (${typeSummary})`;
                const attackLabel = `${attack.attack_name} (${typeSummary})`;

                const flatPreset = {
                    ...attack,
                    _id: attack.attack_type,
                    _label: label,
                    _mobPrefab: mob.prefab,
                    _mobIconFile: mob.icon_file,
                };
                flatMobPresets.push(flatPreset);

                const row = document.createElement('div');
                row.className = 'mob-preset-option';
                row.dataset.value = attack.attack_type;
                row.dataset.searchText = `${mob.mob_name} ${attack.attack_name} ${typeSummary}`.toLowerCase();
                row.dataset.mobPrefab = mob.prefab;

                const textSpan = document.createElement('span');
                textSpan.className = 'mob-preset-option-text';
                textSpan.textContent = attackLabel;

                row.appendChild(textSpan);
                mobPresetListEl.appendChild(row);
            }
        }
    }
}

/* ── Custom mob preset dropdown behaviour ── */
function openMobPresetDropdown() {
    mobPresetPanelEl.hidden = false;
    mobPresetDropdownEl.classList.add('open');
    mobPresetSearchEl.value = '';
    filterMobPresetList('');
    mobPresetSearchEl.focus();
}

function closeMobPresetDropdown() {
    mobPresetPanelEl.hidden = true;
    mobPresetDropdownEl.classList.remove('open');
}

function filterMobPresetList(query) {
    const lowerQuery = query.toLowerCase().trim();

    let currentBiomeHeader = null;
    let isMobNameMatch = false;
    let biomeHasVisibleMob = false;

    for (const child of mobPresetListEl.children) {
        if (child.classList.contains('mob-preset-biome-header')) {
            if (currentBiomeHeader) currentBiomeHeader.hidden = !biomeHasVisibleMob;
            currentBiomeHeader = child;
            biomeHasVisibleMob = false;
        } else if (child.classList.contains('mob-preset-mob-header')) {
            isMobNameMatch = !lowerQuery || child.dataset.searchText.includes(lowerQuery);
            child.hidden = !isMobNameMatch;
            if (isMobNameMatch) biomeHasVisibleMob = true;
        } else if (child.classList.contains('mob-preset-option')) {
            child.hidden = !isMobNameMatch;
        }
    }
    // Finalize last biome
    if (currentBiomeHeader) currentBiomeHeader.hidden = !biomeHasVisibleMob;
}

function selectMobPreset(attackId) {
    mobPresetEl.value = attackId;
    const preset = flatMobPresets.find(preset => preset._id === attackId);
    if (preset) {
        mobPresetTriggerTextEl.textContent = preset._label;
        // Show icon in trigger
        let triggerIcon = mobPresetTriggerEl.querySelector('.mob-preset-trigger-icon');
        if (!triggerIcon) {
            triggerIcon = document.createElement('img');
            triggerIcon.className = 'mob-preset-trigger-icon';
            mobPresetTriggerEl.insertBefore(triggerIcon, mobPresetTriggerTextEl);
        }
        triggerIcon.src = `src/assets/images/presets/mobs/${preset._mobPrefab}.png`;
        triggerIcon.alt = '';
        triggerIcon.hidden = false;
    } else {
        mobPresetTriggerTextEl.textContent = '— Select a mob attack —';
        const triggerIcon = mobPresetTriggerEl.querySelector('.mob-preset-trigger-icon');
        if (triggerIcon) triggerIcon.hidden = true;
    }
    closeMobPresetDropdown();
    // Dispatch change event
    mobPresetEl.dispatchEvent(new Event('change'));
}

function clearMobPreset() {
    if (!mobPresetEl.value) return;
    mobPresetEl.value = '';
    mobPresetTriggerTextEl.textContent = 'Custom';
    const triggerIcon = mobPresetTriggerEl.querySelector('.mob-preset-trigger-icon');
    if (triggerIcon) triggerIcon.hidden = true;
    saveForm();
}

function clearShieldPreset() {
    if (!shieldPresetEl.value) return;
    shieldPresetEl.value = '';
    shieldPresetTriggerTextEl.textContent = 'Custom';
    const triggerIcon = shieldPresetTriggerEl.querySelector('.shield-preset-trigger-icon');
    if (triggerIcon) triggerIcon.hidden = true;
    setShieldQualityDisabled(true);
    saveForm();
}

/* ── Submit ── */
form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errBox.style.display = 'none';
    const formState = collectFormState();
    const requestInputs = collectInputs();

    try {
        const data = await calculate(requestInputs, getPercentileRngOpts());
        render(data, formState);
    } catch (error) {
        errBox.textContent = 'Error: ' + error.message;
        errBox.style.display = 'block';
        results.style.display = 'none';
    }
});

/* ── Rendering ── */
function formatNumber(value) {
    return Number(value).toFixed(2);
}

function formatDamageTypeBadgesHtml(damageMap) {
    if (!damageMap) return '';
    const badges = DAMAGE_TYPE_NAMES
        .filter(typeName => (damageMap[typeName] || 0) > 0.01)
        .map(typeName => `<span class="damage-type-badge ${DAMAGE_TYPE_CLASSES[typeName] || ''}">${DAMAGE_TYPE_ICONS[typeName] || ''} ${formatNumber(damageMap[typeName])}</span>`)
        .join('');
    return badges ? `<span class="damage-type-badges">${badges}</span>` : '';
}

const DOT_TYPE_DEFINITIONS = [
    { key: 'fire',   icon: '🔥', label: 'Fire',   fixedDuration: 5 },
    { key: 'spirit', icon: '👻', label: 'Spirit', fixedDuration: 3 },
    { key: 'poison', icon: '☠',  label: 'Poison', fixedDuration: null },
];

function getActiveDotTypes(scenarios) {
    const activeTypes = [];
    for (const dotType of DOT_TYPE_DEFINITIONS) {
        const isActive = scenarios.some(scenario => scenario.dotBreakdown[dotType.key].total > 0.01);
        if (isActive) activeTypes.push(dotType);
    }
    return activeTypes;
}

function formatSingleDotTotal(dotData, icon) {
    if (dotData.total > 0.01) {
        if (dotData.ticks.length === 0) {
            return `<div class="dot-line">${icon} 0</div>`;
        }
        return `<div class="dot-line">${icon} ${formatNumber(dotData.total)}</div>`;
    }
    return '<div class="dot-line"><span class="stagger-no">—</span></div>';
}

function formatSingleDotTicks(dotData, icon, fixedDuration) {
    if (dotData.total <= 0.01) return '<div class="dot-line"><span class="stagger-no">—</span></div>';
    const ticks = dotData.ticks;
    if (ticks.length === 0) {
        return `<div class="dot-line">${icon} 0</div>`;
    }
    const duration = fixedDuration ?? (ticks.length > 0 ? Math.round(ticks[ticks.length - 1].time + 1) : 0);
    return `<div class="dot-line">${icon} ${ticks.length} ticks over ${duration}s</div>`;
}

function formatDotTotalCell(dotBreakdown, activeDotTypes) {
    return activeDotTypes.map(dotType =>
        formatSingleDotTotal(dotBreakdown[dotType.key], dotType.icon)
    ).join('');
}

function formatDotTicksCell(dotBreakdown, activeDotTypes) {
    return activeDotTypes.map(dotType =>
        formatSingleDotTicks(dotBreakdown[dotType.key], dotType.icon, dotType.fixedDuration)
    ).join('');
}

function staggerState(scenario) {
    if (scenario.stagger === 'YES') {
        const isShielded = scenario.scenarioName === 'Block' || scenario.scenarioName === 'Parry';
        if (isShielded) {
            return '<span class="stagger-yes">yes</span> <span class="tip-wrap"><i class="tip-icon">?</i><span class="tip-text">→ Block armor damage reduction was not applied.</span></span>';
        }
        return '<span class="stagger-yes">yes</span>';
    }
    return '<span class="stagger-no">no</span>';
}

function render(data, inputs) {
    const scenarios = [data.noShield, data.block, data.parry];

    columnEls[0].textContent = data.noShield.scenarioName;
    columnEls[1].textContent = data.block.scenarioName;
    columnEls[2].textContent = data.parry.scenarioName;

    const baseDamage = data.baseDamage;
    const effectiveDamage = data.effectiveDamage;
    const scaledEffectiveDamage = data.scaledEffectiveDamage;
    const percentile = getPercentile();
    const hasPercentile = percentile < 100;

    const diffBonus = { NORMAL: 0, HARD: 50, VERY_HARD: 100 }[inputs.difficulty] ?? 0;
    const starBonus = inputs.starLevel * 50;
    const extraDamagePercent = resolveExtraDamagePercentValue(inputs);
    const totalBonus = diffBonus + starBonus + extraDamagePercent;
    const parts = [];
    const difficultyLabel = { NORMAL: 'Normal', HARD: 'Hard', VERY_HARD: 'Very Hard' }[inputs.difficulty] ?? 'Normal';
    if (diffBonus) parts.push(`${difficultyLabel} +${diffBonus}%`);
    if (starBonus) parts.push(`${inputs.starLevel}★ +${starBonus}%`);
    if (extraDamagePercent) parts.push(`Extra +${formatPercent(extraDamagePercent)}%`);

    damageSummaryEl.innerHTML = parts.length
        ? `Damage modifier: <span>${parts.join(' | ')}  (+${totalBonus}% total)</span>`
        : 'No damage modifier';

    const percentileBadge = hasPercentile
        ? ` <span class="percentile-badge">${percentile}th percentile (×${formatNumber(Math.sqrt(getPercentileRng(percentile / 100)))})</span>`
        : '';

    if (hasPercentile) {
        modifierLineEl.innerHTML = effectiveDamage !== baseDamage
            ? `Scaled Effective Damage = ${formatNumber(baseDamage)} → ${formatNumber(effectiveDamage)} → <span>${formatNumber(scaledEffectiveDamage)}</span>${percentileBadge}`
            : `Scaled Effective Damage = ${formatNumber(baseDamage)} → <span>${formatNumber(scaledEffectiveDamage)}</span>${percentileBadge}`;
    } else {
        modifierLineEl.innerHTML = effectiveDamage !== baseDamage
            ? `Effective Damage = ${formatNumber(baseDamage)} → <span>${formatNumber(effectiveDamage)}</span>`
            : `Effective Damage = <span>${formatNumber(baseDamage)}</span>`;
    }

    // Remove any leftover toggle button from previous render
    const existingToggle = document.getElementById('breakdownToggleBtn');
    if (existingToggle) existingToggle.remove();

    // Check if there are any DoT types in the attack
    const hasDoT = scenarios.some(scenario =>
        scenario.dotBreakdown.fire.total > 0.001 ||
        scenario.dotBreakdown.spirit.total > 0.001 ||
        scenario.dotBreakdown.poison.total > 0.001
    );

    const BLOCK_TIP = hasPercentile
        ? 'Remaining damage after the block armor damage reduction is applied to the scaled effective damage — before resistance modifiers are factored in.'
        : 'Remaining damage after the block armor damage reduction is applied to the effective damage — before resistance modifiers are factored in.';
    const RESISTANCE_TIP = 'Remaining damage after resistance modifiers are applied — before body armor is factored in.';
    const FINAL_TIP = 'The final damage after the body armor damage reduction is applied to the resistance-reduced damage.';
    const makeTooltipLabel = (label, text) => `${label} <span class="tip-wrap"><i class="tip-icon">?</i><span class="tip-text">${text}</span></span>`;

    const hasResistance = Object.keys(inputs.resistanceModifiers || {}).length > 0;

    const rows = [
        { label: makeTooltipLabel('Block-Reduced Damage', BLOCK_TIP), fn: scenario => formatNumber(scenario.blockReducedDamage) },
    ];

    if (hasResistance) {
        rows.push({
            label: makeTooltipLabel('Resistance-Reduced Damage', RESISTANCE_TIP),
            fn: scenario => formatNumber(scenario.resistanceReducedDamage),
        });
    }

    rows.push(
        { label: makeTooltipLabel('Final Damage', FINAL_TIP), fn: scenario => formatNumber(scenario.finalReducedDamage) },
    );

    if (hasDoT) {
        rows.push({
            label: makeTooltipLabel('Instant Damage', 'Physical + Frost + Lightning damage applied immediately to health.'),
            fn: scenario => formatNumber(scenario.instantDamage),
        });

        const activeDotTypes = getActiveDotTypes(scenarios);

        rows.push({
            label: 'DoT Damage',
            fn: scenario => formatDotTotalCell(scenario.dotBreakdown, activeDotTypes),
        });
        rows.push({
            label: 'DoT Ticks',
            fn: scenario => formatDotTicksCell(scenario.dotBreakdown, activeDotTypes),
        });
    }

    rows.push({
        label: 'Remaining Health',
        fn: scenario => {
            if (scenario.remainingHealth <= 0) {
                return `<span class="skull-wrap tip-wrap"><span class="skull-icon">💀</span><span class="tip-text">${formatNumber(scenario.remainingHealth)}</span></span>`;
            }
            return formatNumber(scenario.remainingHealth);
        },
    });
    rows.push({ label: 'Staggered', fn: scenario => staggerState(scenario) });
    rows.push({
        label: 'Min Health to Avoid Stagger',
        fn: scenario => {
            if (scenario.minHealthForNoStagger === 0) {
                return '<span class="stagger-no">Immune</span>';
            }
            const isSafe = inputs.maxHealth >= scenario.minHealthForNoStagger;
            const className = isSafe ? 'health-safe' : 'health-warning';
            return `<span class="${className}">${scenario.minHealthForNoStagger}</span>`;
        },
    });

    tbodyEl.innerHTML = rows.map(row => {
        if (!row) return '<tr class="divider"><td colspan="4"></td></tr>';
        const cells = scenarios.map(scenario => `<td>${row.fn(scenario)}</td>`).join('');
        return `<tr><td>${row.label}</td>${cells}</tr>`;
    }).join('');


    results.style.display = 'block';
    renderFormula(data, inputs);
    syncSimMaxHealth();
}

/* ── Formula breakdown ── */
function renderFormula(data, inputs) {
    const baseDamage = data.baseDamage;
    const effectiveDamage = data.effectiveDamage;
    const diffBonus = { NORMAL: 0, HARD: 0.5, VERY_HARD: 1.0 }[inputs.difficulty] ?? 0;
    const starBonus = inputs.starLevel * 0.5;
    const extraDamagePercent = resolveExtraDamagePercentValue(inputs);
    const extraBonus = extraDamagePercent / 100;
    const totalMultiplier = 1 + diffBonus + starBonus + extraBonus;
    const staggerBar = inputs.maxHealth * 0.4;
    const parryMultiplier = resolveParryMultiplierValue(inputs);
    const skillFactor = 1 + 0.005 * inputs.blockingSkill;

    function armorBranch(damage, armor) {
        const isLinear = armor < damage / 2;
        const result = isLinear ? damage - armor : (damage * damage) / (armor * 4);
        return { isLinear, result };
    }

    function stepLabelContent(prefix, name) {
        return `${prefix}${name}`;
    }

    function stepLabel(prefix, name) {
        return `<div class="f-step-label">${stepLabelContent(prefix, name)}</div>`;
    }

    function hoverFormula(content, tooltip, className = '') {
        const classAttribute = className ? ` class="${className}"` : '';
        return `<span class="tip-wrap f-hover-wrap" tabindex="0"><span${classAttribute}>${content}</span><span class="tip-text">${tooltip}</span></span>`;
    }

    function hoverResult(value, tooltip, extraClass = '') {
        const classNames = ['f-hover-result', extraClass].filter(Boolean).join(' ');
        return hoverFormula(`<strong class="${classNames}">${value}</strong>`, tooltip);
    }

    function hoverDecision(text, tooltip) {
        return hoverFormula(text, tooltip, 'f-hover-decision');
    }

    function staggerWarning(tooltip) {
        return `<div class="f-stagger-warn">⚠ ${hoverFormula('Player is staggered', tooltip, 'f-hover-warning')}</div>`;
    }

    function thresholdTooltip(armorLabel, damageLabel, armor, damage, isLinear) {
        const equalityNote = Math.abs(armor - (damage / 2)) < 1e-9
            ? '<br>Because the check is strict (&lt;), an exact tie still uses the quadratic branch.'
            : '';
        return `Rule: if ${armorLabel} &lt; ${damageLabel} ÷ 2, use the linear reduction.<br>`
            + 'Otherwise, use the quadratic reduction.<br>'
            + `${isLinear
                ? 'Chosen branch: reducedDamage = damage − armor'
                : 'Chosen branch: reducedDamage = damage² ÷ (armor × 4)'}`
            + equalityNote;
    }

    const bonusExpression = `1 + ${diffBonus} + ${starBonus} + (${formatNumber(extraDamagePercent)} ÷ 100)`;
    const percentile = getPercentile();
    const hasPercentile = percentile < 100;
    const rngValue = hasPercentile ? getPercentileRng(percentile / 100) : null;
    const rngFactor = rngValue !== null ? Math.sqrt(rngValue) : null;
    const scaledEffectiveDamage = hasPercentile ? data.scaledEffectiveDamage : effectiveDamage;
    const effectiveDamageLabel = hasPercentile ? 'Scaled Effective Damage' : 'Effective Damage';

    // Show per-type base damage breakdown
    const baseDamageMapHtml = formatDamageTypeBadgesHtml(data.baseDamageMap);
    const typeBreakdownLine = baseDamageMapHtml
        ? `<div class="f-eq f-type-badges">Base damage: ${baseDamageMapHtml}</div>`
        : '';

    let step1Html;
    if (hasPercentile) {
        step1Html = `
        <div class="f-shared-label">${stepLabelContent('1 — ', effectiveDamageLabel)}
            <span class="f-shared-note">(all scenarios)</span>
        </div>
        ${typeBreakdownLine}
        <div class="f-eq">${formatNumber(baseDamage)} × (${bonusExpression}) = ${formatNumber(baseDamage)} × ${formatNumber(totalMultiplier)} = ${hoverResult(
            formatNumber(effectiveDamage),
            `effectiveDamage = baseDamage × (1 + difficultyBonus + starLevel × 0.5 + extraDamagePercent ÷ 100)<br>${formatNumber(baseDamage)} × (1 + ${diffBonus} + ${starBonus} + (${formatNumber(extraDamagePercent)} ÷ 100)) = ${formatNumber(baseDamage)} × ${formatNumber(totalMultiplier)} = ${formatNumber(effectiveDamage)}`
        )}</div>
        <div class="f-eq">${formatNumber(effectiveDamage)} × √${formatNumber(rngValue)} = ${formatNumber(effectiveDamage)} × ${formatNumber(rngFactor)} = ${hoverResult(
            formatNumber(scaledEffectiveDamage),
            `${percentile}th percentile: scaledEffectiveDamage = effectiveDamage × √rng<br>rng = 0.75 + 0.25 × ${percentile / 100} = ${formatNumber(rngValue)}<br>${formatNumber(effectiveDamage)} × √${formatNumber(rngValue)} = ${formatNumber(effectiveDamage)} × ${formatNumber(rngFactor)} = ${formatNumber(scaledEffectiveDamage)}`
        )} <span class="percentile-badge">${percentile}th pctl</span></div>`;
    } else {
        step1Html = `
        <div class="f-shared-label">${stepLabelContent('1 — ', effectiveDamageLabel)}
            <span class="f-shared-note">(all scenarios)</span>
        </div>
        ${typeBreakdownLine}
        <div class="f-eq">${formatNumber(baseDamage)} × (${bonusExpression}) = ${formatNumber(baseDamage)} × ${formatNumber(totalMultiplier)} = ${hoverResult(
            formatNumber(effectiveDamage),
            `effectiveDamage = baseDamage × (1 + difficultyBonus + starLevel × 0.5 + extraDamagePercent ÷ 100)<br>${formatNumber(baseDamage)} × (1 + ${diffBonus} + ${starBonus} + (${formatNumber(extraDamagePercent)} ÷ 100)) = ${formatNumber(baseDamage)} × ${formatNumber(totalMultiplier)} = ${formatNumber(effectiveDamage)}`
        )}</div>`;
    }

    function buildProportionalBreakdown(beforeMap, afterMap, totalBefore, totalAfter, beforeLabel, afterLabel) {
        const ratio = totalBefore > 0 ? totalAfter / totalBefore : 0;
        const activeTypes = DAMAGE_TYPE_NAMES.filter(typeName => (beforeMap[typeName] || 0) > 0.01);
        if (activeTypes.length <= 1) return '';
        return activeTypes.map(typeName => {
            const icon = DAMAGE_TYPE_ICONS[typeName] || '';
            const before = beforeMap[typeName] || 0;
            const after = afterMap[typeName] || 0;
            const formula = `${afterLabel}${typeName}Damage = ${beforeLabel}${typeName}Damage × (${afterLabel}Damage ÷ ${beforeLabel}Damage)`;
            const equation = `${formatNumber(before)} × (${formatNumber(totalAfter)} ÷ ${formatNumber(totalBefore)}) = ${formatNumber(before)} × ${formatNumber(ratio)} = ${formatNumber(after)}`;
            const tooltip = `${formula}<br>${equation}`;
            return `<div class="f-eq">${icon} ${formatNumber(before)} → ${hoverResult(formatNumber(after), tooltip)}</div>`;
        }).join('');
    }

    function buildCol(scenario, scenarioData) {
        const isShield = scenario !== 'noShield';
        const isParry = scenario === 'parry';
        const effectiveBlockArmor = isShield ? inputs.blockArmor * skillFactor * (isParry ? parryMultiplier : 1) : 0;
        const inputDamageMap = hasPercentile ? data.scaledDamageMap : data.effectiveDamageMap;

        let step2;
        if (!isShield) {
            step2 = `<div class="f-step">
                ${stepLabel('2 — ', 'Effective Block Armor')}
                <div class="f-skipped">No shield — step skipped</div>
            </div>`;
        } else {
            const parryLine = isParry
                ? `<div class="f-eq">${formatNumber(inputs.blockArmor)} × ${formatNumber(skillFactor)} × ${parryMultiplier} = ${hoverResult(
                    formatNumber(effectiveBlockArmor),
                    `effectiveBlockArmor = blockArmor × (1 + 0.005 × blockingSkill) × parryMultiplier<br>${formatNumber(inputs.blockArmor)} × (1 + 0.005 × ${inputs.blockingSkill}) × ${parryMultiplier} = ${formatNumber(inputs.blockArmor)} × ${formatNumber(skillFactor)} × ${parryMultiplier} = ${formatNumber(effectiveBlockArmor)}`
                )}</div>`
                : `<div class="f-eq">${formatNumber(inputs.blockArmor)} × ${formatNumber(skillFactor)} = ${hoverResult(
                    formatNumber(effectiveBlockArmor),
                    `effectiveBlockArmor = blockArmor × (1 + 0.005 × blockingSkill)<br>${formatNumber(inputs.blockArmor)} × (1 + 0.005 × ${inputs.blockingSkill}) = ${formatNumber(inputs.blockArmor)} × ${formatNumber(skillFactor)} = ${formatNumber(effectiveBlockArmor)}`
                )}</div>`;
            const formulaLine = isParry
                ? `<div class="f-eq">${formatNumber(inputs.blockArmor)} × (1 + 0.005 × ${inputs.blockingSkill}) × ${parryMultiplier}</div>${parryLine}`
                : `<div class="f-eq">${formatNumber(inputs.blockArmor)} × (1 + 0.005 × ${inputs.blockingSkill})</div>${parryLine}`;
            step2 = `<div class="f-step">
                ${stepLabel('2 — ', 'Effective Block Armor')}
                ${formulaLine}
            </div>`;
        }

        let step3;
        if (!isShield) {
            step3 = `<div class="f-step">
                ${stepLabel('3 — ', 'Block Reduced Damage')}
                <div class="f-skipped">No shield — step skipped</div>
            </div>`;
        } else {
            const { isLinear: isBlockLinear, result: afterBlock } = armorBranch(scaledEffectiveDamage, effectiveBlockArmor);
            const halfEffectiveDamage = scaledEffectiveDamage / 2;
            const yesNo = effectiveBlockArmor < halfEffectiveDamage ? 'YES' : 'NO';
            const branch = isBlockLinear ? 'linear' : 'quadratic';
            const staggeredOnBlock = afterBlock > staggerBar;
            const damageVarName = hasPercentile ? 'scaledEffectiveDamage' : 'effectiveDamage';

            let body;
            const check = `<div class="f-branch-check">${formatNumber(effectiveBlockArmor)} &lt; ${formatNumber(scaledEffectiveDamage)} ÷ 2 (= ${formatNumber(halfEffectiveDamage)})? ${hoverDecision(
                `${yesNo} → ${branch}`,
                thresholdTooltip('effectiveBlockArmor', damageVarName, effectiveBlockArmor, scaledEffectiveDamage, isBlockLinear)
            )}</div>`;

            const afterBlockMap = scenarioData.damageBreakdown.afterBlock;
            const effectiveLabel = hasPercentile ? 'scaledEffective' : 'effective';
            const blockBreakdownHtml = afterBlockMap
                ? buildProportionalBreakdown(inputDamageMap, afterBlockMap, scaledEffectiveDamage, scenarioData.blockReducedDamage, effectiveLabel, 'blockReduced')
                : '';

            if (staggeredOnBlock) {
                const compared = isBlockLinear
                    ? `${formatNumber(scaledEffectiveDamage)} − ${formatNumber(effectiveBlockArmor)} = ${hoverResult(formatNumber(afterBlock), `blockReducedDamage = ${damageVarName} − effectiveBlockArmor`)}`
                    : `${formatNumber(scaledEffectiveDamage)}² ÷ (${formatNumber(effectiveBlockArmor)} × 4) = ${hoverResult(formatNumber(afterBlock), `blockReducedDamage = ${damageVarName}² ÷ (effectiveBlockArmor × 4)`)}`;
                body = `${check}
                    <div class="f-eq">${compared}</div>
                    ${staggerWarning(`Block-reduced damage compared to stagger threshold: ${formatNumber(afterBlock)} &gt; ${formatNumber(staggerBar)} (= 40% of ${formatNumber(inputs.maxHealth)} max health) → block bypassed.`)}
                    <div class="f-eq">After Block → ${hoverResult(formatNumber(scenarioData.blockReducedDamage), 'The player was staggered, so block armor damage reduction was not applied.')}</div>`;
            } else if (isBlockLinear) {
                body = `${check}
                    <div class="f-eq">${formatNumber(scaledEffectiveDamage)} − ${formatNumber(effectiveBlockArmor)} = ${hoverResult(formatNumber(afterBlock), `blockReducedDamage = ${damageVarName} − effectiveBlockArmor`)}</div>
                    ${blockBreakdownHtml}`;
            } else {
                body = `${check}
                    <div class="f-eq">${formatNumber(scaledEffectiveDamage)}² ÷ (${formatNumber(effectiveBlockArmor)} × 4) = ${hoverResult(formatNumber(afterBlock), `blockReducedDamage = ${damageVarName}² ÷ (effectiveBlockArmor × 4)`)}</div>
                    ${blockBreakdownHtml}`;
            }

            step3 = `<div class="f-step">
                ${stepLabel('3 — ', 'Block Reduced Damage')}
                ${body}
            </div>`;
        }

        // Resistance modifiers step
        const hasResistance = Object.keys(inputs.resistanceModifiers || {}).length > 0;
        let stepResistance = '';
        let nextStepNumber = 4;
        if (hasResistance) {
            const resistanceParts = [];
            for (const [typeName, multiplier] of Object.entries(inputs.resistanceModifiers)) {
                const percent = Math.round(multiplier * 100);
                const icon = DAMAGE_TYPE_ICONS[typeName] || '';
                resistanceParts.push(`<div class="f-eq f-resistance-line">${icon} ${typeName}: ×${formatNumber(multiplier)} (${percent}%)</div>`);
            }

            // Build per-type formula for the tooltip
            const formulaLines = [];
            for (const [typeName, multiplier] of Object.entries(inputs.resistanceModifiers)) {
                const typeNameLower = typeName.charAt(0).toLowerCase() + typeName.slice(1);
                formulaLines.push(`resistanceReduced${typeName}Damage = blockReduced${typeName}Damage × ${typeNameLower}ResistanceMultiplier`);
            }
            const resistanceTooltip = formulaLines.join('<br>');

            stepResistance = `<div class="f-step">
                ${stepLabel('4 — ', 'Resistance Reduced Damage')}
                ${resistanceParts.join('')}
                <div class="f-eq">After Resistance → ${hoverResult(formatNumber(scenarioData.resistanceReducedDamage), resistanceTooltip)}</div>
            </div>`;
            nextStepNumber = 5;
        }

        // Body armor uses resistance-reduced damage (or block-reduced if no resistance)
        const armorInputDamage = hasResistance ? scenarioData.resistanceReducedDamage : scenarioData.blockReducedDamage;
        const armorInputLabel = hasResistance ? 'resistanceReducedDamage' : 'blockReducedDamage';
        const armorInputMap = hasResistance
            ? scenarioData.damageBreakdown.afterResistance
            : (isShield && scenarioData.damageBreakdown.afterBlock
                ? scenarioData.damageBreakdown.afterBlock
                : inputDamageMap);
        const afterArmorMap = scenarioData.damageBreakdown.afterArmor;
        const { isLinear: isArmorLinear } = armorBranch(armorInputDamage, inputs.armor);
        const halfArmorInputDamage = armorInputDamage / 2;
        const armorYesNo = inputs.armor < halfArmorInputDamage ? 'YES' : 'NO';
        const armorBranchName = isArmorLinear ? 'linear' : 'quadratic';
        const armorCheck = `<div class="f-branch-check">${formatNumber(inputs.armor)} &lt; ${formatNumber(armorInputDamage)} ÷ 2 (= ${formatNumber(halfArmorInputDamage)})? ${hoverDecision(
            `${armorYesNo} → ${armorBranchName}`,
            thresholdTooltip('armor', armorInputLabel, inputs.armor, armorInputDamage, isArmorLinear)
        )}</div>`;

        const armorBeforeLabel = hasResistance ? 'resistanceReduced' : (isShield ? 'blockReduced' : (hasPercentile ? 'scaledEffective' : 'effective'));
        const armorBreakdownHtml = buildProportionalBreakdown(armorInputMap, afterArmorMap, armorInputDamage, scenarioData.finalReducedDamage, armorBeforeLabel, 'armorReduced');

        let armorBody;
        if (isArmorLinear) {
            armorBody = `${armorCheck}
                <div class="f-eq">${formatNumber(armorInputDamage)} − ${formatNumber(inputs.armor)} = ${hoverResult(formatNumber(scenarioData.finalReducedDamage), `finalDamage = ${armorInputLabel} − armor`)}</div>
                ${armorBreakdownHtml}`;
        } else {
            armorBody = `${armorCheck}
                <div class="f-eq">${formatNumber(armorInputDamage)}² ÷ (${formatNumber(inputs.armor)} × 4) = ${hoverResult(formatNumber(scenarioData.finalReducedDamage), `finalDamage = ${armorInputLabel}² ÷ (armor × 4)`)}</div>
                ${armorBreakdownHtml}`;
        }

        if (!isShield && scenarioData.stagger === 'YES') {
            armorBody += `
                ${staggerWarning(`Final damage compared to stagger threshold: ${formatNumber(scenarioData.finalReducedDamage)} &gt; ${formatNumber(staggerBar)} (= 40% of ${formatNumber(inputs.maxHealth)} max health).`)}`;
        }

        const stepArmor = `<div class="f-step">
            ${stepLabel(`${nextStepNumber} — `, 'Armor Reduced Damage')}
            ${armorBody}
        </div>`;
        nextStepNumber++;

        // Damage over time step (only shown if there are DoT types)
        const hasDot = scenarioData.dotBreakdown.fire.total > 0.001 ||
                       scenarioData.dotBreakdown.spirit.total > 0.001 ||
                       scenarioData.dotBreakdown.poison.total > 0.001;
        let stepDot = '';
        if (hasDot) {
            const afterArmor = scenarioData.damageBreakdown.afterArmor;
            const afterBlock = scenarioData.damageBreakdown.afterBlock;
            const afterResistance = scenarioData.damageBreakdown.afterResistance;
            const isShieldScenario = scenario !== 'noShield';

            function buildDotTotalTooltip(typeName) {
                const effectiveValue = hasPercentile
                    ? data.scaledDamageMap[typeName]
                    : data.effectiveDamageMap[typeName];
                const effectiveLabel = hasPercentile ? 'scaledEffective' : 'effective';
                const lines = [`${effectiveLabel}${typeName}Damage = ${formatNumber(effectiveValue)}`];
                if (isShieldScenario && afterBlock) {
                    lines.push(`After block: ${formatNumber(afterBlock[typeName])}`);
                }
                if (hasResistance) {
                    lines.push(`After resistance: ${formatNumber(afterResistance[typeName])}`);
                }
                lines.push(`After armor: ${formatNumber(afterArmor[typeName])}`);
                return lines.join('<br>');
            }

            const dotParts = [];
            if (scenarioData.dotBreakdown.fire.total > 0.001) {
                const fireTicks = scenarioData.dotBreakdown.fire.ticks;
                const fireTotal = hoverResult(formatNumber(scenarioData.dotBreakdown.fire.total), buildDotTotalTooltip('Fire'));
                if (fireTicks.length === 0) {
                    dotParts.push(`🔥 Fire: ${fireTotal} → 0 (per-tick ${formatNumber(scenarioData.dotBreakdown.fire.total / 5)} below 0.2 threshold)`);
                } else {
                    dotParts.push(`🔥 Fire: ${fireTotal} → ${fireTicks.length} ticks over 5s`);
                }
            }
            if (scenarioData.dotBreakdown.spirit.total > 0.001) {
                const spiritTicks = scenarioData.dotBreakdown.spirit.ticks;
                const spiritTotal = hoverResult(formatNumber(scenarioData.dotBreakdown.spirit.total), buildDotTotalTooltip('Spirit'));
                if (spiritTicks.length === 0) {
                    dotParts.push(`👻 Spirit: ${spiritTotal} → 0 (per-tick ${formatNumber(scenarioData.dotBreakdown.spirit.total / 3)} below 0.2 threshold)`);
                } else {
                    dotParts.push(`👻 Spirit: ${spiritTotal} → ${spiritTicks.length} ticks over 3s`);
                }
            }
            if (scenarioData.dotBreakdown.poison.total > 0.001) {
                const poisonTicks = scenarioData.dotBreakdown.poison.ticks;
                const poisonTotal = hoverResult(formatNumber(scenarioData.dotBreakdown.poison.total), buildDotTotalTooltip('Poison'));
                if (poisonTicks.length === 0) {
                    dotParts.push(`☠ Poison: ${poisonTotal} → 0 (per-tick below 0.2 threshold)`);
                } else {
                    const poisonDuration = poisonTicks[poisonTicks.length - 1].time + 1;
                    dotParts.push(`☠ Poison: ${poisonTotal} → ${poisonTicks.length} ticks over ${Math.round(poisonDuration)}s`);
                }
            }
            let instantLine = '';
            if (scenarioData.instantDamage > 0.001) {
                const instantTypes = ['Blunt', 'Slash', 'Pierce', 'Frost', 'Lightning'];
                const instantParts = instantTypes
                    .filter(typeName => (afterArmor[typeName] || 0) > 0.001)
                    .map(typeName => `${typeName}: ${formatNumber(afterArmor[typeName])}`);
                const instantTooltip = `Sum of non-DoT types after armor:<br>${instantParts.join('<br>')}`;
                const instantValue = hoverResult(formatNumber(scenarioData.instantDamage), instantTooltip);
                instantLine = `<div class="f-eq f-dot-extraction">Instant: ${instantValue} HP immediately</div>`;
            }
            stepDot = `<div class="f-step">
                ${stepLabel(`${nextStepNumber} — `, 'Damage Breakdown')}
                ${instantLine}
                ${dotParts.map(part => `<div class="f-eq f-dot-extraction">${part}</div>`).join('')}
            </div>`;
            nextStepNumber++;
        }

        const stepHealth = `<div class="f-step">
            ${stepLabel(`${nextStepNumber} — `, 'Remaining Health')}
            <div class="f-eq">${formatNumber(inputs.maxHealth)} − ${formatNumber(scenarioData.finalReducedDamage)} = ${hoverResult(
                formatNumber(scenarioData.remainingHealth),
                `remainingHealth = maxHealth − finalDamage<br>${formatNumber(inputs.maxHealth)} − ${formatNumber(scenarioData.finalReducedDamage)} = ${formatNumber(scenarioData.remainingHealth)}`,
                scenarioData.remainingHealth <= 0 ? 'f-dead' : ''
            )}</div>
        </div>`;

        return `<div class="f-col">
            <div class="f-col-title">${scenarioData.scenarioName}</div>
            ${step2}${step3}${stepResistance}${stepArmor}${stepDot}${stepHealth}
        </div>`;
    }

    formulaEl.innerHTML = `
        <div class="f-shared">${step1Html}</div>
        <div class="f-cols">
            ${buildCol('noShield', data.noShield)}
            ${buildCol('block', data.block)}
            ${buildCol('parry', data.parry)}
        </div>`;

    formulaDetailsEl.hidden = false;
    formulaDetailsEl.open = true;
}

/* ── Initialize ── */
async function initialize() {
    initTooltipClamping();

    // Load mob attacks
    let mobData = {};
    try {
        const response = await fetch('./src/data/mob-attacks.json?v=9');
        if (response.ok) mobData = await response.json();
        populateMobPresets(mobData);
    } catch (error) {
        console.warn('Failed to load mob-attacks.json', error);
    }

    // Load shield presets
    try {
        const response = await fetch('./src/data/shields.json?v=9');
        if (response.ok) {
            const shields = await response.json();
            populateShieldPresets(shields);
        }
    } catch (error) {
        console.warn('Failed to load shields.json', error);
    }

    // Load saved form or defaults
    const firstVisitDefaults = DEFAULTS;
    loadSavedForm(firstVisitDefaults);

    form.addEventListener('input', saveForm);

    for (const radio of difficultyRadios()) radio.addEventListener('change', initHitSimulator);
    maxHealthEl.addEventListener('input', syncSimMaxHealth);
    resetBtnEl.addEventListener('click', resetForm);

    addExtraDamageBtnEl.addEventListener('click', () => {
        addExtraDamageRow(0);
        const input = extraDamageInputsEl.querySelector('.extra-damage-value');
        if (input) { input.focus(); input.select(); }
        saveForm();
    });

    parryPresetEl.addEventListener('change', () => {
        if (parryPresetEl.value === 'custom') {
            syncParryMultiplierUi({
                parryMultiplier: sanitizeParryMultiplier(parryCustomInputEl.value),
                parryMultiplierMode: 'custom',
            });
            parryCustomInputEl.focus();
            parryCustomInputEl.select();
        } else {
            syncParryMultiplierUi({
                parryMultiplier: sanitizeParryMultiplier(parryPresetEl.value),
                parryMultiplierMode: 'preset',
            });
        }
        clearShieldPreset();
        saveForm();
    });

    // Mob preset change (fired by hidden input via selectMobPreset)
    mobPresetEl.addEventListener('change', () => {
        const selectedId = mobPresetEl.value;
        if (!selectedId) return;
        const preset = flatMobPresets.find(preset => preset._id === selectedId);
        if (preset) {
            const { damageTypes } = extractMobFields(preset);
            setDamageTypesInUi(damageTypes);
            saveForm();
        }
    });

    // Custom mob preset dropdown events
    mobPresetTriggerEl.addEventListener('click', () => {
        if (mobPresetDropdownEl.classList.contains('open')) {
            closeMobPresetDropdown();
        } else {
            openMobPresetDropdown();
        }
    });

    mobPresetListEl.addEventListener('click', (event) => {
        const option = event.target.closest('.mob-preset-option');
        if (option) {
            selectMobPreset(option.dataset.value);
        }
    });

    mobPresetSearchEl.addEventListener('input', () => {
        filterMobPresetList(mobPresetSearchEl.value);
    });

    // Close on Escape
    mobPresetSearchEl.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeMobPresetDropdown();
        }
    });

    // Shield preset change (fired by hidden input via selectShieldPreset)
    shieldPresetEl.addEventListener('change', () => {
        syncShieldUi();
        saveForm();
    });

    // Custom shield preset dropdown events
    shieldPresetTriggerEl.addEventListener('click', () => {
        if (shieldPresetDropdownEl.classList.contains('open')) {
            closeShieldPresetDropdown();
        } else {
            openShieldPresetDropdown();
        }
    });

    shieldPresetListEl.addEventListener('click', (event) => {
        const option = event.target.closest('.shield-preset-option');
        if (option) {
            selectShieldPreset(option.dataset.value);
        }
    });

    // Close dropdowns on outside click
    document.addEventListener('click', (event) => {
        if (!mobPresetDropdownEl.contains(event.target)) {
            closeMobPresetDropdown();
        }
        if (!shieldPresetDropdownEl.contains(event.target)) {
            closeShieldPresetDropdown();
        }
    });

    shieldQualityRadios().forEach(radio => {
        radio.addEventListener('change', () => {
            syncShieldUi();
            saveForm();
        });
    });

    // Damage type inputs
    addDamageTypeBtnEl.addEventListener('click', () => {
        addDamageTypeRow();
        clearMobPreset();
        saveForm();
    });
    // Delegate remove button clicks and value/type changes in damage type rows
    damageTypeInputsEl.addEventListener('click', (event) => {
        if (event.target.classList.contains('damage-type-remove')) {
            event.target.closest('.damage-type-row').remove();
            clearMobPreset();
            saveForm();
        }
    });
    damageTypeInputsEl.addEventListener('input', (event) => {
        if (event.target.classList.contains('damage-type-value')) {
            clearMobPreset();
        }
    });
    damageTypeInputsEl.addEventListener('change', (event) => {
        if (event.target.classList.contains('damage-type-select')) {
            clearMobPreset();
        }
    });

    // Resistance type inputs
    addResistanceTypeBtnEl.addEventListener('click', () => {
        addResistanceTypeRow();
        saveForm();
    });
    resistanceTypeInputsEl.addEventListener('input', () => saveForm());
    resistanceTypeInputsEl.addEventListener('change', () => saveForm());

    // Clear shield preset when user manually edits block armor or parry
    blockArmorEl.addEventListener('input', () => clearShieldPreset());
    parryCustomInputEl.addEventListener('input', () => clearShieldPreset());

    // DoT speed slider
    dotSpeedSliderEl.addEventListener('input', () => {
        dotSpeedValueEl.textContent = `${dotSpeedSliderEl.value}×`;
        saveForm();
    });

    // Hit simulator
    function performHit(useRng) {
        if (!simState || simState.currentHealth <= 0 || isDotAnimating) return;
        simErrorEl.hidden = true;
        try {
            const rngOptions = useRng ? { rng: sampleRng() } : {};
            const inputs = collectInputs();
            const data = calculate(inputs, rngOptions);
            const key = getSelectedSimScenario();
            const scenarioData = data[key];
            const damage = scenarioData.instantDamage;
            const totalDamage = scenarioData.finalReducedDamage;
            const staggered = scenarioData.stagger === 'YES';
            const exactRemainingHealth = simState.currentHealth - damage;
            simState.currentHealth = Math.max(0, simState.currentHealth - damage);
            simState.hitCount += 1;
            const rngFactor = rngOptions.rng !== undefined ? Math.sqrt(rngOptions.rng) : null;
            appendSimLogEntry(simState.hitCount, key, damage, simState.currentHealth, staggered, exactRemainingHealth, rngFactor);
            renderHitSimulator();
            triggerCombatAnimation(key, staggered, simState.currentHealth <= 0);

            // Start DoT animation if there are DoT ticks
            if (simState.currentHealth > 0) {
                const hasDot = scenarioData.dotBreakdown.fire.total > 0.001 ||
                               scenarioData.dotBreakdown.spirit.total > 0.001 ||
                               scenarioData.dotBreakdown.poison.total > 0.001;
                if (hasDot) {
                    playDotAnimation(scenarioData.dotBreakdown);
                }
            }
        } catch (error) {
            simErrorEl.textContent = 'Error: ' + error.message;
            simErrorEl.hidden = false;
        }
    }

    simTakeHitBtnEl.addEventListener('click', () => performHit(false));
    simRandomHitBtnEl.addEventListener('click', () => performHit(true));

    simResetBtnEl.addEventListener('click', () => {
        cancelDotAnimation();
        initHitSimulator();
    });

    simClearLogBtnEl.addEventListener('click', () => {
        simLogEl.innerHTML = '';
    });

    simScenarioRadios().forEach(radio => {
        radio.addEventListener('change', () => renderHitSimulator());
    });

    document.querySelectorAll('.tab-btn').forEach(button => {
        button.addEventListener('click', () => switchTab(button.dataset.tab));
    });

    initHitSimulator();
}

initialize();

