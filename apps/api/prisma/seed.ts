import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

import {
  assertDevelopmentSeedAllowed,
  DEVELOPMENT_SEED,
  DEVELOPMENT_SEED_CREDENTIALS,
  seedId,
} from './seed-data.js';

const prisma = new PrismaClient();

async function seed(): Promise<void> {
  assertDevelopmentSeedAllowed(process.env.NODE_ENV);

  const parentPasswordHash = await bcrypt.hash(DEVELOPMENT_SEED_CREDENTIALS.parentPassword, 12);
  const childPinHashes = await Promise.all(
    DEVELOPMENT_SEED_CREDENTIALS.childPins.map((pin) => bcrypt.hash(pin, 12)),
  );

  await prisma.$transaction(async (transaction) => {
    for (const template of DEVELOPMENT_SEED.templates) {
      await transaction.taskTypeTemplate.upsert({
        where: { code: template.code },
        create: template,
        update: {
          name: template.name,
          icon: template.icon,
          defaultVerifyMode: template.defaultVerifyMode,
          sortOrder: template.sortOrder,
        },
      });
    }

    for (const [familyIndex, family] of DEVELOPMENT_SEED.families.entries()) {
      const familyCode = String(familyIndex + 1).padStart(6, '0');
      await transaction.family.upsert({
        where: { id: family.id },
        create: {
          id: family.id,
          familyCode,
          name: family.name,
          settings: DEVELOPMENT_SEED.familySettings,
        },
        update: { familyCode, name: family.name },
      });

      for (const parent of family.parents) {
        await transaction.user.upsert({
          where: { id: parent.id },
          create: {
            id: parent.id,
            familyId: family.id,
            role: 'PARENT',
            nickname: parent.nickname,
            email: parent.email,
            passwordHash: parentPasswordHash,
          },
          update: {
            nickname: parent.nickname,
            email: parent.email,
            deletedAt: null,
          },
        });
      }

      for (const [childIndex, child] of family.children.entries()) {
        const childPinHash = childPinHashes[familyIndex * 2 + childIndex];
        if (!childPinHash) throw new Error('Missing child PIN hash.');
        await transaction.user.upsert({
          where: { id: child.id },
          create: {
            id: child.id,
            familyId: family.id,
            role: 'CHILD',
            nickname: child.nickname,
            childCredentialHash: childPinHash,
            credentialType: 'PIN',
            gender: child.gender,
            grade: child.grade,
            pointsBalance: 520,
            pointsEarnedTotal: 520,
            currentLevel: 5,
          },
          update: {
            nickname: child.nickname,
            gender: child.gender,
            grade: child.grade,
            deletedAt: null,
          },
        });
      }

      await transaction.family.update({
        where: { id: family.id },
        data: { createdById: family.creatorId },
      });

      for (const [typeIndex, template] of DEVELOPMENT_SEED.templates.entries()) {
        await transaction.taskType.upsert({
          where: {
            familyId_templateCode: { familyId: family.id, templateCode: template.code },
          },
          create: {
            id: seedId(5, familyIndex, typeIndex),
            familyId: family.id,
            templateCode: template.code,
            name: template.name,
            icon: template.icon,
            defaultVerifyMode: template.defaultVerifyMode,
            sortOrder: template.sortOrder,
          },
          update: { deletedAt: null },
        });
      }

      for (const level of DEVELOPMENT_SEED.levels) {
        await transaction.levelConfig.upsert({
          where: { familyId_level: { familyId: family.id, level: level.level } },
          create: {
            id: seedId(6, familyIndex, level.level - 1),
            familyId: family.id,
            ...level,
          },
          update: {
            name: level.name,
            icon: level.icon,
            pointsRequired: level.pointsRequired,
            discount: level.discount,
            autoApproveQuota: level.autoApproveQuota,
            wishSlots: level.wishSlots,
          },
        });
      }

      const soloTaskId = seedId(7, familyIndex, 0);
      const collaborationTaskId = seedId(7, familyIndex, 1);
      const studyTypeId = seedId(5, familyIndex, 0);
      const choreTypeId = seedId(5, familyIndex, 2);
      await transaction.task.upsert({
        where: { id: soloTaskId },
        create: {
          id: soloTaskId,
          familyId: family.id,
          taskTypeId: studyTypeId,
          name: '每日阅读 20 分钟',
          submissionGuide: '写下今天阅读的内容，并上传一张阅读照片。',
          checkType: 'MIXED',
          verifyMode: 'MANUAL',
          collaborationMode: 'SOLO',
          frequency: { type: 'daily' },
          basePoints: 20,
        },
        update: { status: 'ACTIVE', deletedAt: null },
      });
      await transaction.task.upsert({
        where: { id: collaborationTaskId },
        create: {
          id: collaborationTaskId,
          familyId: family.id,
          taskTypeId: choreTypeId,
          name: '周末家庭大扫除',
          submissionGuide: '每位参与者提交自己负责区域的完成说明。',
          checkType: 'TEXT',
          verifyMode: 'MANUAL',
          collaborationMode: 'COLLAB',
          frequency: { type: 'weekdays', weekdays: [6] },
          basePoints: 40,
        },
        update: { status: 'ACTIVE', deletedAt: null },
      });

      for (const [childIndex, child] of family.children.entries()) {
        for (const [taskIndex, taskId] of [soloTaskId, collaborationTaskId].entries()) {
          await transaction.taskAssignment.upsert({
            where: { taskId_childId: { taskId, childId: child.id } },
            create: {
              id: seedId(8 + taskIndex, familyIndex, childIndex),
              familyId: family.id,
              taskId,
              childId: child.id,
              startDate: new Date('2026-01-01T00:00:00.000Z'),
            },
            update: { deletedAt: null },
          });
        }
      }

      const roundId = seedId(10, familyIndex, 0);
      await transaction.collaborationRound.upsert({
        where: { taskId_roundNumber: { taskId: collaborationTaskId, roundNumber: 1 } },
        create: {
          id: roundId,
          familyId: family.id,
          taskId: collaborationTaskId,
          roundNumber: 1,
          startDate: new Date('2026-07-27T00:00:00.000Z'),
          endDate: new Date('2026-08-02T00:00:00.000Z'),
          status: 'ACTIVE',
        },
        update: {},
      });
      for (const [childIndex, child] of family.children.entries()) {
        await transaction.collaborationRoundParticipant.upsert({
          where: { roundId_childId: { roundId, childId: child.id } },
          create: {
            id: seedId(11, familyIndex, childIndex),
            familyId: family.id,
            roundId,
            childId: child.id,
            rewardPointsSnapshot: 40,
          },
          update: {},
        });
      }

      const rewards = [
        { name: '周末电影之夜', pointsCost: 120, type: 'EXPERIENCE' as const, stockTotal: null },
        { name: '科学实验套装', pointsCost: 300, type: 'PHYSICAL' as const, stockTotal: 3 },
        { name: '晚睡半小时券', pointsCost: 80, type: 'PRIVILEGE' as const, stockTotal: 5 },
      ];
      for (const [rewardIndex, reward] of rewards.entries()) {
        await transaction.reward.upsert({
          where: { id: seedId(12, familyIndex, rewardIndex) },
          create: {
            id: seedId(12, familyIndex, rewardIndex),
            familyId: family.id,
            ...reward,
            prerequisites: rewardIndex === 1 ? { minimumLevel: 3 } : undefined,
          },
          update: {
            name: reward.name,
            pointsCost: reward.pointsCost,
            type: reward.type,
            status: 'ACTIVE',
            deletedAt: null,
          },
        });
      }

      await transaction.wish.upsert({
        where: { id: seedId(13, familyIndex, 0) },
        create: {
          id: seedId(13, familyIndex, 0),
          familyId: family.id,
          childId: family.children[0].id,
          title: '家庭露营日',
          description: '一起去郊外看星星。',
          targetPoints: 800,
        },
        update: { deletedAt: null },
      });
    }
  });
}

seed()
  .then(() => {
    console.info('FamilyStar development seed completed.');
  })
  .finally(async () => prisma.$disconnect());
