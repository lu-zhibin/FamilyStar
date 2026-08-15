import type { AuthSession } from '../family-auth/types.js';
import { normalizeBadgeTemplate, normalizeBadgeTemplatePatch } from './logic.js';
import type { BadgeDependencies, BadgeOperations } from './types.js';

export class BadgeAccessError extends Error {
  constructor(
    readonly code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'BadgeAccessError';
  }
}

export class BadgeConflictError extends Error {
  readonly code = 'CONFLICT' as const;

  constructor(message: string) {
    super(message);
    this.name = 'BadgeConflictError';
  }
}

export class BadgeService implements BadgeOperations {
  private readonly now: () => Date;

  constructor(private readonly dependencies: BadgeDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async listTemplates(input: { sessionToken?: string }) {
    const session = await this.parent(input.sessionToken);
    return { templates: await this.dependencies.repository.listTemplates(session.familyId) };
  }

  async createTemplate(input: Parameters<BadgeOperations['createTemplate']>[0]) {
    const session = await this.parent(input.sessionToken);
    return {
      template: await this.dependencies.repository.createTemplate(
        session.familyId,
        session.subjectId,
        normalizeBadgeTemplate(input.template),
      ),
    };
  }

  async updateTemplate(input: Parameters<BadgeOperations['updateTemplate']>[0]) {
    const session = await this.parent(input.sessionToken);
    const template = await this.dependencies.repository.updateTemplate(
      session.familyId,
      input.templateId,
      normalizeBadgeTemplatePatch(input.template),
    );
    if (!template) throw new BadgeAccessError('NOT_FOUND', 'The badge template was not found.');
    return { template };
  }

  async removeTemplate(input: Parameters<BadgeOperations['removeTemplate']>[0]) {
    const session = await this.parent(input.sessionToken);
    if (
      !(await this.dependencies.repository.softDeleteTemplate(
        session.familyId,
        input.templateId,
        this.now(),
      ))
    ) {
      throw new BadgeAccessError('NOT_FOUND', 'The badge template was not found.');
    }
  }

  async awardManually(input: Parameters<BadgeOperations['awardManually']>[0]) {
    const session = await this.parent(input.sessionToken);
    const reason = input.reason.trim();
    if (reason.length === 0 || reason.length > 2_000) {
      throw new BadgeConflictError('A manual badge reason is required.');
    }
    return {
      award: await this.dependencies.repository.awardManually({
        familyId: session.familyId,
        parentId: session.subjectId,
        childId: input.childId,
        templateId: input.templateId,
        reason,
        now: this.now(),
      }),
    };
  }

  async getMyWall(input: { sessionToken?: string }) {
    const session = await this.child(input.sessionToken);
    const badges = await this.dependencies.repository.getWall(session.familyId, session.subjectId);
    if (!badges) throw new BadgeAccessError('NOT_FOUND', 'The child was not found.');
    return { badges };
  }

  private async parent(token?: string): Promise<AuthSession> {
    const session = await this.session(token);
    if (session.role !== 'parent') {
      throw new BadgeAccessError('FORBIDDEN', 'A parent session is required.');
    }
    return session;
  }

  private async child(token?: string): Promise<AuthSession> {
    const session = await this.session(token);
    if (session.role !== 'child') {
      throw new BadgeAccessError('FORBIDDEN', 'A child session is required.');
    }
    return session;
  }

  private async session(token?: string): Promise<AuthSession> {
    const session = token ? await this.dependencies.sessions.read(token) : null;
    if (!session) throw new BadgeAccessError('UNAUTHORIZED', 'An active session is required.');
    return session;
  }
}
