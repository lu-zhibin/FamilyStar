const offlineHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#689f38">
  <title>FamilyStar - 当前处于离线状态</title>
  <style>
    * { box-sizing: border-box; }
    html { min-width: 320px; min-height: 100%; background: #fff8e7; color: #5d4037; font-family: system-ui, sans-serif; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; background: radial-gradient(circle at top, #dcedc8 0, transparent 42%), #fff8e7; }
    main { width: min(100%, 560px); padding: clamp(24px, 7vw, 48px); border: 1px solid #e8d5b7; border-radius: 24px; background: #fff; box-shadow: 0 12px 32px rgb(93 64 55 / 12%); text-align: center; }
    .star { display: grid; width: 80px; height: 80px; margin: 0 auto 24px; place-items: center; border-radius: 24px; background: linear-gradient(135deg, #ffc107, #ff9800); color: #5d4037; font-size: 44px; line-height: 1; }
    h1 { margin: 0; font-size: clamp(1.65rem, 7vw, 2.35rem); line-height: 1.2; }
    p { margin: 16px auto 0; max-width: 38ch; color: #6d554d; font-size: clamp(1rem, 3.5vw, 1.125rem); line-height: 1.65; }
    button { min-height: 48px; margin-top: 28px; padding: 0 24px; border: 0; border-radius: 16px; background: #689f38; color: #fff; font: inherit; font-weight: 800; cursor: pointer; }
    button:focus-visible { outline: 3px solid #4fc3f7; outline-offset: 3px; }
    @media (max-width: 420px) { body { padding: 16px; } main { border-radius: 20px; } }
  </style>
</head>
<body>
  <main>
    <div class="star" aria-hidden="true">★</div>
    <h1>暂时连接不到网络</h1>
    <p>FamilyStar 已保留离线应用壳。网络恢复后，请重新尝试打开刚才的页面。</p>
    <button type="button" onclick="location.reload()">重新连接</button>
  </main>
</body>
</html>`;

export function GET() {
  return new Response(offlineHtml, {
    headers: {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
