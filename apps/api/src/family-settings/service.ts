import {
  DEFAULT_OPTIONAL_FAMILY_MODULE_STATES,
  FAMILY_MODULE_DEFINITIONS,
  OPTIONAL_FAMILY_MODULE_IDS,
} from '@familystar/shared';
import type {
  FamilyModuleId,
  FamilyModulesReadModel,
  OptionalFamilyModuleId,
} from '@familystar/shared';

import { DEFAULT_FAMILY_SETTINGS, resolveFamilyTimeZone } from '../family-auth/constants.js';
import type { AuthSession } from '../family-auth/types.js';
import type { FamilyModuleStatusPort } from '../security/module-access.js';
import type {
  FamilyModulePatch,
  FamilyProfile,
  FamilyProfilePatch,
  FamilyProfileRecord,
  FamilySettings,
  FamilySettingsDependencies,
  FamilySettingsPatch,
  ParentFamilySession,
} from './types.js';

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

export class FamilyCreatorRequiredError extends Error {
  constructor() {
    super('Only the family creator can update restricted family settings.');
    this.name = 'FamilyCreatorRequiredError';
  }
}

export class InvalidFamilyProfileError extends Error {
  constructor() {
    super('Invalid family profile.');
    this.name = 'InvalidFamilyProfileError';
  }
}

export class FamilySettingsConflictError extends Error {
  constructor() {
    super('Family settings changed concurrently.');
    this.name = 'FamilySettingsConflictError';
  }
}

export type FamilyModuleConflictReason =
  'DEPENDENCY_IN_USE' | 'MISSING_DEPENDENCY' | 'VERSION_CONFLICT';

