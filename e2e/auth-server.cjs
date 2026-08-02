const { createServer } = require('node:http');

const port = Number(process.env.E2E_AUTH_PORT ?? 3001);

createServer((request, response) => {
  const token = /familystar_session=([^;]+)/.exec(request.headers.cookie ?? '')?.[1];
  if (request.url === '/api/v1/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  if (request.url === '/api/v1/auth/session' && token) {
    const role = token === 'child-e2e-session' ? 'child' : 'parent';
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        success: true,
        data: {
          role,
          subject_id: `${role}-e2e`,
          family_id: 'family-e2e',
          family_code: '123456',
        },
        meta: { request_id: 'playwright-auth', timestamp: new Date().toISOString() },
      }),
    );
    return;
  }
  response.writeHead(401, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ success: false }));
}).listen(port, '127.0.0.1');
