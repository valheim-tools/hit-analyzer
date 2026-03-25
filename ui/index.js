import { calculate, sampleRng, getPercentileRng } from './damage-calculator.js?v=9';
import { initTooltipClamping } from './mobile.js?v=9';

/* ── Constants ── */
const DEFAULTS = Object.freeze({
    rawDamage: 60,
    starLevel: 0,
    difficulty: 'NORMAL',
    maxHealth: 120,
    blockingSkill: 15,
    blockArmor: 28,
    armor: 45,
    parryMultiplier: 2.5,
    extraDamagePercent: 0,
    extraDamageEnabled: 'no',
    percentile: 100,
});
const LS_FORM = 'valheim-form';
const LEGACY_PARRY_MULTIPLIERS = { X1: 1, X1_5: 1.5, X2: 2, X2_5: 2.5, X4: 4, X6: 6 };
const PARRY_MULTIPLIER_PRESETS = [1, 1.5, 2, 2.5, 4, 6];

const form = document.getElementById('calcForm');
const errBox = document.getElementById('error');
const results = document.getElementById('results');
const formulaDetailsEl = document.getElementById('formulaDetails');
const formulaEl = document.getElementById('formula');
const rawSummaryEl = document.getElementById('rawSummary');
const modifierLineEl = document.getElementById('modifierLine');
const tbodyEl = document.getElementById('tbody');
const columnEls = [
    document.getElementById('col0'),
    document.getElementById('col1'),
    document.getElementById('col2'),
];
const rawDamageEl = document.getElementById('rawDamage');
const starLevelEl = document.getElementById('starLevel');
const difficultyEl = document.getElementById('difficulty');
const maxHealthEl = document.getElementById('maxHealth');
const blockingSkillEl = document.getElementById('blockingSkill');
const blockArmorEl = document.getElementById('blockArmor');
const armorEl = document.getElementById('armor');
const extraDamageToggleEl = document.getElementById('extraDamageEnabled');
const extraDamageFieldEl = document.getElementById('customExtraDamageField');
const extraDamageInputEl = document.getElementById('extraDamagePercent');
const parryPresetEl = document.getElementById('parryMultiplierPreset');
const parryCustomFieldEl = document.getElementById('customParryMultiplierField');
const parryCustomInputEl = document.getElementById('parryMultiplier');
const resetBtnEl = document.getElementById('resetBtn');
const mobPresetEl = document.getElementById('mobPreset');
const simRandomHitBtnEl = document.getElementById('simRandomHitBtn');
const percentileInputEl = document.getElementById('percentileInput');

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
const hitSimulatorEl      = document.getElementById('hitSimulator');
const simTakeHitBtnEl     = document.getElementById('simTakeHitBtn');
const simResetBtnEl       = document.getElementById('simResetBtn');
const simClearLogBtnEl    = document.getElementById('simClearLogBtn');
const simBarFillEl        = document.getElementById('simBarFill');
const simHealthCurrentEl      = document.getElementById('simHealthCurrent');
const simHealthMaxEl          = document.getElementById('simHealthMax');
const simDeathIconEl      = document.getElementById('simDeathIcon');
const simErrorEl          = document.getElementById('simError');
const simLogEl            = document.getElementById('simLog');
const simScenarioRadios   = () => document.querySelectorAll('input[name="simScenario"]');

function sanitizeExtraDamagePercent(value, fallback = DEFAULTS.extraDamagePercent) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function resolveExtraDamagePercentValue(values = {}) {
    if (values.extraDamagePercent != null && values.extraDamagePercent !== '') {
        return sanitizeExtraDamagePercent(values.extraDamagePercent);
    }
    if (values.extraDamage != null && values.extraDamage !== '') {
        return sanitizeExtraDamagePercent(values.extraDamage);
    }
    return DEFAULTS.extraDamagePercent;
}

function resolveExtraDamageMode(values = {}) {
    if (values.extraDamageEnabled === 'yes' || values.extraDamageEnabled === 'no') {
        return values.extraDamageEnabled;
    }
    return resolveExtraDamagePercentValue(values) > 0 ? 'yes' : 'no';
}

