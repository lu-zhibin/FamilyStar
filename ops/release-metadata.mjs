import { readFileSync, writeFileSync } from 'node:fs';

function read(path, fallback = '') {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return fallback;
  }
}

function lines(path) {
  const value = read(path);
  return value ? value.split('\n').filter(Boolean) : [];
}

function serviceRows(path) {
  return lines(path).map((line) => {
    const [name, imageRef, imageId, containerId, state, health] = line.split('\t');
    return { name, imageRef, imageId, containerId, state, health };
  });
}

function healthRows(path) {
  return lines(path).map((line) => {
    const [url, status, checkedAt] = line.split('\t');
    return { url, status: Number(status), checkedAt };
  });
}

function requireSafeText(value, field) {
  if (/password|secret|token|credential/i.test(value)) {
    throw new Error(`${field} contains a forbidden credential marker`);
  }
  return value;
}

function extractServices() {
  const input = readFileSync(0, 'utf8');
  const config = JSON.parse(input);
  const services = config.services;
  if (!services || typeof services !== 'object') {
    throw new Error('compose config has no services');
  }
  for (const [name, service] of Object.entries(services)) {
    if (!service || typeof service !== 'object' || typeof service.image !== 'string') {
      throw new Error(`compose service ${name} has no image`);
    }
    process.stdout.write(`${name}\t${service.image}\n`);
  }
}

function writeMetadata(stateDirectory, outputPath) {
  const failureStage = read(`${stateDirectory}/failure-stage`);
  const failureMessage = read(`${stateDirectory}/failure-message`);
  const metadata = {
    schemaVersion: 1,
    releaseId: requireSafeText(read(`${stateDirectory}/release-id`), 'releaseId'),
    status: read(`${stateDirectory}/status`),
    timestamps: {
      startedAt: read(`${stateDirectory}/started-at`),
      backupCreatedAt: read(`${stateDirectory}/backup-created-at`),
      backupVerifiedAt: read(`${stateDirectory}/backup-verified-at`),
      completedAt: read(`${stateDirectory}/completed-at`) || null,
      failedAt: read(`${stateDirectory}/failed-at`) || null,
    },
    source: {
      commit: read(`${stateDirectory}/git-commit`),
      dirty: read(`${stateDirectory}/git-dirty`) === 'true',
    },
    compose: {
      project: requireSafeText(read(`${stateDirectory}/compose-project`), 'compose project'),
      file: read(`${stateDirectory}/compose-file`),
      configSha256: read(`${stateDirectory}/compose-sha256`),
      serviceHashes: lines(`${stateDirectory}/compose-hashes`),
    },
    migrations: lines(`${stateDirectory}/migrations`),
    databaseBackup: {
      path: read(`${stateDirectory}/backup-path`),
      format: 'postgres-custom',
      sha256: read(`${stateDirectory}/backup-sha256`),
      listEntries: Number(read(`${stateDirectory}/backup-list-entries`, '0')),
    },
    rollback: {
      services: serviceRows(`${stateDirectory}/rollback-services.tsv`),
    },
    deployment: {
      services: serviceRows(`${stateDirectory}/deployment-services.tsv`),
      healthChecks: healthRows(`${stateDirectory}/health.tsv`),
    },
    failure: failureStage
      ? {
          stage: failureStage,
          code: failureMessage,
        }
      : null,
    manualRestoreTemplate:
      'docker compose --env-file <ENV_FILE> -p <COMPOSE_PROJECT> -f <COMPOSE_FILE> exec -T postgres pg_restore --no-owner --dbname "$POSTGRES_DB" < <BACKUP_FILE>',
  };
  writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
}

function prepareVerification(metadataPath, stateDirectory) {
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
  if (metadata.schemaVersion !== 1 || metadata.databaseBackup?.format !== 'postgres-custom') {
    throw new Error('unsupported rollback metadata schema');
  }
  if (!metadata.databaseBackup.path || !metadata.databaseBackup.sha256) {
    throw new Error('rollback metadata has no verified backup');
  }
  const services = metadata.deployment?.services;
  const healthChecks = metadata.deployment?.healthChecks;
  if (!Array.isArray(services) || !Array.isArray(healthChecks)) {
    throw new Error('rollback metadata has no deployment health snapshot');
  }
  writeFileSync(`${stateDirectory}/backup-path`, `${metadata.databaseBackup.path}\n`);
  writeFileSync(`${stateDirectory}/backup-sha256`, `${metadata.databaseBackup.sha256}\n`);
  writeFileSync(
    `${stateDirectory}/services.tsv`,
    services
      .map(
        (service) =>
          `${service.name}\t${service.imageRef}\t${service.imageId}\t${service.state}\t${service.health}`,
      )
      .join('\n') + '\n',
  );
  writeFileSync(
    `${stateDirectory}/health-urls`,
    healthChecks.map((check) => check.url).join('\n') + '\n',
  );
}

const [command, ...args] = process.argv.slice(2);

if (command === 'extract-services' && args.length === 0) {
  extractServices();
} else if (command === 'write' && args.length === 2) {
  writeMetadata(args[0], args[1]);
} else if (command === 'prepare-verification' && args.length === 2) {
  prepareVerification(args[0], args[1]);
} else {
  process.stderr.write(
    'usage: release-metadata.mjs <extract-services|write|prepare-verification>\n',
  );
  process.exit(64);
}
