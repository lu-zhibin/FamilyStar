import type { PrismaClient } from '@prisma/client';

import type {
  ActiveFamily,
  ChildAccountRepository,
  ChildCredentialType,
  ChildGender,
  ChildIdentity,
  ChildProfile,
  CreateChildRecord,
  UpdateChildRecord,
} from './child-types.js';

type ChildRow = {
  id: string;
  familyId: string;
  nickname: string;
  childCredentialHash: string | null;
  credentialType: 'PIN' | 'PASSWORD' | null;
  gender: 'MALE' | 'FEMALE' | null;
  birthday: Date | null;
  grade: string | null;
  avatarMediaId: string | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  version: number;
};

function mapCredentialType(type: 'PIN' | 'PASSWORD'): ChildCredentialType {
  return type === 'PIN' ? 'pin' : 'password';
}

function mapGender(gender: 'MALE' | 'FEMALE'): ChildGender {
  return gender === 'MALE' ? 'male' : 'female';
}

function mapChild(row: ChildRow): ChildIdentity {
  if (!row.childCredentialHash || !row.credentialType || !row.gender) {
    throw new Error('Child credential record is incomplete.');
  }
  return {
    id: row.id,
    familyId: row.familyId,
    nickname: row.nickname,
    credentialType: mapCredentialType(row.credentialType),
    credentialHash: row.childCredentialHash,
    gender: mapGender(row.gender),
    birthday: row.birthday?.toISOString().slice(0, 10) ?? null,
    grade: row.grade,
    avatarMediaId: row.avatarMediaId,
    failedLoginAttempts: row.failedLoginAttempts,
    lockedUntil: row.lockedUntil,
    version: row.version,
  };
}

function publicChild(row: ChildRow): ChildProfile {
  const child = mapChild(row);
  return {
    id: child.id,
    familyId: child.familyId,
    nickname: child.nickname,
    credentialType: child.credentialType,
    gender: child.gender,
    birthday: child.birthday,
    grade: child.grade,
    avatarMediaId: child.avatarMediaId,
  };
}

function prismaCredentialType(type: ChildCredentialType): 'PIN' | 'PASSWORD' {
  return type === 'pin' ? 'PIN' : 'PASSWORD';
}

function prismaGender(gender: ChildGender): 'MALE' | 'FEMALE' {
  return gender === 'male' ? 'MALE' : 'FEMALE';
}

function parseBirthday(value: string | null): Date | null {
  return value === null ? null : new Date(`${value}T00:00:00.000Z`);
}

const childSelection = {
  id: true,
  familyId: true,
  nickname: true,
  childCredentialHash: true,
  credentialType: true,
  gender: true,
  birthday: true,
  grade: true,
  avatarMediaId: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  version: true,
} as const;

export class PrismaChildAccountRepository implements ChildAccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findActiveFamilyByCode(familyCode: string): Promise<ActiveFamily | null> {
    return this.prisma.family.findFirst({
      where: { familyCode, deletedAt: null },
      select: { id: true, name: true, familyCode: true },
    });
  }

  async listActiveChildren(familyId: string): Promise<ChildProfile[]> {
    const children = await this.prisma.user.findMany({
      where: { familyId, role: 'CHILD', deletedAt: null },
      select: childSelection,
      orderBy: [{ birthday: 'asc' }, { createdAt: 'asc' }],
    });
    return children.map(publicChild);
  }

  async findActiveChild(familyId: string, childId: string): Promise<ChildIdentity | null> {
    const child = await this.prisma.user.findFirst({
      where: { id: childId, familyId, role: 'CHILD', deletedAt: null },
      select: childSelection,
    });
    return child ? mapChild(child) : null;
  }

  async isReadyFamilyAvatar(familyId: string, avatarMediaId: string): Promise<boolean> {
    return Boolean(
      await this.prisma.mediaAsset.findFirst({
        where: {
          id: avatarMediaId,
          familyId,
          uploadStatus: 'READY',
          deletedAt: null,
        },
        select: { id: true },
      }),
    );
  }

  async createChild(input: CreateChildRecord): Promise<ChildProfile> {
    const child = await this.prisma.user.create({
      data: {
        familyId: input.familyId,
        role: 'CHILD',
        nickname: input.nickname,
        childCredentialHash: input.credentialHash,
        credentialType: prismaCredentialType(input.credentialType),
        gender: prismaGender(input.gender),
        birthday: parseBirthday(input.birthday),
        grade: input.grade,
        avatarMediaId: input.avatarMediaId,
      },
      select: childSelection,
    });
    return publicChild(child);
  }

  async updateChild(
    familyId: string,
    childId: string,
    input: UpdateChildRecord,
  ): Promise<ChildProfile | null> {
    const result = await this.prisma.user.updateMany({
      where: { id: childId, familyId, role: 'CHILD', deletedAt: null },
      data: {
        ...(input.nickname === undefined ? {} : { nickname: input.nickname }),
        ...(input.credentialType === undefined
          ? {}
          : { credentialType: prismaCredentialType(input.credentialType) }),
        ...(input.credentialHash === undefined
          ? {}
          : { childCredentialHash: input.credentialHash }),
        ...(input.gender === undefined ? {} : { gender: prismaGender(input.gender) }),
        ...(input.birthday === undefined ? {} : { birthday: parseBirthday(input.birthday) }),
        ...(input.grade === undefined ? {} : { grade: input.grade }),
        ...(input.avatarMediaId === undefined ? {} : { avatarMediaId: input.avatarMediaId }),
        ...(input.credentialHash === undefined
          ? {}
          : { failedLoginAttempts: 0, lockedUntil: null, version: { increment: 1 } }),
      },
    });
    if (result.count === 0) return null;
    const child = await this.prisma.user.findFirst({
      where: { id: childId, familyId, role: 'CHILD', deletedAt: null },
      select: childSelection,
    });
    return child ? publicChild(child) : null;
  }

  async updateAuthenticationState(
    familyId: string,
    childId: string,
    expectedVersion: number,
    state: { failedLoginAttempts: number; lockedUntil: Date | null },
  ): Promise<boolean> {
    const result = await this.prisma.user.updateMany({
      where: {
        id: childId,
        familyId,
        role: 'CHILD',
        deletedAt: null,
        version: expectedVersion,
      },
      data: {
        failedLoginAttempts: state.failedLoginAttempts,
        lockedUntil: state.lockedUntil,
        version: { increment: 1 },
      },
    });
    return result.count === 1;
  }

  async softDeleteChild(familyId: string, childId: string, deletedAt: Date): Promise<boolean> {
    const result = await this.prisma.user.updateMany({
      where: { id: childId, familyId, role: 'CHILD', deletedAt: null },
      data: { deletedAt },
    });
    return result.count === 1;
  }
}