function syncExtraDamageUi(values = {}) {
    const percent = resolveExtraDamagePercentValue(values);
    const enabled = resolveExtraDamageMode(values) === 'yes';
    extraDamageToggleEl.value = enabled ? 'yes' : 'no';
    extraDamageFieldEl.hidden = !enabled;
    extraDamageInputEl.disabled = !enabled;
    if (enabled || !extraDamageInputEl.value || values === DEFAULTS) {
        extraDamageInputEl.value = percent;
    }
}

function getExtraDamagePercentFromUi() {
    if (extraDamageToggleEl.value !== 'yes') {
        return 0;
    }
    return sanitizeExtraDamagePercent(extraDamageInputEl.value);
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
    const normalized = sanitizeExtraDamagePercent(value, 0);
    return Number.isInteger(normalized) ? normalized.toFixed(0) : String(parseFloat(normalized.toFixed(3)));
}

function resolveParryMultiplierMode(values = {}) {
    if (values.parryMultiplierMode === 'custom') {
        return 'custom';
    }
    if (values.parryMultiplierMode === 'preset') {
        return 'preset';
    }
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

function collectFormState() {
    return {
        rawDamage: parseFloat(rawDamageEl.value),
        starLevel: parseInt(starLevelEl.value, 10),
        extraDamagePercent: getExtraDamagePercentFromUi(),
        extraDamageEnabled: extraDamageToggleEl.value,
        difficulty: difficultyEl.value,
        maxHealth: parseFloat(maxHealthEl.value),
        blockingSkill: parseFloat(blockingSkillEl.value),
        blockArmor: parseFloat(blockArmorEl.value),
        armor: parseFloat(armorEl.value),
        parryMultiplier: getParryMultiplierFromUi(),
        parryMultiplierMode: parryPresetEl.value === 'custom' ? 'custom' : 'preset',
        percentile: percentileInputEl.value,
    };
}

/* ── Hit Simulator state ── */
let simState = null; // { maxHealth, currentHealth, hitCount }

function getSelectedSimScenario() {
    for (const radio of simScenarioRadios()) {
        if (radio.checked) return radio.value;
    }
    return 'noShield';
}

const SIM_SCENARIO_LABELS = { noShield: 'No Shield', block: 'Block', parry: 'Parry' };

/**
 * Initialise (or re-initialise) the simulator from the current form values.
 * Full reset: HP restored, hit count zeroed, log cleared.
 */
function initHitSimulator() {
    const maxHealth = parseFloat(maxHealthEl.value) || 0;
    simState = { maxHealth, currentHealth: maxHealth, hitCount: 0 };
    simLogEl.innerHTML = '';
    simErrorEl.hidden = true;
    renderHitSimulator();
}

/**
 * Update the simulator's max-health WITHOUT resetting health, hit count, or
 * the hit log.  If no hits have been taken yet, current health follows max health.
 */
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

    simTakeHitBtnEl.disabled = isDead;
    simRandomHitBtnEl.disabled = isDead;
}

function appendSimLogEntry(hitNumber, scenarioKey, damage, healthAfter, staggered, rawHealthAfter, rngFactor = null) {
    const isDead = healthAfter <= 0;
    const healthText = isDead
        ? `<span class="sim-log-hp sim-log-dead tip-wrap">0.000 💀<span class="tip-text">${formatNumber(rawHealthAfter)}</span></span>`
        : `<span class="sim-log-hp">${formatNumber(healthAfter)} HP</span>`;
    const staggerBadge = staggered ? `<span class="sim-log-stagger">⚠ Staggered</span>` : '';
    const scenarioLabel = SIM_SCENARIO_LABELS[scenarioKey] ?? scenarioKey;
    const factorBadge = rngFactor !== null
        ? `<span class="sim-log-factor" title="RNG factor: ×${formatNumber(rngFactor)} (rng=${formatNumber(rngFactor * rngFactor)})">×${formatNumber(rngFactor)}</span>`
        : '';

    const li = document.createElement('li');
    li.className = 'sim-log-entry';
    li.innerHTML = `<span class="sim-log-hit-num">Hit #${hitNumber}</span>`
        + `<span class="sim-log-scenario">[${scenarioLabel}]</span>`
        + `<span class="sim-log-dmg">−${formatNumber(damage)}</span>`
        + factorBadge
        + healthText
        + staggerBadge;
    simLogEl.appendChild(li);
    simLogEl.scrollTop = simLogEl.scrollHeight;
}

