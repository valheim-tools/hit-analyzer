import { Injectable, isDevMode } from '@angular/core';

import { DifficultyKey } from './models';
import { environment } from '../../environments/environment';

// ── Extend the Window type with the gtag global ────────────────────────────
declare global {
  interface Window {
    gtag: (
      command: 'event' | 'config' | 'js',
      target: string | Date,
      params?: Record<string, unknown>,
    ) => void;
    dataLayer: unknown[];
  }
}

// ── Parameter shapes for each tracked event ────────────────────────────────

export interface HitCalculatedEventParams {
  difficulty: DifficultyKey;
  starLevel: number;
  blockArmor: number;
  armor: number;
  hasRiskFactor: boolean;
  riskFactorValue: number;
}

export interface TabSwitchedEventParams {
  tabName: string;
}

export interface MobPresetSelectedEventParams {
  presetId: string;
  mobName: string;
}

export interface PageViewEventParams {
  pagePath: string;
  pageTitle: string;
}

export interface GearsetSelectedEventParams {
  setName: string;
}

export interface SimulatorHitEventParams {
  /** 'base' for deterministic median hit, 'random' for RNG-sampled hit. */
  hitType: 'base' | 'random';
  scenarioKey: string;
}

// ── Service ────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class AnalyticsService {

  constructor() {
    // Configure gtag with the environment-specific Measurement ID.
    // Dev uses G-CDXPL7B4D6, production uses G-B08EZ7LY36 — swapped via fileReplacements.
    try {
      window.gtag('config', environment.ga4MeasurementId, { send_page_view: false });
    } catch {
      // gtag not yet loaded — silently ignore
    }
  }

  /** Sends an event to GA4. Always logs to console in dev mode for easy verification. */
  private sendEvent(eventName: string, eventParams: Record<string, string | number | boolean> = {}): void {
    if (isDevMode()) {
      console.debug('[Analytics]', eventName, eventParams);
    }

    try {
      window.gtag('event', eventName, eventParams);
    } catch {
      // gtag not loaded — silently ignore
    }
  }

  /**
   * Track a virtual page view.
   * Called once per router navigation so GA4 sees each route as a separate page.
   */
  trackPageView(params: PageViewEventParams): void {
    this.sendEvent('page_view', {
      page_path: params.pagePath,
      page_title: params.pageTitle,
    });
  }

  /**
   * Track when the user switches between the Hit Simulator and Hit Analyzer tabs.
   * Helps identify which tool is used more.
   */
  trackTabSwitched(params: TabSwitchedEventParams): void {
    this.sendEvent('tab_switched', {
      tab_name: params.tabName,
    });
  }

  /**
   * Track each time the user clicks "Hit" to run a damage calculation.
   * Captures the key input parameters so we can understand which scenarios are analysed.
   * riskFactorValue is 0 when not used; hasRiskFactor flags it explicitly for easy filtering.
   */
  trackHitCalculated(params: HitCalculatedEventParams): void {
    this.sendEvent('hit_calculated', {
      difficulty: params.difficulty,
      star_level: params.starLevel,
      block_armor: params.blockArmor,
      armor: params.armor,
      has_risk_factor: params.hasRiskFactor,
      risk_factor_value: params.riskFactorValue,
    });
  }

  /**
   * Track which mob preset the user loads.
   * Helps identify the most popular creatures / attacks.
   */
  trackMobPresetSelected(params: MobPresetSelectedEventParams): void {
    this.sendEvent('mob_preset_selected', {
      preset_id: params.presetId,
      mob_name: params.mobName,
    });
  }

  /**
   * Track when the user opens the Armor Builder via the gear (⚙) button.
   */
  trackArmorBuilderOpened(): void {
    this.sendEvent('armor_builder_opened');
  }

  /**
   * Track which armor set preset the user equips in the Armor Builder.
   * Helps identify the most popular armor sets.
   */
  trackGearsetSelected(params: GearsetSelectedEventParams): void {
    this.sendEvent('gearset_selected', {
      set_name: params.setName,
    });
  }

  /**
   * Track each hit in the Hit Simulator.
   * hitType distinguishes deterministic base hits from RNG-sampled random hits.
   * scenarioKey records whether the player was blocking, parrying, or unshielded.
   */
  trackSimulatorHit(params: SimulatorHitEventParams): void {
    this.sendEvent('sim_hit', {
      hit_type: params.hitType,
      scenario_key: params.scenarioKey,
    });
  }
}






