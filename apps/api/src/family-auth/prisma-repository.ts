import { Prisma, PrismaClient } from '@prisma/client';

import {
  DEFAULT_BADGE_TEMPLATES,
  DEFAULT_LEVEL_CONFIGS,
  DEFAULT_TASK_TYPES,
  MAX_ACTIVE_PARENTS_PER_FAMILY,
} from './constants.js';
import {
  FamilyParentLimitError,
  InvalidInvitationTokenError,
  InvitationCreatorRequiredError,
  InvitationExpiredError,
  InvitationUnavailableError,
} from './invitation-service.js';
import { FamilyCodeConflictError, ParentEmailConflictError } from './service.js';
import type {
  AcceptInvitationInput,
  CreateInvitationInput,
  FamilyAuthRepository,
  FamilyInitialization,
  FamilyInvitationRepository,
  InvitationCreation,
  ParentIdentity,
  RefreshInvitationInput,
  RevokeInvitationInput,
} from './types.js';

function mapParent(
  user: {
    id: string;
    familyId: string;
    nickname: string;
    email: string | null;
    passwordHash: string | null;
  },
  familyCode: string,
): ParentIdentity {
  if (!user.email || !user.passwordHash) throw new Error('Parent credential record is incomplete.');
  return { ...user, familyCode, email: user.email, passwordHash: user.passwordHash };
}

type FamilyRow = { id: string; createdById: string | null; familyCode: string };
type InvitationIdRow = { id: string };
type InvitationRow = {
  id: string;
  familyId: string;
  invitedById: string;
  email: string;
  expiresAt: Date;
};
type ManagedInvitationRow = InvitationRow & {
  status: 'pending' | 'accepted' | 'expired';
};

