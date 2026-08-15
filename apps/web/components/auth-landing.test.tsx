import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AuthLanding, ChildLoginForm, FamilyLookupForm, ParentForm } from './auth-landing';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

describe('AuthLanding', () => {
  it('renders the session-aware FamilyStar entry shell', () => {
    const markup = renderToStaticMarkup(<AuthLanding />);

    expect(markup).toContain('正在打开你的家庭空间');
    expect(markup).toContain('aria-live="polite"');
  });

  it('anchors dynamic identity forms below a stable heading', () => {
    const source = AuthLanding.toString();

    expect(source).toContain('items-start justify-center');
    expect(source).toContain('今天以谁的身份出发？');
  });

  it('renders parent login and registration fields', () => {
    const login = renderToStaticMarkup(
      <ParentForm mode="login" pending={false} onModeChange={vi.fn()} onSubmit={vi.fn()} />,
    );
    const register = renderToStaticMarkup(
      <ParentForm mode="register" pending={false} onModeChange={vi.fn()} onSubmit={vi.fn()} />,
    );

    expect(login).toContain('进入家长端');
    expect(login).toContain('创建新家庭');
    expect(login).toContain('autoComplete="current-password"');
    expect(register).toContain('家庭名称');
    expect(register).toContain('你的昵称');
    expect(register).toContain('minLength="12"');
  });

  it('renders the family-code lookup contract', () => {
    const markup = renderToStaticMarkup(
      <FamilyLookupForm code="123456" pending={false} onCodeChange={vi.fn()} onSubmit={vi.fn()} />,
    );

    expect(markup).toContain('6 位数字家庭码');
    expect(markup).toContain('pattern="[0-9]{6}"');
    expect(markup).toContain('inputMode="numeric"');
    expect(markup).toContain('minLength="6"');
    expect(markup).toContain('maxLength="6"');
    expect(markup).toContain('value="123456"');
  });

  it('renders child selection and PIN constraints', () => {
    const markup = renderToStaticMarkup(
      <ChildLoginForm
        family={{
          family: { name: '星星家庭', family_code: '123456' },
          children: [{ id: 'child-1', nickname: '小星', grade: '三年级', avatar_media_id: null }],
        }}
        pending={false}
        selectedChildId="child-1"
        onBack={vi.fn()}
        onSelect={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(markup).toContain('星星家庭');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('pattern="[0-9]{4,6}"');
    expect(markup).toContain('进入我的成长空间');
  });

  it('guides parents when a family has no child profiles', () => {
    const markup = renderToStaticMarkup(
      <ChildLoginForm
        family={{ family: { name: '星星家庭', family_code: '123456' }, children: [] }}
        pending={false}
        selectedChildId=""
        onBack={vi.fn()}
        onSelect={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(markup).toContain('这个家庭还没有孩子档案');
    expect(markup).toContain('请家长登录后');
  });
});
