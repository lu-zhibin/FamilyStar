import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

const projectRoot = resolve(import.meta.dirname, '..');
const releaseScript = join(projectRoot, 'ops/release-migrate.sh');
const verifyScript = join(projectRoot, 'ops/verify-release.sh');

type Fixture = ReturnType<typeof fixture>;

function executable(path: string, content: string) {
  writeFileSync(path, content, { mode: 0o700 });
  chmodSync(path, 0o700);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'familystar-release-contract-'));
  const bin = join(root, 'bin');
  const backup = join(root, 'backup');
  const envFile = join(root, 'release.env');
  const composeFile = join(root, 'compose.yml');
  const log = join(root, 'commands.log');

  spawnSync('mkdir', [bin, backup], { encoding: 'utf8' });
  writeFileSync(envFile, 'POSTGRES_PASSWORD=top-secret-token\n');
  writeFileSync(composeFile, 'services: {}\n');
  writeFileSync(log, '');

  executable(
    join(bin, 'git'),
    `#!/bin/sh
set -eu
if [ "\${FAKE_GIT_FAILURE:-0}" = 1 ]; then
  exit 1
fi
case "$*" in
  *'rev-parse HEAD'*) printf '%s\\n' '0123456789abcdef0123456789abcdef01234567' ;;
  *'status --porcelain'*) printf '%s\\n' ' M safe-file.txt' ;;
  *) exit 1 ;;
esac
`,
  );

  executable(
    join(bin, 'curl'),
    `#!/bin/sh
set -eu
printf '%s\\n' 'HTTP' >> "$FAKE_LOG"
if [ "\${FAKE_HTTP_FAILURE:-0}" = 1 ]; then
  exit 22
fi
case "$*" in
  *'--write-out'*) printf '%s' '200' ;;
esac
`,
  );

  executable(
    join(bin, 'docker'),
    `#!/bin/sh
set -eu
COMMAND=$*
case "$COMMAND" in
  *'config --format json'*)
    printf '%s\\n' '{"services":{"postgres":{"image":"postgres:16-alpine","environment":{"POSTGRES_PASSWORD":"top-secret-token"}},"redis":{"image":"redis:7-alpine"},"migrate":{"image":"registry.example/familystar:release-api"},"api":{"image":"registry.example/familystar:release-api"},"worker":{"image":"registry.example/familystar:release-worker"},"web":{"image":"registry.example/familystar:release-web"}}}'
    ;;
  *'config --hash '* )
    printf '%s\\n' 'postgres hash-postgres' 'redis hash-redis' 'migrate hash-migrate' 'api hash-api' 'worker hash-worker' 'web hash-web'
    ;;
  'image inspect '* )
    IMAGE_REF=unknown
    for VALUE in "$@"; do
      IMAGE_REF=$VALUE
    done
    printf 'sha256:%s\\n' "$(printf '%s' "$IMAGE_REF" | sha256sum | cut -d ' ' -f 1)"
    ;;
  *'exec -T postgres sh -c '* )
    printf '%s\\n' 'DUMP' >> "$FAKE_LOG"
    if [ "\${FAKE_BACKUP_FAILURE:-0}" = 1 ]; then
      exit 1
    fi
    printf '%s\\n' 'PGDMP custom backup payload'
    ;;
  *'exec -T postgres pg_restore --list'* )
    printf '%s\\n' 'LIST' >> "$FAKE_LOG"
    if [ "\${FAKE_MANIFEST_FAILURE:-0}" = 1 ]; then
      exit 1
    fi
    printf '%s\\n' '1; 0 0 TABLE public Family familystar'
    ;;
  *'run --rm -e RUN_MIGRATIONS=1 migrate'* )
    printf '%s\\n' 'MIGRATE' >> "$FAKE_LOG"
    ;;
  *'up -d postgres redis' )
    printf '%s\\n' 'DATA_UP' >> "$FAKE_LOG"
    ;;
  *'up -d postgres redis api worker web'* )
    printf '%s\\n' 'UP' >> "$FAKE_LOG"
    ;;
  *'ps -q migrate'* )
    ;;
  *'ps -q '* )
    SERVICE=unknown
    for VALUE in "$@"; do
      SERVICE=$VALUE
    done
    printf 'container-%s\\n' "$SERVICE"
    ;;
  'inspect '* )
    if [ "\${FAKE_HEALTH_TIMEOUT:-0}" = 1 ] && \
      { case "$COMMAND" in *container-web|*container-api|*container-worker) true ;; *) false ;; esac; }; then
      case "$COMMAND" in
        *'State.Status}}|'*) printf '%s\\n' 'running|starting' ;;
        *) printf '%s\\n' 'starting' ;;
      esac
    else
      case "$COMMAND" in
        *'State.Status}}|'*) printf '%s\\n' 'running|healthy' ;;
        *) printf '%s\\n' 'healthy' ;;
      esac
    fi
    ;;
  *)
    printf 'unexpected docker command: %s\\n' "$COMMAND" >&2
    exit 1
    ;;
esac
`,
  );

  return { root, bin, backup, envFile, composeFile, log };
}