export class FamilyModuleConflictError extends Error {
  constructor(
    readonly reason: FamilyModuleConflictReason,
    readonly moduleId?: OptionalFamilyModuleId,
    readonly dependencies: readonly FamilyModuleId[] = [],
  ) {
    super(
      reason === 'VERSION_CONFLICT'
        ? 'Family module settings changed concurrently.'
        : 'Family module dependencies conflict with the requested state.',
    );
    this.name = 'FamilyModuleConflictError';
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

function optionalModuleStates(
  raw: Record<string, unknown>,
): Record<OptionalFamilyModuleId, boolean> {
  const stored = isRecord(raw.modules) ? raw.modules : {};
  return Object.fromEntries(
    OPTIONAL_FAMILY_MODULE_IDS.map((moduleId) => [
      moduleId,
      typeof stored[moduleId] === 'boolean'
        ? stored[moduleId]
        : DEFAULT_OPTIONAL_FAMILY_MODULE_STATES[moduleId],
    ]),
  ) as Record<OptionalFamilyModuleId, boolean>;
}

export function resolveFamilyModules(
  raw: Record<string, unknown>,
  version: number,
): FamilyModulesReadModel {
  const optionalStates = optionalModuleStates(raw);
  return {
    version,
    modules: FAMILY_MODULE_DEFINITIONS.map((definition) => ({
      ...definition,
      enabled:
        definition.category === 'core'
          ? true
          : optionalStates[definition.id as OptionalFamilyModuleId],
      configurable: definition.category === 'optional',
    })),
  };
}

function validateModulePatch(patch: FamilyModulePatch): void {
  const entries = Object.entries(patch);
  if (
    entries.length === 0 ||
    entries.some(
      ([moduleId, enabled]) =>
        !OPTIONAL_FAMILY_MODULE_IDS.includes(moduleId as OptionalFamilyModuleId) ||
        typeof enabled !== 'boolean',
    )
  ) {
    throw new InvalidFamilySettingsError();
  }
}

function applyModulePatch(
  current: Record<OptionalFamilyModuleId, boolean>,
  patch: FamilyModulePatch,
): Record<OptionalFamilyModuleId, boolean> {
  const desired = { ...current, ...patch };
  const isEnabled = (moduleId: FamilyModuleId) =>
    FAMILY_MODULE_DEFINITIONS.find(({ id }) => id === moduleId)?.category === 'core' ||
    desired[moduleId as OptionalFamilyModuleId];

  for (const [moduleId, enabled] of Object.entries(patch) as Array<
    [OptionalFamilyModuleId, boolean]
  >) {
    if (!enabled) continue;
    const definition = FAMILY_MODULE_DEFINITIONS.find(({ id }) => id === moduleId)!;
    const missing = definition.dependencies.filter((dependency) => !isEnabled(dependency));
    if (missing.length > 0) {
      throw new FamilyModuleConflictError('MISSING_DEPENDENCY', moduleId, missing);
    }
  }

  for (const [moduleId, enabled] of Object.entries(patch) as Array<
    [OptionalFamilyModuleId, boolean]
  >) {
    if (enabled) continue;
    const dependents = FAMILY_MODULE_DEFINITIONS.filter(
      (definition) => isEnabled(definition.id) && definition.dependencies.includes(moduleId),
    ).map(({ id }) => id);
    if (dependents.length > 0) {
      throw new FamilyModuleConflictError('DEPENDENCY_IN_USE', moduleId, dependents);
    }
  }
  return desired;
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

function validateProfilePatch(patch: FamilyProfilePatch): FamilyProfilePatch {
  if (Object.keys(patch).length === 0) throw new InvalidFamilyProfileError();
  const normalized: FamilyProfilePatch = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name.length === 0 || name.length > 120) throw new InvalidFamilyProfileError();
    normalized.name = name;
  }
  if (patch.timeZone !== undefined) {
    if (!isTimeZone(patch.timeZone)) throw new InvalidFamilyProfileError();
    normalized.timeZone = patch.timeZone;
  }
  return normalized;
}

function profilePermissions(record: FamilyProfileRecord, actorId: string) {
  const isCreator = record.createdById === actorId;
  return {
    canUpdateName: isCreator,
    canManageInvitations: isCreator,
  };
}

function familyProfile(record: FamilyProfileRecord, actorId: string): FamilyProfile {
  return {
    id: record.id,
    name: record.name,
    timeZone: normalizeFamilySettings(record.settings).timeZone,
    parents: record.parents,
    invitations: record.invitations,
    permissions: profilePermissions(record, actorId),
  };
}

export class FamilySettingsService implements FamilyModuleStatusPort {
  constructor(
    private readonly dependencies: FamilySettingsDependencies,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async get(input: { sessionToken?: string }): Promise<{ settings: FamilySettings }> {
    const familyId = await this.requireParentFamily(input.sessionToken);
    const record = await this.dependencies.repository.findActiveSettings(familyId);
    if (!record) throw new FamilySettingsNotFoundError();
    return { settings: normalizeFamilySettings(record.settings) };
  }

  async update(input: {
    sessionToken?: string;
    settings: FamilySettingsPatch;
  }): Promise<{ settings: FamilySettings }> {
    validatePatch(input.settings);
    const familyId = await this.requireParentFamily(input.sessionToken);
    const record = await this.dependencies.repository.findActiveSettings(familyId);
    if (!record) throw new FamilySettingsNotFoundError();
    const settings = { ...normalizeFamilySettings(record.settings), ...input.settings };
    const updated = await this.dependencies.repository.updateActiveSettings(
      familyId,
      record.settingsVersion,
      {
        ...record.settings,
        ...settings,
        streakMultipliers: settings.streakMultipliers.map((tier) => ({ ...tier })),
      },
    );
    if (!updated) throw new FamilySettingsConflictError();
    return { settings };
  }

  async getProfile(input: { sessionToken?: string }): Promise<{ profile: FamilyProfile }> {
    const session = await this.requireParent(input.sessionToken);
    const record = await this.dependencies.repository.findActiveProfile(
      session.familyId,
      this.clock(),
    );
    if (!record) throw new FamilySettingsNotFoundError();
    return { profile: familyProfile(record, session.subjectId) };
  }

  async updateProfile(input: {
    sessionToken?: string;
    profile: FamilyProfilePatch;
  }): Promise<{ profile: FamilyProfile }> {
    const patch = validateProfilePatch(input.profile);
    const session = await this.requireParent(input.sessionToken);
    const record = await this.dependencies.repository.findActiveProfile(
      session.familyId,
      this.clock(),
    );
    if (!record) throw new FamilySettingsNotFoundError();
    if (patch.name !== undefined && record.createdById !== session.subjectId) {
      throw new FamilyCreatorRequiredError();
    }

    const updated = await this.dependencies.repository.updateActiveProfile(session.familyId, {
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.timeZone === undefined
        ? {}
        : { settings: { ...record.settings, timeZone: patch.timeZone } }),
      ...(patch.timeZone === undefined ? {} : { expectedSettingsVersion: record.settingsVersion }),
    });
    if (!updated) throw new FamilySettingsConflictError();

    return {
      profile: familyProfile(
        {
          ...record,
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.timeZone === undefined
            ? {}
            : { settings: { ...record.settings, timeZone: patch.timeZone } }),
        },
        session.subjectId,
      ),
    };
  }

