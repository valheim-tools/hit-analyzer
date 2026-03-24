import { calculate } from './damage-calculator.js?v=6';
import { initTooltipClamping } from './mobile.js?v=6';

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

/* ── Tab DOM refs ── */
const tabSimulatorEl   = document.getElementById('tab-simulator');
const tabCalculatorEl  = document.getElementById('tab-calculator');

function switchTab(name) {
    const isSimulator = name === 'simulator';
    tabSimulatorEl.hidden  = !isSimulator;
    tabCalculatorEl.hidden = isSimulator;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        const active = btn.dataset.tab === name;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
}

/* ── Hit Simulator DOM refs ── */
const hitSimulatorEl      = document.getElementById('hitSimulator');
const simTakeHitBtnEl     = document.getElementById('simTakeHitBtn');
const simResetBtnEl       = document.getElementById('simResetBtn');
const simClearLogBtnEl    = document.getElementById('simClearLogBtn');
const simBarFillEl        = document.getElementById('simBarFill');
const simHpCurrentEl      = document.getElementById('simHpCurrent');
const simHpMaxEl          = document.getElementById('simHpMax');
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
    };
}

/* ── Hit Simulator state ── */
let simState = null; // { maxHealth, currentHp, hitCount }

function getSelectedSimScenario() {
    for (const radio of simScenarioRadios()) {
        if (radio.checked) return radio.value;
    }
    return 'noShield';
}

const SIM_SCENARIO_LABELS = { noShield: 'No Shield', block: 'Block', parry: 'Parry' };

/**
 * Initialise (or re-initialise) the simulator from the current form values.
 * Does NOT require Calculate to have been run first.
 */
function initHitSimulator() {
    const maxHp = parseFloat(maxHealthEl.value) || 0;
    simState = { maxHealth: maxHp, currentHp: maxHp, hitCount: 0 };
    simLogEl.innerHTML = '';
    simErrorEl.hidden = true;
    renderHitSimulator();
}

function renderHitSimulator() {
    if (!simState) return;
    const { maxHealth, currentHp } = simState;
    const isDead = currentHp <= 0;
    const pct = maxHealth > 0 ? Math.max(0, (currentHp / maxHealth) * 100) : 0;

    simHpMaxEl.textContent = fmt(maxHealth);
    simHpCurrentEl.textContent = isDead ? '0.000' : fmt(currentHp);
    simDeathIconEl.hidden = !isDead;

    simBarFillEl.style.width = pct + '%';
    simBarFillEl.classList.remove('sim-bar-warning', 'sim-bar-critical', 'sim-bar-dead');
    if (isDead) {
        simBarFillEl.classList.add('sim-bar-dead');
    } else if (pct <= 20) {
        simBarFillEl.classList.add('sim-bar-critical');
    } else if (pct <= 50) {
        simBarFillEl.classList.add('sim-bar-warning');
    }

    simTakeHitBtnEl.disabled = isDead;
}

function appendSimLogEntry(hitNum, scenarioKey, damage, hpAfter, staggered, rawHpAfter) {
    const isDead = hpAfter <= 0;
    const hpText = isDead
        ? `<span class="sim-log-hp sim-log-dead tip-wrap">0.000 💀<span class="tip-text">${fmt(rawHpAfter)}</span></span>`
        : `<span class="sim-log-hp">${fmt(hpAfter)} HP</span>`;
    const staggerBadge = staggered ? `<span class="sim-log-stagger">⚠ Staggered</span>` : '';
    const scenarioLabel = SIM_SCENARIO_LABELS[scenarioKey] ?? scenarioKey;

    const li = document.createElement('li');
    li.className = 'sim-log-entry';
    li.innerHTML = `<span class="sim-log-hit-num">Hit #${hitNum}</span>`
        + `<span class="sim-log-scenario">[${scenarioLabel}]</span>`
        + `<span class="sim-log-dmg">−${fmt(damage)}</span>`
        + hpText
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
}

function collectInputs() {
    const { parryMultiplierMode, extraDamageEnabled, ...requestInputs } = collectFormState();
    return requestInputs;
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
        rawDamage:          preset.rawDamage,
        starLevel:          preset.starLevel,
        difficulty:         preset.difficulty,
        extraDamagePercent: preset.extraDamagePercent ?? 0,
        extraDamageEnabled: preset.extraDamageEnabled ?? 'no',
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
        const data = await calculate(requestInputs);
        render(data, formState);
    } catch (error) {
        errBox.textContent = 'Error: ' + error.message;
        errBox.style.display = 'block';
        results.style.display = 'none';
    }
});

