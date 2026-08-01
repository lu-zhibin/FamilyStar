import assert from 'node:assert/strict';

import { ERROR_CODES } from '@familystar/shared';

import { createApp } from '../src/app.js';

const requestId = 'contract-check_1';
const logs: string[] = [];
const originalInfo = console.info;

console.info = (message?: unknown) => {
  logs.push(String(message));
};

try {
  const app = createApp({ publicBaseUrl: 'http://localhost:3000' });
  const serviceResponse = await app.request('/api/v1', {
    headers: {
      Origin: 'http://localhost:3000',
      'X-Request-Id': requestId,
    },
  });
  const serviceBody = await serviceResponse.json();

  assert.equal(serviceResponse.status, 200);
  assert.equal(serviceResponse.headers.get('X-Request-Id'), requestId);
  assert.equal(serviceResponse.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000');
  assert.equal(serviceBody.success, true);
  assert.equal(serviceBody.data.name, 'FamilyStar API');
  assert.equal(serviceBody.meta.request_id, requestId);
  assert.equal(Number.isNaN(Date.parse(serviceBody.meta.timestamp)), false);

  const healthResponse = await app.request('/api/v1/health');
  const healthBody = await healthResponse.json();

  assert.equal(healthResponse.status, 200);
  assert.equal(healthBody.success, true);
  assert.equal(healthBody.data.status, 'ok');
  assert.equal(healthBody.data.version, '0.1.0');
  assert.equal(typeof healthBody.data.uptime_seconds, 'number');
  assert.equal(healthBody.data.checked_at, healthBody.meta.timestamp);

  const missingResponse = await app.request('/api/v1/missing');
  const missingBody = await missingResponse.json();

  assert.equal(missingResponse.status, 404);
  assert.equal(missingBody.success, false);
  assert.equal(missingBody.error.code, ERROR_CODES.NOT_FOUND);
  assert.equal(missingBody.meta.request_id, missingResponse.headers.get('X-Request-Id'));

  const invalidRequestIdResponse = await app.request('/api/v1', {
    headers: { 'X-Request-Id': 'invalid request id' },
  });
  const generatedRequestId = invalidRequestIdResponse.headers.get('X-Request-Id');

  assert.notEqual(generatedRequestId, 'invalid request id');
  assert.match(generatedRequestId ?? '', /^[0-9a-f-]{36}$/);

  assert.equal(logs.length, 4);
  const requestLog = JSON.parse(logs[0] ?? '{}');
  assert.equal(requestLog.event, 'http_request');
  assert.equal(requestLog.request_id, requestId);
  assert.equal(requestLog.method, 'GET');
  assert.equal(requestLog.path, '/api/v1');
  assert.equal(requestLog.status, 200);
  assert.equal(typeof requestLog.duration_ms, 'number');
} finally {
  console.info = originalInfo;
}

console.log('API foundation contract is valid.');
