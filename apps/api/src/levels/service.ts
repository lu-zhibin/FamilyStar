import { deriveLevelView } from './logic.js';
import type { LevelOperations, LevelServiceDependencies } from './types.js';

export class LevelAccessError extends Error {
  constructor(
    readonly code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'LevelAccessError';
  }
}

export class LevelService implements LevelOperations {
  constructor(private readonly dependencies: LevelServiceDependencies) {}

  async getMe(input: { sessionToken?: string }) {
    const session = await this.session(input.sessionToken);
    if (session.role !== 'child') {
      throw new LevelAccessError('FORBIDDEN', 'A child session is required.');
    }
    return this.read(session.familyId, session.subjectId);
  }

  async getChild(input: { sessionToken?: string; childId: string }) {
    const session = await this.session(input.sessionToken);
    if (session.role !== 'parent') {
      throw new LevelAccessError('FORBIDDEN', 'A parent session is required.');
    }
    return this.read(session.familyId, input.childId);
  }

  private async session(token?: string) {
    const session = token ? await this.dependencies.sessions.read(token) : null;
    if (!session) throw new LevelAccessError('UNAUTHORIZED', 'An active session is required.');
    return session;
  }

  private async read(familyId: string, childId: string) {
    const subject = await this.dependencies.repository.findActiveChildLevel(familyId, childId);
    if (!subject) throw new LevelAccessError('NOT_FOUND', 'The child was not found.');
    return { level: deriveLevelView(subject) };
  }
}