/* ── Rendering ── */
function fmt(n) {
    return Number(n).toFixed(3);
}

function staggerState(scenario) {
    if (scenario.stagger === 'YES') {
        const isShielded = scenario.scenarioName === 'Block' || scenario.scenarioName === 'Parry';
        if (isShielded) {
            return '<span class="stagger-yes">yes<span class="tip-wrap"><i class="tip-icon">?</i><span class="tip-text">-> Block armor damage reduction was not applied.</span></span></span>';
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

    const base = data.baseRawDamage;
    const effective = data.effectiveRawDamage;

    const diffBonus = { NORMAL: 0, HARD: 50, VERY_HARD: 100 }[inputs.difficulty] ?? 0;
    const starBonus = inputs.starLevel * 50;
    const extraDamagePercent = resolveExtraDamagePercentValue(inputs);
    const totalBonus = diffBonus + starBonus + extraDamagePercent;
    const parts = [];
    const diffLabel = difficultyEl.selectedOptions[0].text.split(' —')[0];
    if (diffBonus) {
        parts.push(`${diffLabel} +${diffBonus}%`);
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

    modifierLineEl.innerHTML = effective !== base
        ? `Effective Damage = ${fmt(base)} → <span>${fmt(effective)}</span>`
        : `Effective Damage = <span>${fmt(base)}</span>`;

    const BLOCK_TIP = 'Remaining damage after the block armor DMG reduction is applied to the effective raw damage — before body armor is factored in.';
    const FINAL_TIP = 'The final damage after the body armor damage reduction is applied to the block reduced damage.';
    const mkTip = text => `<span class="tip-wrap"><i class="tip-icon">?</i><span class="tip-text">${text}</span></span>`;
    const rows = [
        { label: `Block-Reduced Damage ${mkTip(BLOCK_TIP)}`, fn: scenario => fmt(scenario.blockReducedDamage) },
        { label: `Final/Armor-Reduced Damage ${mkTip(FINAL_TIP)}`, fn: scenario => fmt(scenario.finalReducedDamage) },
        {
            label: 'Remaining Health',
            fn: scenario => {
                if (scenario.remainingHealth <= 0) {
                    return `<span class="skull-wrap tip-wrap"><span class="skull-icon">💀</span><span class="tip-text">${fmt(scenario.remainingHealth)}</span></span>`;
                }
                return fmt(scenario.remainingHealth);
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
    initHitSimulator();
}

/* ── Formula breakdown ── */
function renderFormula(data, inputs) {
    const raw = data.baseRawDamage;
    const eff = data.effectiveRawDamage;
    const diffBonus = { NORMAL: 0, HARD: 0.5, VERY_HARD: 1.0 }[inputs.difficulty] ?? 0;
    const starBonus = inputs.starLevel * 0.5;
    const extraDamagePercent = resolveExtraDamagePercentValue(inputs);
    const extraBonus = extraDamagePercent / 100;
    const totalMult = 1 + diffBonus + starBonus + extraBonus;
    const staggerBar = inputs.maxHealth * 0.4;
    const parryMult = resolveParryMultiplierValue(inputs);
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
        const cls = className ? ` class="${className}"` : '';
        return `<span class="tip-wrap f-hover-wrap" tabindex="0"><span${cls}>${content}</span><span class="tip-text">${tooltip}</span></span>`;
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

    const bonusStr = `1 + ${diffBonus} + ${starBonus} + (${fmt(extraDamagePercent)} ÷ 100)`;
    const step1Html = `
        <div class="f-shared-label">${stepLabelContent('1 — ', 'Effective Damage')}
            <span class="f-shared-note">(all scenarios)</span>
        </div>
        <div class="f-eq">${fmt(raw)} × (${bonusStr}) = ${fmt(raw)} × ${fmt(totalMult)} = ${hoverResult(
            fmt(eff),
            `effectiveDamage = rawDamage × (1 + difficultyBonus + starLevel × 0.5 + extraDamagePercent ÷ 100)<br>${fmt(raw)} × (1 + ${diffBonus} + ${starBonus} + (${fmt(extraDamagePercent)} ÷ 100)) = ${fmt(raw)} × ${fmt(totalMult)} = ${fmt(eff)}`
        )}</div>`;

    function buildCol(scenario, scenarioData) {
        const isShield = scenario !== 'noShield';
        const isParry = scenario === 'parry';
        const effBA = isShield ? inputs.blockArmor * skillFactor * (isParry ? parryMult : 1) : 0;

        let step2;
        if (!isShield) {
            step2 = `<div class="f-step">
                ${stepLabel('2 — ', 'Effective Block Armor')}
                <div class="f-skipped">No shield — step skipped</div>
            </div>`;
        } else {
            const parryLine = isParry
                ? `<div class="f-eq">${fmt(inputs.blockArmor)} × ${fmt(skillFactor)} × ${parryMult} = ${hoverResult(
                    fmt(effBA),
                    `effectiveBlockArmor = blockArmor × (1 + 0.005 × blockingSkill) × parryMultiplier<br>${fmt(inputs.blockArmor)} × (1 + 0.005 × ${inputs.blockingSkill}) × ${parryMult} = ${fmt(inputs.blockArmor)} × ${fmt(skillFactor)} × ${parryMult} = ${fmt(effBA)}`
                )}</div>`
                : `<div class="f-eq">${fmt(inputs.blockArmor)} × ${fmt(skillFactor)} = ${hoverResult(
                    fmt(effBA),
                    `effectiveBlockArmor = blockArmor × (1 + 0.005 × blockingSkill)<br>${fmt(inputs.blockArmor)} × (1 + 0.005 × ${inputs.blockingSkill}) = ${fmt(inputs.blockArmor)} × ${fmt(skillFactor)} = ${fmt(effBA)}`
                )}</div>`;
            const formulaLine = isParry
                ? `<div class="f-eq">${fmt(inputs.blockArmor)} × (1 + 0.005 × ${inputs.blockingSkill}) × ${parryMult}</div>${parryLine}`
                : `<div class="f-eq">${fmt(inputs.blockArmor)} × (1 + 0.005 × ${inputs.blockingSkill})</div>${parryLine}`;
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
            const { isLinear: blockLinear, result: afterBlock } = armorBranch(eff, effBA);
            const halfEff = eff / 2;
            const yesNo = effBA < halfEff ? 'YES' : 'NO';
            const branch = blockLinear ? 'linear' : 'quadratic';
            const staggeredOnBlock = afterBlock > staggerBar;

            let body;
            const check = `<div class="f-branch-check">${fmt(effBA)} &lt; ${fmt(eff)} ÷ 2 (= ${fmt(halfEff)})? ${hoverDecision(
                `${yesNo} → ${branch}`,
                thresholdTooltip('effectiveBlockArmor', 'effectiveDamage', effBA, eff, blockLinear)
            )}</div>`;

            if (staggeredOnBlock) {
                const compared = blockLinear
                    ? `${fmt(eff)} − ${fmt(effBA)} = ${hoverResult(
                        fmt(afterBlock),
                        `blockReducedDamage = effectiveDamage − effectiveBlockArmor<br>${fmt(eff)} − ${fmt(effBA)} = ${fmt(afterBlock)}`
                    )}`
                    : `${fmt(eff)}² ÷ (${fmt(effBA)} × 4) = ${hoverResult(
                        fmt(afterBlock),
                        `blockReducedDamage = effectiveDamage² ÷ (effectiveBlockArmor × 4)<br>${fmt(eff)}² ÷ (${fmt(effBA)} × 4) = ${fmt(afterBlock)}`
                    )}`;
                body = `${check}
                    <div class="f-eq">${compared}</div>
                    ${staggerWarning(`Compared to stagger threshold: block-reduced damage ${fmt(afterBlock)} &gt; ${fmt(staggerBar)} (= 40% of ${fmt(inputs.maxHealth)} max health) → block bypassed.`)}
                    <div class="f-eq">After Block → ${hoverResult(
                        fmt(scenarioData.blockReducedDamage),
                        'The player was staggered, so block armor DMG reduction was not applied.'
                    )}</div>`;
            } else if (blockLinear) {
                body = `${check}
                    <div class="f-eq">${fmt(eff)} − ${fmt(effBA)} = ${hoverResult(
                        fmt(afterBlock),
                        `blockReducedDamage = effectiveDamage − effectiveBlockArmor<br>${fmt(eff)} − ${fmt(effBA)} = ${fmt(afterBlock)}`
                    )}</div>`;
            } else {
                body = `${check}
                    <div class="f-eq">${fmt(eff)}² ÷ (${fmt(effBA)} × 4) = ${hoverResult(
                        fmt(afterBlock),
                        `blockReducedDamage = effectiveDamage² ÷ (effectiveBlockArmor × 4)<br>${fmt(eff)}² ÷ (${fmt(effBA)} × 4) = ${fmt(afterBlock)}`
                    )}</div>`;
            }

            step3 = `<div class="f-step">
                ${stepLabel('3 — ', 'Block Armor DMG Reduction')}
                ${body}
            </div>`;
        }

        const { isLinear: armorLinear } = armorBranch(scenarioData.blockReducedDamage, inputs.armor);
        const halfBlock = scenarioData.blockReducedDamage / 2;
        const armorYesNo = inputs.armor < halfBlock ? 'YES' : 'NO';
        const armorBranchName = armorLinear ? 'linear' : 'quadratic';
        const armorCheck = `<div class="f-branch-check">${fmt(inputs.armor)} &lt; ${fmt(scenarioData.blockReducedDamage)} ÷ 2 (= ${fmt(halfBlock)})? ${hoverDecision(
            `${armorYesNo} → ${armorBranchName}`,
            thresholdTooltip('armor', 'blockReducedDamage', inputs.armor, scenarioData.blockReducedDamage, armorLinear)
        )}</div>`;

        let armorBody;
        if (armorLinear) {
            armorBody = `${armorCheck}
                <div class="f-eq">${fmt(scenarioData.blockReducedDamage)} − ${fmt(inputs.armor)} = ${hoverResult(
                    fmt(scenarioData.finalReducedDamage),
                    `finalDamage = blockReducedDamage − armor<br>${fmt(scenarioData.blockReducedDamage)} − ${fmt(inputs.armor)} = ${fmt(scenarioData.finalReducedDamage)}`
                )}</div>`;
        } else {
            armorBody = `${armorCheck}
                <div class="f-eq">${fmt(scenarioData.blockReducedDamage)}² ÷ (${fmt(inputs.armor)} × 4) = ${hoverResult(
                    fmt(scenarioData.finalReducedDamage),
                    `finalDamage = blockReducedDamage² ÷ (armor × 4)<br>${fmt(scenarioData.blockReducedDamage)}² ÷ (${fmt(inputs.armor)} × 4) = ${fmt(scenarioData.finalReducedDamage)}`
                )}</div>`;
        }

        if (!isShield && scenarioData.stagger === 'YES') {
            armorBody += `
                ${staggerWarning(`Compared to stagger threshold: final damage ${fmt(scenarioData.finalReducedDamage)} &gt; ${fmt(staggerBar)} (= 40% of ${fmt(inputs.maxHealth)} max health).`)}`;
        }

        const step4 = `<div class="f-step">
            ${stepLabel('4 — ', 'Body Armor DMG Reduction')}
            ${armorBody}
        </div>`;

        const step5 = `<div class="f-step">
            ${stepLabel('5 — ', 'Remaining Health')}
            <div class="f-eq">${fmt(inputs.maxHealth)} − ${fmt(scenarioData.finalReducedDamage)} = ${hoverResult(
                fmt(scenarioData.remainingHealth),
                `remainingHealth = maxHealth − finalDamage<br>${fmt(inputs.maxHealth)} − ${fmt(scenarioData.finalReducedDamage)} = ${fmt(scenarioData.remainingHealth)}`,
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
        const resp = await fetch('./mob-presets.json?v=6');
        if (resp.ok) presets = await resp.json();
        populateMobPresets(presets);
    } catch (e) {
        console.warn('Failed to load mob-presets.json', e);
    }

    const trollVertical = presets.find(p => p.id === 'troll-log-vertical');
    const firstVisitDefaults = trollVertical
        ? { ...DEFAULTS, ...extractMobFields(trollVertical) }
        : DEFAULTS;
    loadSavedForm(firstVisitDefaults);

    form.addEventListener('input', saveForm);
    form.addEventListener('input', initHitSimulator);
    form.addEventListener('change', initHitSimulator);
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

    simTakeHitBtnEl.addEventListener('click', () => {
        if (!simState || simState.currentHp <= 0) return;
        simErrorEl.hidden = true;
        try {
            const data = calculate(collectInputs());
            const key = getSelectedSimScenario();
            const scenarioData = data[key];
            const damage = scenarioData.finalReducedDamage;
            const staggered = scenarioData.stagger === 'YES';
            const rawHpAfter = simState.currentHp - damage;
            simState.currentHp = Math.max(0, rawHpAfter);
            simState.hitCount += 1;
            appendSimLogEntry(simState.hitCount, key, damage, simState.currentHp, staggered, rawHpAfter);
            renderHitSimulator();
        } catch (e) {
            simErrorEl.textContent = 'Error: ' + e.message;
            simErrorEl.hidden = false;
        }
    });

    simResetBtnEl.addEventListener('click', () => {
        initHitSimulator();
    });

    simClearLogBtnEl.addEventListener('click', () => {
        simLogEl.innerHTML = '';
    });

    simScenarioRadios().forEach(radio => {
        radio.addEventListener('change', () => renderHitSimulator());
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    initHitSimulator();
}

initialize();