export class PrismaFamilyAuthRepository
  implements FamilyAuthRepository, FamilyInvitationRepository<Prisma.TransactionClient>
{
  constructor(private readonly prisma: PrismaClient) {}

  async findActiveParentByEmail(email: string): Promise<ParentIdentity | null> {
    const users = await this.prisma.$queryRaw<ParentIdentity[]>(Prisma.sql`
      SELECT u."id", u."family_id" AS "familyId", f."family_code" AS "familyCode",
             u."nickname", u."email", u."password_hash" AS "passwordHash"
      FROM "users" u
      JOIN "families" f ON f."id" = u."family_id" AND f."deleted_at" IS NULL
      WHERE u."role" = 'parent'
        AND u."deleted_at" IS NULL
        AND LOWER(u."email") = ${email}
      LIMIT 1
    `);
    return users[0] ?? null;
  }

  async findActiveFamilyCodeById(familyId: string): Promise<string | null> {
    const family = await this.prisma.family.findFirst({
      where: { id: familyId, deletedAt: null },
      select: { familyCode: true },
    });
    return family?.familyCode ?? null;
  }

  async createFamilyWithParent(input: FamilyInitialization): Promise<ParentIdentity> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const family = await transaction.family.create({
          data: {
            name: input.familyName,
            familyCode: input.familyCode,
            settings: input.settings as Prisma.InputJsonObject,
          },
        });
        const parent = await transaction.user.create({
          data: {
            familyId: family.id,
            role: 'PARENT',
            nickname: input.nickname,
            email: input.email,
            passwordHash: input.passwordHash,
          },
        });
        await transaction.family.update({
          where: { id: family.id },
          data: { createdById: parent.id },
        });

        for (const taskType of DEFAULT_TASK_TYPES) {
          await transaction.taskTypeTemplate.upsert({
            where: { code: taskType.code },
            create: {
              code: taskType.code,
              name: taskType.name,
              icon: taskType.icon,
              sortOrder: taskType.sortOrder,
            },
            update: {},
          });
        }
        await transaction.taskType.createMany({
          data: DEFAULT_TASK_TYPES.map((taskType) => ({
            familyId: family.id,
            templateCode: taskType.code,
            name: taskType.name,
            icon: taskType.icon,
            sortOrder: taskType.sortOrder,
          })),
        });
        await transaction.levelConfig.createMany({
          data: DEFAULT_LEVEL_CONFIGS.map((level) => ({ ...level, familyId: family.id })),
        });
        await transaction.badgeTemplate.createMany({
          data: DEFAULT_BADGE_TEMPLATES.map((template) => ({
            familyId: family.id,
            presetCode: template.presetCode,
            name: template.name,
            description: template.description,
            icon: template.icon,
            category: template.category,
            conditionType: template.condition.type,
            condition: template.condition,
          })),
        });
        return mapParent(parent, family.familyCode);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = String(error.meta?.target ?? '');
        if (target.includes('family_code') || target.includes('familyCode')) {
          throw new FamilyCodeConflictError();
        }
        throw new ParentEmailConflictError();
      }
      throw error;
    }
  }

  async createOrRefresh(
    transaction: Prisma.TransactionClient,
    input: CreateInvitationInput,
  ): Promise<InvitationCreation> {
    const families = await transaction.$queryRaw<FamilyRow[]>(Prisma.sql`
      SELECT "id", "created_by" AS "createdById", "family_code" AS "familyCode"
      FROM "families"
      WHERE "id" = ${input.familyId}::uuid AND "deleted_at" IS NULL
      FOR UPDATE
    `);
    const family = families[0];
    if (!family || family.createdById !== input.actorId) {
      throw new InvitationCreatorRequiredError();
    }

    const activeParents = await transaction.user.count({
      where: { familyId: input.familyId, role: 'PARENT', deletedAt: null },
    });
    if (activeParents >= MAX_ACTIVE_PARENTS_PER_FAMILY) throw new FamilyParentLimitError();

    const activeEmail = await transaction.$queryRaw<InvitationIdRow[]>(Prisma.sql`
      SELECT "id"
      FROM "users"
      WHERE "deleted_at" IS NULL AND LOWER("email") = ${input.email}
      LIMIT 1
    `);
    if (activeEmail.length > 0) throw new ParentEmailConflictError();

    await transaction.$executeRaw(Prisma.sql`
      UPDATE "invitations"
      SET "status" = 'expired', "updated_at" = ${input.now}
      WHERE "family_id" = ${input.familyId}::uuid
        AND LOWER("email") = ${input.email}
        AND "status" = 'pending'
        AND "expires_at" <= ${input.now}
    `);
    const invitations = await transaction.$queryRaw<InvitationRow[]>(Prisma.sql`
      INSERT INTO "invitations" (
        "family_id", "invited_by", "email", "token_hash", "expires_at",
        "created_at", "updated_at"
      ) VALUES (
        ${input.familyId}::uuid, ${input.actorId}::uuid, ${input.email},
        ${input.tokenHash}, ${input.expiresAt}, ${input.now}, ${input.now}
      )
      ON CONFLICT ("family_id", (LOWER("email"))) WHERE "status" = 'pending'
       DO UPDATE SET
         "token_hash" = EXCLUDED."token_hash",
         "expires_at" = EXCLUDED."expires_at",
         "updated_at" = ${input.now}
      RETURNING "id", "family_id" AS "familyId", "invited_by" AS "invitedById",
                "email", "expires_at" AS "expiresAt"
    `);
    const invitation = invitations[0];
    if (!invitation) throw new Error('Invitation write did not return a record.');
    const emailSetting = await transaction.familyIntegrationSetting.findUnique({
      where: {
        familyId_integrationType: {
          familyId: input.familyId,
          integrationType: 'EMAIL',
        },
      },
      select: { status: true },
    });
    return {
      invitation: {
        id: invitation.id,
        familyId: invitation.familyId,
        invitedById: invitation.invitedById,
        email: invitation.email,
        expiresAt: invitation.expiresAt,
      },
      emailConfigured: emailSetting?.status === 'VERIFIED',
    };
  }

  async refresh(
    transaction: Prisma.TransactionClient,
    input: RefreshInvitationInput,
  ): Promise<InvitationCreation> {
    const families = await transaction.$queryRaw<FamilyRow[]>(Prisma.sql`
      SELECT "id", "created_by" AS "createdById", "family_code" AS "familyCode"
      FROM "families"
      WHERE "id" = ${input.familyId}::uuid AND "deleted_at" IS NULL
      FOR UPDATE
    `);
    const family = families[0];
    if (!family || family.createdById !== input.actorId) {
      throw new InvitationCreatorRequiredError();
    }

    const invitations = await transaction.$queryRaw<ManagedInvitationRow[]>(Prisma.sql`
      SELECT "id", "family_id" AS "familyId", "invited_by" AS "invitedById",
             "email", "status", "expires_at" AS "expiresAt"
      FROM "invitations"
      WHERE "id" = ${input.invitationId}::uuid AND "family_id" = ${input.familyId}::uuid
      FOR UPDATE
    `);
    const invitation = invitations[0];
    if (!invitation || invitation.status !== 'pending') throw new InvitationUnavailableError();
    if (invitation.expiresAt <= input.now) throw new InvitationExpiredError();

    await transaction.invitation.update({
      where: { id: invitation.id },
      data: {
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        invitedById: input.actorId,
        updatedAt: input.now,
      },
    });
    const emailSetting = await transaction.familyIntegrationSetting.findUnique({
      where: {
        familyId_integrationType: {
          familyId: input.familyId,
          integrationType: 'EMAIL',
        },
      },
      select: { status: true },
    });
    return {
      invitation: {
        id: invitation.id,
        familyId: invitation.familyId,
        invitedById: input.actorId,
        email: invitation.email,
        expiresAt: input.expiresAt,
      },
      emailConfigured: emailSetting?.status === 'VERIFIED',
    };
  }

  async revoke(
    transaction: Prisma.TransactionClient,
    input: RevokeInvitationInput,
  ): Promise<{ id: string }> {
    const families = await transaction.$queryRaw<FamilyRow[]>(Prisma.sql`
      SELECT "id", "created_by" AS "createdById", "family_code" AS "familyCode"
      FROM "families"
      WHERE "id" = ${input.familyId}::uuid AND "deleted_at" IS NULL
      FOR UPDATE
    `);
    const family = families[0];
    if (!family || family.createdById !== input.actorId) {
      throw new InvitationCreatorRequiredError();
    }

    const invitations = await transaction.$queryRaw<ManagedInvitationRow[]>(Prisma.sql`
      SELECT "id", "family_id" AS "familyId", "invited_by" AS "invitedById",
             "email", "status", "expires_at" AS "expiresAt"
      FROM "invitations"
      WHERE "id" = ${input.invitationId}::uuid AND "family_id" = ${input.familyId}::uuid
      FOR UPDATE
    `);
    const invitation = invitations[0];
    if (!invitation || invitation.status === 'accepted') throw new InvitationUnavailableError();
    if (invitation.status === 'pending') {
      await transaction.invitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED', updatedAt: input.now },
      });
    }
    return { id: invitation.id };
  }

  async accept(
    transaction: Prisma.TransactionClient,
    input: AcceptInvitationInput,
  ): Promise<ParentIdentity> {
    try {
      const invitationRows = await transaction.$queryRaw<InvitationIdRow[]>(Prisma.sql`
        SELECT "id"
        FROM "invitations"
        WHERE "token_hash" = ${input.tokenHash}
        FOR UPDATE
      `);
      const invitationId = invitationRows[0]?.id;
      if (!invitationId) throw new InvalidInvitationTokenError();
      const invitation = await transaction.invitation.findUnique({ where: { id: invitationId } });
      if (!invitation || invitation.status !== 'PENDING') throw new InvitationUnavailableError();
      if (invitation.expiresAt.getTime() <= input.now.getTime()) {
        throw new InvitationExpiredError();
      }

      const families = await transaction.$queryRaw<FamilyRow[]>(Prisma.sql`
        SELECT "id", "created_by" AS "createdById", "family_code" AS "familyCode"
        FROM "families"
        WHERE "id" = ${invitation.familyId}::uuid AND "deleted_at" IS NULL
        FOR UPDATE
      `);
      const family = families[0];
      if (!family) throw new InvitationUnavailableError();
      const activeParents = await transaction.user.count({
        where: { familyId: invitation.familyId, role: 'PARENT', deletedAt: null },
      });
      if (activeParents >= MAX_ACTIVE_PARENTS_PER_FAMILY) throw new FamilyParentLimitError();

      const activeEmail = await transaction.$queryRaw<InvitationIdRow[]>(Prisma.sql`
        SELECT "id"
        FROM "users"
        WHERE "deleted_at" IS NULL AND LOWER("email") = ${invitation.email}
        LIMIT 1
      `);
      if (activeEmail.length > 0) throw new ParentEmailConflictError();

      const parent = await transaction.user.create({
        data: {
          familyId: invitation.familyId,
          role: 'PARENT',
          nickname: input.nickname,
          email: invitation.email,
          passwordHash: input.passwordHash,
        },
      });
      await transaction.invitation.update({
        where: { id: invitation.id },
        data: {
          status: 'ACCEPTED',
          invitedUserId: parent.id,
          acceptedAt: input.now,
        },
      });
      return mapParent(parent, family.familyCode);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ParentEmailConflictError();
      }
      throw error;
    }
  }
}
