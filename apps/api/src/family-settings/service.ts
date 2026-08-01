import { DEFAULT_FAMILY_SETTINGS, resolveFamilyTimeZone } from '../family-auth/constants.js';
import type { FamilySettings, FamilySettingsDependencies, FamilySettingsPatch } from './types.js';

const STREAK_DAYS = DEFAULT_FAMILY_SETTINGS.streakMultipliers.map(({ days }) => days);

export class FamilySettingsSessionRequiredError extends Error {
  constructor() {
    super('An active parent session is required.');
    this.name = 'FamilySettingsSessionRequiredError';
  }
}

export class FamilySettingsNotFoundError extends Error {
  constructor() {
    super('The family was not found.');
    this.name = 'FamilySettingsNotFoundError';
  }
}

export class InvalidFamilySettingsError extends Error {
  constructor() {
    super('Invalid family settings.');
    this.name = 'InvalidFamilySettingsError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isDeadline(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isTimeZone(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && resolveFamilyTimeZone(value) === value;
}

function isStreakMultipliers(value: unknown): value is FamilySettings['streakMultipliers'] {
  return (
    Array.isArray(value) &&
    value.length === STREAK_DAYS.length &&
    value.every((tier, index) => {
      if (!isRecord(tier)) return false;
      return (
        tier.days === STREAK_DAYS[index] &&
        typeof tier.multiplier === 'number' &&
        Number.isFinite(tier.multiplier) &&
        tier.multiplier > 0
      );
    })
  );
}

function defaultSettings(): FamilySettings {
  return {
    timeZone: DEFAULT_FAMILY_SETTINGS.timeZone,
    checkInDeadline: DEFAULT_FAMILY_SETTINGS.checkInDeadline,
    makeupDays: DEFAULT_FAMILY_SETTINGS.makeupDays,
    reviewTimeoutHours: DEFAULT_FAMILY_SETTINGS.reviewTimeoutHours,
    autoApproveQuota: DEFAULT_FAMILY_SETTINGS.autoApproveQuota,
    streakMultipliers: DEFAULT_FAMILY_SETTINGS.streakMultipliers.map((tier) => ({ ...tier })),
  };
}

export function normalizeFamilySettings(raw: Record<string, unknown>): FamilySettings {
  const defaults = defaultSettings();
  return {
    timeZone: isTimeZone(raw.timeZone) ? raw.timeZone : defaults.timeZone,
    checkInDeadline: isDeadline(raw.checkInDeadline)
      ? raw.checkInDeadline
      : defaults.checkInDeadline,
    makeupDays: isNonNegativeSafeInteger(raw.makeupDays) ? raw.makeupDays : defaults.makeupDays,
    reviewTimeoutHours: isNonNegativeSafeInteger(raw.reviewTimeoutHours)
      ? raw.reviewTimeoutHours
      : defaults.reviewTimeoutHours,
    autoApproveQuota: isNonNegativeSafeInteger(raw.autoApproveQuota)
      ? raw.autoApproveQuota
      : defaults.autoApproveQuota,
    streakMultipliers: isStreakMultipliers(raw.streakMultipliers)
      ? raw.streakMultipliers.map((tier) => ({ ...tier }))
      : defaults.streakMultipliers,
  };
}

function validatePatch(patch: FamilySettingsPatch): void {
  if (Object.keys(patch).length === 0) throw new InvalidFamilySettingsError();
  if (patch.timeZone !== undefined && !isTimeZone(patch.timeZone)) {
    throw new InvalidFamilySettingsError();
  }
  if (patch.checkInDeadline !== undefined && !isDeadline(patch.checkInDeadline)) {
    throw new InvalidFamilySettingsError();
  }
  for (const value of [patch.makeupDays, patch.reviewTimeoutHours, patch.autoApproveQuota]) {
    if (value !== undefined && !isNonNegativeSafeInteger(value)) {
      throw new InvalidFamilySettingsError();
    }
  }
  if (patch.streakMultipliers !== undefined && !isStreakMultipliers(patch.streakMultipliers)) {
    throw new InvalidFamilySettingsError();
  }
}

export class FamilySettingsService {
  constructor(private readonly dependencies: FamilySettingsDependencies) {}

  async get(input: { sessionToken?: string }): Promise<{ settings: FamilySettings }> {
    const familyId = await this.requireParentFamily(input.sessionToken);
    const raw = await this.dependencies.repository.findActiveSettings(familyId);
    if (!raw) throw new FamilySettingsNotFoundError();
    return { settings: normalizeFamilySettings(raw) };
  }

  async update(input: {
    sessionToken?: string;
    settings: FamilySettingsPatch;
  }): Promise<{ settings: FamilySettings }> {
    validatePatch(input.settings);
    const familyId = await this.requireParentFamily(input.sessionToken);
    const raw = await this.dependencies.repository.findActiveSettings(familyId);
    if (!raw) throw new FamilySettingsNotFoundError();
    const settings = { ...normalizeFamilySettings(raw), ...input.settings };
    const updated = await this.dependencies.repository.updateActiveSettings(familyId, {
      ...raw,
      ...settings,
      streakMultipliers: settings.streakMultipliers.map((tier) => ({ ...tier })),
    });
    if (!updated) throw new FamilySettingsNotFoundError();
    return { settings };
  }

  private async requireParentFamily(token?: string): Promise<string> {
    const session = token ? await this.dependencies.sessions.read(token) : null;
    if (!session || session.role !== 'parent') throw new FamilySettingsSessionRequiredError();
    return session.familyId;
  }
}
