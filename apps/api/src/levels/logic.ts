import type { LevelConfiguration, LevelSubject, LevelView } from './types.js';

type LevelThreshold = Pick<LevelConfiguration, 'level' | 'pointsRequired'>;

function ordered<Configuration extends LevelThreshold>(
  configurations: readonly Configuration[],
): Configuration[] {
  return configurations
    .filter(({ level }) => Number.isInteger(level) && level >= 1 && level <= 20)
    .slice()
    .sort((left, right) => left.level - right.level);
}

export function deriveEligibleLevel(
  configurations: readonly LevelThreshold[],
  pointsEarnedTotal: number,
): number {
  let eligibleLevel = 1;
  for (const configuration of ordered(configurations)) {
    if (configuration.pointsRequired <= pointsEarnedTotal) {
      eligibleLevel = Math.max(eligibleLevel, configuration.level);
    }
  }
  return eligibleLevel;
}

export function deriveLevelView(subject: LevelSubject): LevelView {
  const configurations = ordered(subject.configurations);
  const eligibleLevel = deriveEligibleLevel(configurations, subject.pointsEarnedTotal);
  const currentLevel = Math.min(20, Math.max(1, subject.currentLevel, eligibleLevel));
  const current = configurations.find(({ level }) => level === currentLevel);
  if (!current) throw new Error('The current level configuration was not found.');

  const nextConfiguration = configurations.find(({ level }) => level > currentLevel) ?? null;
  const next = nextConfiguration
    ? {
        configuration: nextConfiguration,
        pointsRemaining: Math.max(0, nextConfiguration.pointsRequired - subject.pointsEarnedTotal),
        progressRatio: progressRatio(
          subject.pointsEarnedTotal,
          current.pointsRequired,
          nextConfiguration.pointsRequired,
        ),
      }
    : null;

  return {
    userId: subject.userId,
    pointsEarnedTotal: subject.pointsEarnedTotal,
    eligibleLevel,
    current,
    benefits: {
      discount: current.discount,
      levelAutoApproveQuota: current.autoApproveQuota,
      effectiveAutoApproveQuota: Math.max(subject.familyAutoApproveQuota, current.autoApproveQuota),
      wishSlots: current.wishSlots,
      extraDimensions: current.extraDimensions,
    },
    next,
  };
}

function progressRatio(points: number, currentThreshold: number, nextThreshold: number): number {
  const range = nextThreshold - currentThreshold;
  if (range <= 0) return points >= nextThreshold ? 1 : 0;
  return Math.min(1, Math.max(0, (points - currentThreshold) / range));
}
