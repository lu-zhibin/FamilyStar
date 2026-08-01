import { readdir, readFile } from 'node:fs/promises';

import { verifyDataModelContract } from './data-model-contract.js';

const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migrationsUrl = new URL('../prisma/migrations/', import.meta.url);
const migrationDirectories = (await readdir(migrationsUrl, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .sort((left, right) => left.name.localeCompare(right.name));
const migration = (
  await Promise.all(
    migrationDirectories.map((entry) =>
      readFile(new URL(`${entry.name}/migration.sql`, migrationsUrl), 'utf8'),
    ),
  )
).join('\n');

verifyDataModelContract(schema, migration);

console.log('Prisma core data model and migration history contracts are valid.');