  async listParents(input: { sessionToken?: string }): Promise<{
    parents: FamilyProfile['parents'];
    invitations: FamilyProfile['invitations'];
    permissions: FamilyProfile['permissions'];
  }> {
    const { profile } = await this.getProfile(input);
    return {
      parents: profile.parents,
      invitations: profile.invitations,
      permissions: profile.permissions,
    };
  }

  async getModules(input: { sessionToken?: string }): Promise<{ modules: FamilyModulesReadModel }> {
    const session = await this.requireSession(input.sessionToken);
    const record = await this.dependencies.repository.findActiveSettings(session.familyId);
    if (!record) throw new FamilySettingsNotFoundError();
    return { modules: resolveFamilyModules(record.settings, record.settingsVersion) };
  }

  async updateModules(input: {
    sessionToken?: string;
    expectedVersion: number;
    modules: FamilyModulePatch;
  }): Promise<{ modules: FamilyModulesReadModel }> {
    validateModulePatch(input.modules);
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
      throw new InvalidFamilySettingsError();
    }
    const session = await this.requireParent(input.sessionToken);
    const record = await this.dependencies.repository.findActiveSettings(session.familyId);
    if (!record) throw new FamilySettingsNotFoundError();
    if (record.createdById !== session.subjectId) throw new FamilyCreatorRequiredError();
    if (record.settingsVersion !== input.expectedVersion) {
      throw new FamilyModuleConflictError('VERSION_CONFLICT');
    }

    const modules = applyModulePatch(optionalModuleStates(record.settings), input.modules);
    const updated = await this.dependencies.repository.updateActiveSettings(
      session.familyId,
      input.expectedVersion,
      { ...record.settings, modules },
    );
    if (!updated) throw new FamilyModuleConflictError('VERSION_CONFLICT');
    return {
      modules: resolveFamilyModules({ ...record.settings, modules }, input.expectedVersion + 1),
    };
  }

  async isEnabled(input: {
    session: Pick<AuthSession, 'familyId'>;
    module: OptionalFamilyModuleId;
  }): Promise<boolean> {
    const record = await this.dependencies.repository.findActiveSettings(input.session.familyId);
    if (!record) return false;
    return optionalModuleStates(record.settings)[input.module];
  }

  private async requireSession(token?: string): Promise<AuthSession> {
    const session = token ? await this.dependencies.sessions.read(token) : null;
    if (!session) throw new FamilySettingsSessionRequiredError();
    return session;
  }

  private async requireParent(token?: string): Promise<ParentFamilySession> {
    const session = await this.requireSession(token);
    if (session.role !== 'parent') throw new FamilySettingsSessionRequiredError();
    return { ...session, role: 'parent' };
  }

  private async requireParentFamily(token?: string): Promise<string> {
    return (await this.requireParent(token)).familyId;
  }
}