/* ── Form persistence ── */
function applyForm(values) {
    rawDamageEl.value = values.rawDamage ?? DEFAULTS.rawDamage;
    starLevelEl.value = values.starLevel ?? DEFAULTS.starLevel;
    syncExtraDamageUi(values);
    difficultyEl.value = values.difficulty ?? DEFAULTS.difficulty;
    maxHealthEl.value = values.maxHealth ?? DEFAULTS.maxHealth;
    blockingSkillEl.value = values.blockingSkill ?? DEFAULTS.blockingSkill;
    blockArmorEl.value = values.blockArmor ?? DEFAULTS.blockArmor;
    armorEl.value = values.armor ?? DEFAULTS.armor;
    syncParryMultiplierUi(values);
    percentileInputEl.value = values.percentile ?? DEFAULTS.percentile;
}

function collectInputs() {
    const { parryMultiplierMode, extraDamageEnabled, percentile, ...requestInputs } = collectFormState();
    return requestInputs;
}

function getPercentile() {
    const rawValue = parseInt(percentileInputEl.value, 10);
    return Number.isFinite(rawValue) && rawValue >= 1 && rawValue <= 100 ? rawValue : DEFAULTS.percentile;
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
function extractMobFields(preset) {
    return {
        rawDamage: preset.rawDamage,
    };
}

function populateMobPresets(presets) {
    presets.forEach(preset => {
        const option = document.createElement('option');
        option.value = preset.id;
        option.textContent = preset.label;
        mobPresetEl.appendChild(option);
    });
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
    return Number(value).toFixed(3);
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

    const baseRawDamage = data.baseRawDamage;
    const effectiveRawDamage = data.effectiveRawDamage;
    const scaledEffectiveRawDamage = data.scaledEffectiveRawDamage;
    const percentile = getPercentile();
    const hasPercentile = percentile < 100;

    const diffBonus = { NORMAL: 0, HARD: 50, VERY_HARD: 100 }[inputs.difficulty] ?? 0;
    const starBonus = inputs.starLevel * 50;
    const extraDamagePercent = resolveExtraDamagePercentValue(inputs);
    const totalBonus = diffBonus + starBonus + extraDamagePercent;
    const parts = [];
    const difficultyLabel = difficultyEl.selectedOptions[0].text.split(' —')[0];
    if (diffBonus) {
        parts.push(`${difficultyLabel} +${diffBonus}%`);
    }
    if (starBonus) {
        parts.push(`${inputs.starLevel}★ +${starBonus}%`);
    }
    if (extraDamagePercent) {
        parts.push(`Extra +${formatPercent(extraDamagePercent)}%`);
    }

    rawSummaryEl.innerHTML = parts.length
        ? `Damage modifier: <span>${parts.join(' | ')}  (+${totalBonus}% total)</span>`
        : 'No damage modifier';

    const percentileBadge = hasPercentile
        ? ` <span class="percentile-badge">${percentile}th percentile (×${formatNumber(Math.sqrt(getPercentileRng(percentile / 100)))})</span>`
        : '';

    if (hasPercentile) {
        modifierLineEl.innerHTML = effectiveRawDamage !== baseRawDamage
            ? `Effective Damage = ${formatNumber(baseRawDamage)} → ${formatNumber(effectiveRawDamage)} → <span>${formatNumber(scaledEffectiveRawDamage)}</span>${percentileBadge}`
            : `Effective Damage = ${formatNumber(baseRawDamage)} → <span>${formatNumber(scaledEffectiveRawDamage)}</span>${percentileBadge}`;
    } else {
        modifierLineEl.innerHTML = effectiveRawDamage !== baseRawDamage
            ? `Effective Damage = ${formatNumber(baseRawDamage)} → <span>${formatNumber(effectiveRawDamage)}</span>`
            : `Effective Damage = <span>${formatNumber(baseRawDamage)}</span>`;
    }

    const BLOCK_TIP = 'Remaining damage after the block armor damage reduction is applied to the effective raw damage — before body armor is factored in.';
    const FINAL_TIP = 'The final damage after the body armor damage reduction is applied to the block reduced damage.';
    const makeTooltipLabel = (label, text) => `${label} <span class="tip-wrap"><i class="tip-icon">?</i><span class="tip-text">${text}</span></span>`;
    const rows = [
        { label: makeTooltipLabel('Block-Reduced Damage', BLOCK_TIP), fn: scenario => formatNumber(scenario.blockReducedDamage) },
        { label: makeTooltipLabel('Final/Armor-Reduced Damage', FINAL_TIP), fn: scenario => formatNumber(scenario.finalReducedDamage) },
        {
            label: 'Remaining Health',
            fn: scenario => {
                if (scenario.remainingHealth <= 0) {
                    return `<span class="skull-wrap tip-wrap"><span class="skull-icon">💀</span><span class="tip-text">${formatNumber(scenario.remainingHealth)}</span></span>`;
                }
                return formatNumber(scenario.remainingHealth);
            },
        },
        null,
        { label: 'Staggered', fn: scenario => staggerState(scenario) },
        {
            label: 'Min Health to Avoid Stagger',
            fn: scenario => {
                if (scenario.minHealthForNoStagger === 0) {
                    return '<span class="stagger-no">Immune</span>';
                }
                const isSafe = inputs.maxHealth >= scenario.minHealthForNoStagger;
                const className = isSafe ? 'health-safe' : 'health-warning';
                return `<span class="${className}">${scenario.minHealthForNoStagger}</span>`;
            },
        },
    ];

    tbodyEl.innerHTML = rows.map(row => {
        if (!row) {
            return '<tr class="divider"><td colspan="4"></td></tr>';
        }
        const cells = scenarios.map(scenario => `<td>${row.fn(scenario)}</td>`).join('');
        return `<tr><td>${row.label}</td>${cells}</tr>`;
    }).join('');

    results.style.display = 'block';
    renderFormula(data, inputs);
    syncSimMaxHealth();
}

/* ── Formula breakdown ── */
function renderFormula(data, inputs) {
    const baseRawDamage = data.baseRawDamage;
    const effectiveRawDamage = data.effectiveRawDamage;
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
    const scaledEffectiveDamage = hasPercentile ? data.scaledEffectiveRawDamage : effectiveRawDamage;

    let step1Html;
    if (hasPercentile) {
        step1Html = `
        <div class="f-shared-label">${stepLabelContent('1 — ', 'Effective Damage')}
            <span class="f-shared-note">(all scenarios)</span>
        </div>
        <div class="f-eq">${formatNumber(baseRawDamage)} × (${bonusExpression}) = ${formatNumber(baseRawDamage)} × ${formatNumber(totalMultiplier)} = ${hoverResult(
            formatNumber(effectiveRawDamage),
            `effectiveDamage = rawDamage × (1 + difficultyBonus + starLevel × 0.5 + extraDamagePercent ÷ 100)<br>${formatNumber(baseRawDamage)} × (1 + ${diffBonus} + ${starBonus} + (${formatNumber(extraDamagePercent)} ÷ 100)) = ${formatNumber(baseRawDamage)} × ${formatNumber(totalMultiplier)} = ${formatNumber(effectiveRawDamage)}`
        )}</div>
        <div class="f-eq">${formatNumber(effectiveRawDamage)} × √${formatNumber(rngValue)} = ${formatNumber(effectiveRawDamage)} × ${formatNumber(rngFactor)} = ${hoverResult(
            formatNumber(scaledEffectiveDamage),
            `${percentile}th percentile: scaledEffective = effective × √rng<br>rng = 0.75 + 0.25 × ${percentile / 100} = ${formatNumber(rngValue)}<br>${formatNumber(effectiveRawDamage)} × √${formatNumber(rngValue)} = ${formatNumber(effectiveRawDamage)} × ${formatNumber(rngFactor)} = ${formatNumber(scaledEffectiveDamage)}`
        )} <span class="percentile-badge">${percentile}th pctl</span></div>`;
    } else {
        step1Html = `
        <div class="f-shared-label">${stepLabelContent('1 — ', 'Effective Damage')}
            <span class="f-shared-note">(all scenarios)</span>
        </div>
        <div class="f-eq">${formatNumber(baseRawDamage)} × (${bonusExpression}) = ${formatNumber(baseRawDamage)} × ${formatNumber(totalMultiplier)} = ${hoverResult(
            formatNumber(effectiveRawDamage),
            `effectiveDamage = rawDamage × (1 + difficultyBonus + starLevel × 0.5 + extraDamagePercent ÷ 100)<br>${formatNumber(baseRawDamage)} × (1 + ${diffBonus} + ${starBonus} + (${formatNumber(extraDamagePercent)} ÷ 100)) = ${formatNumber(baseRawDamage)} × ${formatNumber(totalMultiplier)} = ${formatNumber(effectiveRawDamage)}`
        )}</div>`;
    }

    function buildCol(scenario, scenarioData) {
        const isShield = scenario !== 'noShield';
        const isParry = scenario === 'parry';
        const effectiveBlockArmor = isShield ? inputs.blockArmor * skillFactor * (isParry ? parryMultiplier : 1) : 0;

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
                ${stepLabel('3 — ', 'Block Armor DMG Reduction')}
                <div class="f-skipped">No shield — step skipped</div>
            </div>`;
        } else {
            const { isLinear: isBlockLinear, result: afterBlock } = armorBranch(effectiveRawDamage, effectiveBlockArmor);
            const halfEffectiveDamage = effectiveRawDamage / 2;
            const yesNo = effectiveBlockArmor < halfEffectiveDamage ? 'YES' : 'NO';
            const branch = isBlockLinear ? 'linear' : 'quadratic';
            const staggeredOnBlock = afterBlock > staggerBar;

            let body;
            const check = `<div class="f-branch-check">${formatNumber(effectiveBlockArmor)} &lt; ${formatNumber(effectiveRawDamage)} ÷ 2 (= ${formatNumber(halfEffectiveDamage)})? ${hoverDecision(
                `${yesNo} → ${branch}`,
                thresholdTooltip('effectiveBlockArmor', 'effectiveDamage', effectiveBlockArmor, effectiveRawDamage, isBlockLinear)
            )}</div>`;

            if (staggeredOnBlock) {
                const compared = isBlockLinear
                    ? `${formatNumber(effectiveRawDamage)} − ${formatNumber(effectiveBlockArmor)} = ${hoverResult(
                        formatNumber(afterBlock),
                        `blockReducedDamage = effectiveDamage − effectiveBlockArmor<br>${formatNumber(effectiveRawDamage)} − ${formatNumber(effectiveBlockArmor)} = ${formatNumber(afterBlock)}`
                    )}`
                    : `${formatNumber(effectiveRawDamage)}² ÷ (${formatNumber(effectiveBlockArmor)} × 4) = ${hoverResult(
                        formatNumber(afterBlock),
                        `blockReducedDamage = effectiveDamage² ÷ (effectiveBlockArmor × 4)<br>${formatNumber(effectiveRawDamage)}² ÷ (${formatNumber(effectiveBlockArmor)} × 4) = ${formatNumber(afterBlock)}`
                    )}`;
                body = `${check}
                    <div class="f-eq">${compared}</div>
                    ${staggerWarning(`Compared to stagger threshold: block-reduced damage ${formatNumber(afterBlock)} &gt; ${formatNumber(staggerBar)} (= 40% of ${formatNumber(inputs.maxHealth)} max health) → block bypassed.`)}
                    <div class="f-eq">After Block → ${hoverResult(
                        formatNumber(scenarioData.blockReducedDamage),
                        'The player was staggered, so block armor damage reduction was not applied.'
                    )}</div>`;
            } else if (isBlockLinear) {
                body = `${check}
                    <div class="f-eq">${formatNumber(effectiveRawDamage)} − ${formatNumber(effectiveBlockArmor)} = ${hoverResult(
                        formatNumber(afterBlock),
                        `blockReducedDamage = effectiveDamage − effectiveBlockArmor<br>${formatNumber(effectiveRawDamage)} − ${formatNumber(effectiveBlockArmor)} = ${formatNumber(afterBlock)}`
                    )}</div>`;
            } else {
                body = `${check}
                    <div class="f-eq">${formatNumber(effectiveRawDamage)}² ÷ (${formatNumber(effectiveBlockArmor)} × 4) = ${hoverResult(
                        formatNumber(afterBlock),
                        `blockReducedDamage = effectiveDamage² ÷ (effectiveBlockArmor × 4)<br>${formatNumber(effectiveRawDamage)}² ÷ (${formatNumber(effectiveBlockArmor)} × 4) = ${formatNumber(afterBlock)}`
                    )}</div>`;
            }

            step3 = `<div class="f-step">
                ${stepLabel('3 — ', 'Block Armor DMG Reduction')}
                ${body}
            </div>`;
        }

        const { isLinear: isArmorLinear } = armorBranch(scenarioData.blockReducedDamage, inputs.armor);
        const halfBlockReducedDamage = scenarioData.blockReducedDamage / 2;
        const armorYesNo = inputs.armor < halfBlockReducedDamage ? 'YES' : 'NO';
        const armorBranchName = isArmorLinear ? 'linear' : 'quadratic';
        const armorCheck = `<div class="f-branch-check">${formatNumber(inputs.armor)} &lt; ${formatNumber(scenarioData.blockReducedDamage)} ÷ 2 (= ${formatNumber(halfBlockReducedDamage)})? ${hoverDecision(
            `${armorYesNo} → ${armorBranchName}`,
            thresholdTooltip('armor', 'blockReducedDamage', inputs.armor, scenarioData.blockReducedDamage, isArmorLinear)
        )}</div>`;

        let armorBody;
        if (isArmorLinear) {
            armorBody = `${armorCheck}
                <div class="f-eq">${formatNumber(scenarioData.blockReducedDamage)} − ${formatNumber(inputs.armor)} = ${hoverResult(
                    formatNumber(scenarioData.finalReducedDamage),
                    `finalDamage = blockReducedDamage − armor<br>${formatNumber(scenarioData.blockReducedDamage)} − ${formatNumber(inputs.armor)} = ${formatNumber(scenarioData.finalReducedDamage)}`
                )}</div>`;
        } else {
            armorBody = `${armorCheck}
                <div class="f-eq">${formatNumber(scenarioData.blockReducedDamage)}² ÷ (${formatNumber(inputs.armor)} × 4) = ${hoverResult(
                    formatNumber(scenarioData.finalReducedDamage),
                    `finalDamage = blockReducedDamage² ÷ (armor × 4)<br>${formatNumber(scenarioData.blockReducedDamage)}² ÷ (${formatNumber(inputs.armor)} × 4) = ${formatNumber(scenarioData.finalReducedDamage)}`
                )}</div>`;
        }

        if (!isShield && scenarioData.stagger === 'YES') {
            armorBody += `
                ${staggerWarning(`Compared to stagger threshold: final damage ${formatNumber(scenarioData.finalReducedDamage)} &gt; ${formatNumber(staggerBar)} (= 40% of ${formatNumber(inputs.maxHealth)} max health).`)}`;
        }

        const step4 = `<div class="f-step">
            ${stepLabel('4 — ', 'Body Armor DMG Reduction')}
            ${armorBody}
        </div>`;

        const step5 = `<div class="f-step">
            ${stepLabel('5 — ', 'Remaining Health')}
            <div class="f-eq">${formatNumber(inputs.maxHealth)} − ${formatNumber(scenarioData.finalReducedDamage)} = ${hoverResult(
                formatNumber(scenarioData.remainingHealth),
                `remainingHealth = maxHealth − finalDamage<br>${formatNumber(inputs.maxHealth)} − ${formatNumber(scenarioData.finalReducedDamage)} = ${formatNumber(scenarioData.remainingHealth)}`,
                scenarioData.remainingHealth <= 0 ? 'f-dead' : ''
            )}</div>
        </div>`;

        return `<div class="f-col">
            <div class="f-col-title">${scenarioData.scenarioName}</div>
            ${step2}${step3}${step4}${step5}
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

async function initialize() {
    initTooltipClamping();

    let presets = [];
    try {
        const response = await fetch('./mob-presets.json?v=7');
        if (response.ok) presets = await response.json();
        populateMobPresets(presets);
    } catch (error) {
        console.warn('Failed to load mob-presets.json', error);
    }

    const trollVertical = presets.find(p => p.id === 'troll-log-vertical');
    const firstVisitDefaults = trollVertical
        ? { ...DEFAULTS, ...extractMobFields(trollVertical) }
        : DEFAULTS;
    loadSavedForm(firstVisitDefaults);

    form.addEventListener('input', saveForm);

    // Only changing Game Difficulty resets the simulator (full reset).
    // Max Health changes update the health bar live without clearing the log.
    // All other fields can change mid-fight — the sim reads them on each hit.
    difficultyEl.addEventListener('change', initHitSimulator);
    maxHealthEl.addEventListener('input', syncSimMaxHealth);
    resetBtnEl.addEventListener('click', resetForm);
    extraDamageToggleEl.addEventListener('change', () => {
        if (extraDamageToggleEl.value === 'yes') {
            syncExtraDamageUi({
                extraDamagePercent: sanitizeExtraDamagePercent(extraDamageInputEl.value),
                extraDamageEnabled: 'yes',
            });
            extraDamageInputEl.focus();
            extraDamageInputEl.select();
        } else {
            syncExtraDamageUi({
                extraDamagePercent: 0,
                extraDamageEnabled: 'no',
            });
        }
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
        saveForm();
    });
    mobPresetEl.addEventListener('change', () => {
        const selectedId = mobPresetEl.value;
        if (!selectedId) return;
        const preset = presets.find(p => p.id === selectedId);
        if (preset) {
            applyForm({ ...collectFormState(), ...extractMobFields(preset) });
            saveForm();
        }
        mobPresetEl.value = '';
    });

    function performHit(useRng) {
        if (!simState || simState.currentHealth <= 0) return;
        simErrorEl.hidden = true;
        try {
            const rng = useRng ? sampleRng() : null;
            const data = calculate(collectInputs(), rng !== null ? { rng } : {});
            const key = getSelectedSimScenario();
            const scenarioData = data[key];
            const damage = scenarioData.finalReducedDamage;
            const staggered = scenarioData.stagger === 'YES';
            const rawHealthAfter = simState.currentHealth - damage;
            simState.currentHealth = Math.max(0, rawHealthAfter);
            simState.hitCount += 1;
            const rngFactor = rng !== null ? Math.sqrt(rng) : null;
            appendSimLogEntry(simState.hitCount, key, damage, simState.currentHealth, staggered, rawHealthAfter, rngFactor);
            renderHitSimulator();
        } catch (error) {
            simErrorEl.textContent = 'Error: ' + error.message;
            simErrorEl.hidden = false;
        }
    }

    simTakeHitBtnEl.addEventListener('click', () => performHit(false));
    simRandomHitBtnEl.addEventListener('click', () => performHit(true));

    simResetBtnEl.addEventListener('click', () => {
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