function releaseArgs(value: Fixture, releaseId = 'release-13-2') {
  return [
    releaseScript,
    '--env-file',
    value.envFile,
    '--compose-file',
    value.composeFile,
    '--compose-project',
    'familystar-contract',
    '--backup-dir',
    value.backup,
    '--release-id',
    releaseId,
    '--web-health-url',
    'http://127.0.0.1:8099/',
    '--api-health-url',
    'http://127.0.0.1:8099/api/v1/health',
    '--timeout',
    '1',
    '--interval',
    '1',
  ];
}

function runRelease(value: Fixture, extraEnvironment: NodeJS.ProcessEnv = {}, releaseId?: string) {
  return spawnSync('sh', releaseArgs(value, releaseId), {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...extraEnvironment,
      FAKE_LOG: value.log,
      PATH: `${value.bin}:${process.env.PATH}`,
    },
  });
}

function commandLog(value: Fixture) {
  return readFileSync(value.log, 'utf8').trim().split('\n').filter(Boolean);
}

describe('release migration shell contract', () => {
  it('uses POSIX fail-fast mode, retained temporary files, and atomic metadata replacement', () => {
    const source = readFileSync(releaseScript, 'utf8');
    const verifySource = readFileSync(verifyScript, 'utf8');
    expect(source).toContain('set -eu');
    expect(source).toContain('exec pg_dump --format=custom');
    expect(source).not.toContain('pg_dump --format=custom --file=-');
    expect(verifySource).toContain('set -eu');
    expect(source).toContain("trap 'on_exit $?' EXIT");
    expect(source).toContain('METADATA_TEMP=$(mktemp');
    expect(source).toContain('mv "$METADATA_TEMP" "$METADATA_PATH"');
    expect(source).toContain('compose run --rm -e RUN_MIGRATIONS=1 migrate');
    expect(`${source}\n${verifySource}`).not.toMatch(/^\s*(rm|rmdir|unlink|shred)\s/m);
  });

  it('returns stable usage for missing arguments', () => {
    const result = spawnSync('sh', [releaseScript], { encoding: 'utf8' });
    expect(result.status).toBe(64);
    expect(result.stderr).toMatch(/^usage: release-migrate\.sh /);
  });

  it('rejects broad root backup paths before invoking tools', () => {
    const value = fixture();
    const args = releaseArgs(value);
    args[args.indexOf('--backup-dir') + 1] = '/root';
    const result = spawnSync('sh', args, {
      encoding: 'utf8',
      env: { ...process.env, FAKE_LOG: value.log, PATH: `${value.bin}:${process.env.PATH}` },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toBe('E_UNSAFE_BACKUP_PATH\n');
    expect(commandLog(value)).toEqual([]);
  });

  it('allows a dedicated canonical backup directory below the operator home', () => {
    const value = fixture();
    const args = releaseArgs(value);

    const result = spawnSync('sh', args, {
      encoding: 'utf8',
      env: {
        ...process.env,
        FAKE_LOG: value.log,
        HOME: value.root,
        PATH: `${value.bin}:${process.env.PATH}`,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('release metadata:');
  });

  it('accepts an explicit commit for source archives without Git metadata', () => {
    const value = fixture();
    const args = releaseArgs(value);
    args.push('--git-commit', 'abcdef0123456789abcdef0123456789abcdef01');

    const result = spawnSync('sh', args, {
      encoding: 'utf8',
      env: {
        ...process.env,
        FAKE_GIT_FAILURE: '1',
        FAKE_LOG: value.log,
        PATH: `${value.bin}:${process.env.PATH}`,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('release metadata:');
  });

  it('rejects non-HTTP health targets and zero polling intervals', () => {
    const value = fixture();
    const unsafeUrlArgs = releaseArgs(value);
    unsafeUrlArgs[unsafeUrlArgs.indexOf('--web-health-url') + 1] = 'file:///etc/passwd';
    const unsafeUrl = spawnSync('sh', unsafeUrlArgs, {
      encoding: 'utf8',
      env: { ...process.env, FAKE_LOG: value.log, PATH: `${value.bin}:${process.env.PATH}` },
    });
    expect(unsafeUrl.status).toBe(1);
    expect(unsafeUrl.stderr).toBe('E_HEALTH_URL\n');

    const zeroIntervalArgs = releaseArgs(value);
    zeroIntervalArgs[zeroIntervalArgs.indexOf('--interval') + 1] = '0';
    const zeroInterval = spawnSync('sh', zeroIntervalArgs, {
      encoding: 'utf8',
      env: { ...process.env, FAKE_LOG: value.log, PATH: `${value.bin}:${process.env.PATH}` },
    });
    expect(zeroInterval.status).toBe(1);
    expect(zeroInterval.stderr).toBe('E_TIMEOUT\n');
    expect(commandLog(value)).toEqual([]);
  });

  it('stops before migration when pg_dump fails', () => {
    const value = fixture();
    const result = runRelease(value, { FAKE_BACKUP_FAILURE: '1' });
    expect(result.status).toBe(1);
    expect(result.stderr).toBe('E_BACKUP_FAILED\n');
    expect(commandLog(value)).toContain('DUMP');
    expect(commandLog(value)).not.toContain('MIGRATE');
  });

  it('stops before migration when pg_restore list validation fails', () => {
    const value = fixture();
    const result = runRelease(value, { FAKE_MANIFEST_FAILURE: '1' });
    expect(result.status).toBe(1);
    expect(result.stderr).toBe('E_BACKUP_MANIFEST\n');
    expect(commandLog(value)).toEqual(['DATA_UP', 'DUMP', 'LIST']);
  });

  it('keeps failed rollback metadata when container health times out', () => {
    const value = fixture();
    const result = runRelease(value, { FAKE_HEALTH_TIMEOUT: '1' });
    expect(result.status).toBe(1);
    expect(result.stderr).toBe('E_HEALTH_TIMEOUT\n');
    const metadata = JSON.parse(
      readFileSync(join(value.backup, 'release-13-2.rollback.json'), 'utf8'),
    );
    expect(metadata.status).toBe('failed');
    expect(metadata.failure).toEqual({ stage: 'health', code: 'E_HEALTH_TIMEOUT' });
    expect(metadata.databaseBackup.sha256).toMatch(/^[a-f0-9]{64}$/);
  }, 10_000);

  it('writes credential-free metadata atomically after backup verification and in order', () => {
    const value = fixture();
    const result = runRelease(value);
    expect(result.status, result.stderr).toBe(0);
    expect(commandLog(value)).toEqual(['DATA_UP', 'DUMP', 'LIST', 'MIGRATE', 'UP', 'HTTP', 'HTTP']);

    const metadataPath = join(value.backup, 'release-13-2.rollback.json');
    const metadataText = readFileSync(metadataPath, 'utf8');
    const metadata = JSON.parse(metadataText);
    expect(metadata.status).toBe('healthy');
    expect(metadata.schemaVersion).toBe(1);
    expect(metadata.source).toEqual({
      commit: '0123456789abcdef0123456789abcdef01234567',
      dirty: true,
    });
    expect(metadata.rollback.services).toHaveLength(6);
    expect(metadata.deployment.services).toHaveLength(6);
    expect(metadata.deployment.healthChecks).toHaveLength(2);
    expect(metadata.databaseBackup.listEntries).toBeGreaterThan(0);
    expect(metadata.databaseBackup.path).toBe(join(value.backup, 'release-13-2.dump'));
    expect(metadataText).not.toContain('top-secret-token');
    expect(metadataText).not.toContain('POSTGRES_PASSWORD');
    expect(metadata.manualRestoreTemplate).toContain('<BACKUP_FILE>');
    expect(metadata.manualRestoreTemplate).toContain('<ENV_FILE>');
  });

  it('revalidates backup, image IDs, containers, and HTTP without migration', () => {
    const value = fixture();
    expect(runRelease(value).status).toBe(0);
    writeFileSync(value.log, '');
    const result = spawnSync(
      'sh',
      [
        verifyScript,
        '--env-file',
        value.envFile,
        '--compose-file',
        value.composeFile,
        '--compose-project',
        'familystar-contract',
        '--metadata',
        join(value.backup, 'release-13-2.rollback.json'),
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, FAKE_LOG: value.log, PATH: `${value.bin}:${process.env.PATH}` },
      },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('verification: ok');
    expect(commandLog(value)).toEqual(['LIST', 'HTTP', 'HTTP']);
    expect(commandLog(value)).not.toContain('MIGRATE');
  });
});
