'use client';

import {
  ArrowLeft,
  ArrowRight,
  Baby,
  CheckCircle2,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  AuthApiError,
  authApi,
  type ChildFamilyResult,
  type ParentAuthResult,
  type SessionIdentity,
  loginErrorMessage,
} from '../lib/auth';

export type Identity = 'parent' | 'child';
export type ParentMode = 'login' | 'register';

export function AuthLanding() {
  const router = useRouter();
  const [identity, setIdentity] = useState<Identity>('parent');
  const [parentMode, setParentMode] = useState<ParentMode>('login');
  const [checkingSession, setCheckingSession] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [familyCode, setFamilyCode] = useState('');
  const [childFamily, setChildFamily] = useState<ChildFamilyResult | null>(null);
  const [selectedChildId, setSelectedChildId] = useState('');

  useEffect(() => {
    let active = true;
    authApi<SessionIdentity>('/auth/session')
      .then((session) => {
        if (!active) return;
        window.localStorage.setItem('familystar_role', session.role);
        window.localStorage.setItem('familystar_family_code', session.family_code);
        router.replace(session.role === 'parent' ? '/dashboard' : '/child');
      })
      .catch((sessionError: unknown) => {
        if (active && (!(sessionError instanceof AuthApiError) || sessionError.status !== 401)) {
          setError('会话检查暂时不可用，你仍可重新登录');
        }
      })
      .finally(() => active && setCheckingSession(false));
    return () => {
      active = false;
    };
  }, [router]);

  function chooseIdentity(nextIdentity: Identity) {
    setIdentity(nextIdentity);
    setError('');
  }

  async function submitParent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const login = parentMode === 'login';
    const payload = login
      ? { email: String(form.get('email')), password: String(form.get('password')) }
      : {
          family_name: String(form.get('family_name')),
          nickname: String(form.get('nickname')),
          email: String(form.get('email')),
          password: String(form.get('password')),
          time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
    try {
      const result = await authApi<ParentAuthResult>(
        login ? '/auth/parent/login' : '/auth/parent/register',
        { method: 'POST', body: JSON.stringify(payload) },
      );
      window.localStorage.setItem('familystar_role', 'parent');
      window.localStorage.setItem('familystar_family_code', result.parent.familyCode);
      router.replace('/dashboard');
    } catch (submitError) {
      setError(loginErrorMessage(submitError));
    } finally {
      setPending(false);
    }
  }

  async function findFamily(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const normalizedCode = familyCode.trim();
    try {
      const result = await authApi<ChildFamilyResult>('/auth/child/family', {
        method: 'POST',
        body: JSON.stringify({ family_code: normalizedCode }),
      });
      setFamilyCode(normalizedCode);
      setChildFamily(result);
      setSelectedChildId(result.children[0]?.id ?? '');
    } catch (lookupError) {
      setError(loginErrorMessage(lookupError));
    } finally {
      setPending(false);
    }
  }

  async function submitChild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const result = await authApi<{ child: { id: string } }>('/auth/child/login', {
        method: 'POST',
        body: JSON.stringify({
          family_code: familyCode,
          child_id: selectedChildId,
          credential: String(form.get('credential')),
        }),
      });
      window.localStorage.setItem('familystar_role', 'child');
      window.localStorage.setItem('familystar_child_id', result.child.id);
      window.localStorage.setItem('familystar_family_code', familyCode);
      router.replace('/child');
    } catch (submitError) {
      setError(loginErrorMessage(submitError));
    } finally {
      setPending(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="grid min-h-screen place-items-center px-5" aria-live="polite">
        <div className="text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-card-lg bg-gradient-to-br from-sun to-orange text-white shadow-orange">
            <Star fill="currentColor" size={32} />
          </span>
          <LoaderCircle className="mx-auto mt-6 animate-spin text-leaf-dark" size={24} />
          <p className="mt-3 font-extrabold text-brown-light">正在打开你的家庭空间</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-5 py-8 mobile:px-4 mobile:py-4">
      <div className="pointer-events-none absolute -left-20 top-10 size-72 rounded-full bg-sky/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 size-80 rounded-full bg-sun/20 blur-3xl" />
      <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] max-w-[1120px] overflow-hidden rounded-[28px] border border-wood bg-white/90 shadow-warm-lg backdrop-blur md:grid-cols-[0.9fr_1.1fr] mobile:min-h-[calc(100vh-2rem)]">
        <WelcomePanel />
        <section
          className="flex items-start justify-center p-8 mobile:p-5"
          aria-label="FamilyStar 登录"
        >
          <div className="w-full max-w-[470px]">
            <header className="mb-7">
              <p className="eyebrow">欢迎回家</p>
              <h1 className="font-display text-[clamp(2rem,5vw,3rem)] leading-tight text-brown">
                今天以谁的身份出发？
              </h1>
              <p className="mt-2 font-semibold text-brown-light">
                一个入口，连接全家的每一次成长。
              </p>
            </header>

            <div className="grid grid-cols-2 gap-2 rounded-card-lg bg-sand p-1.5" role="tablist">
              <IdentityTab
                active={identity === 'parent'}
                controls="parent-login-panel"
                icon={<Users size={19} />}
                id="parent-login-tab"
                label="我是家长"
                onClick={() => chooseIdentity('parent')}
              />
              <IdentityTab
                active={identity === 'child'}
                controls="child-login-panel"
                icon={<Baby size={20} />}
                id="child-login-tab"
                label="我是孩子"
                onClick={() => chooseIdentity('child')}
              />
            </div>

            <div
              aria-labelledby={`${identity}-login-tab`}
              className="mt-6"
              id={`${identity}-login-panel`}
              role="tabpanel"
            >
              {identity === 'parent' ? (
                <ParentForm
                  mode={parentMode}
                  pending={pending}
                  onModeChange={(mode) => {
                    setParentMode(mode);
                    setError('');
                  }}
                  onSubmit={submitParent}
                />
              ) : childFamily ? (
                <ChildLoginForm
                  family={childFamily}
                  pending={pending}
                  selectedChildId={selectedChildId}
                  onBack={() => {
                    setChildFamily(null);
                    setSelectedChildId('');
                    setError('');
                  }}
                  onSelect={setSelectedChildId}
                  onSubmit={submitChild}
                />
              ) : (
                <FamilyLookupForm
                  code={familyCode}
                  pending={pending}
                  onCodeChange={setFamilyCode}
                  onSubmit={findFamily}
                />
              )}
            </div>

            {error && (
              <p
                className="mt-4 rounded-card border border-coral/40 bg-coral/10 px-4 py-3 text-caption font-extrabold text-red"
                role="alert"
              >
                {error}
              </p>
            )}

            <footer className="mt-6 flex items-center justify-center gap-2 text-label font-bold text-brown-light">
              <ShieldCheck size={16} className="text-leaf-dark" />
              登录信息仅用于保护你的家庭空间
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}

function WelcomePanel() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-leaf-dark via-leaf to-sky p-10 text-white mobile:p-6">
      <div className="absolute -right-16 -top-16 size-52 rounded-full border-[32px] border-white/10" />
      <div className="absolute -bottom-14 -left-10 size-44 rounded-full bg-sun/35 blur-sm" />
      <div className="relative flex h-full min-h-[610px] flex-col mobile:min-h-0">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-card bg-white text-orange shadow-warm">
            <Star fill="currentColor" size={26} />
          </span>
          <div>
            <strong className="block font-display text-page leading-7">FamilyStar</strong>
            <span className="text-label font-extrabold text-white/80">全家人的成长伙伴</span>
          </div>
        </div>

        <div className="my-auto py-12 mobile:py-8">
          <span className="inline-flex items-center gap-2 rounded-pill bg-white/20 px-3 py-2 text-caption font-extrabold backdrop-blur">
            <Sparkles size={17} /> 每天一点点，成长看得见
          </span>
          <h2 className="mt-5 max-w-md font-display text-[clamp(2.4rem,5vw,4.4rem)] leading-[1.02] tracking-[-0.035em]">
            把好习惯，变成全家的闪光时刻
          </h2>
          <div className="mt-8 grid gap-3 text-body font-bold text-white/90">
            <WelcomePoint text="孩子完成任务，收获积分与成就" />
            <WelcomePoint text="家长轻松鼓励，见证每一步成长" />
            <WelcomePoint text="共同目标，让家庭协作更有温度" />
          </div>
        </div>

        <p className="text-caption font-bold text-white/75">温暖陪伴 · 正向激励 · 安全私密</p>
      </div>
    </section>
  );
}

function WelcomePoint({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-7 place-items-center rounded-full bg-white/20">
        <CheckCircle2 size={17} />
      </span>
      {text}
    </div>
  );
}

function IdentityTab({
  active,
  controls,
  icon,
  id,
  label,
  onClick,
}: {
  active: boolean;
  controls: string;
  icon: React.ReactNode;
  id: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-controls={controls}
      aria-selected={active}
      id={id}
      className={`flex min-h-12 items-center justify-center gap-2 rounded-card font-extrabold transition ${
        active ? 'bg-white text-leaf-dark shadow-warm' : 'text-brown-light hover:text-brown'
      }`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

export function ParentForm({
  mode,
  pending,
  onModeChange,
  onSubmit,
}: {
  mode: ParentMode;
  pending: boolean;
  onModeChange: (mode: ParentMode) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const registering = mode === 'register';
  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      {registering && (
        <div className="grid grid-cols-2 gap-3 mobile:grid-cols-1">
          <AuthField label="家庭名称" name="family_name" placeholder="例如：小星星家庭" />
          <AuthField label="你的昵称" name="nickname" placeholder="家长昵称" />
        </div>
      )}
      <AuthField
        autoComplete="email"
        icon={<Mail size={18} />}
        label="邮箱"
        name="email"
        placeholder="parent@example.com"
        type="email"
      />
      <AuthField
        autoComplete={registering ? 'new-password' : 'current-password'}
        icon={<LockKeyhole size={18} />}
        label="密码"
        minLength={registering ? 12 : 1}
        name="password"
        placeholder={registering ? '至少 12 个字符' : '输入登录密码'}
        type="password"
      />
      <button className="primary-button min-h-12 w-full text-body" disabled={pending} type="submit">
        {pending && <LoaderCircle className="animate-spin" size={18} />}
        {registering ? '创建家庭' : '进入家长端'}
        {!pending && <ArrowRight size={18} />}
      </button>
      <p className="text-center text-caption font-bold text-brown-light">
        {registering ? '已有家庭账号？' : '第一次使用 FamilyStar？'}{' '}
        <button
          className="text-button"
          type="button"
          onClick={() => onModeChange(registering ? 'login' : 'register')}
        >
          {registering ? '返回登录' : '创建新家庭'}
        </button>
      </p>
    </form>
  );
}

export function FamilyLookupForm({
  code,
  pending,
  onCodeChange,
  onSubmit,
}: {
  code: string;
  pending: boolean;
  onCodeChange: (code: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <div className="rounded-card bg-leaf-light/60 p-4">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 shrink-0 text-leaf-dark" size={21} />
          <div>
            <strong className="font-display text-section">找到你的家庭</strong>
            <p className="mt-1 text-caption font-bold text-brown-light">
              家庭码可以向家长询问，也能在家长端“家庭成员”页面找到。
            </p>
          </div>
        </div>
      </div>
      <label className="field-label">
        6 位数字家庭码
        <input
          autoComplete="one-time-code"
          className="field text-center font-display text-title tracking-[0.2em]"
          inputMode="numeric"
          maxLength={6}
          minLength={6}
          name="family_code"
          pattern="[0-9]{6}"
          placeholder="123456"
          required
          value={code}
          onChange={(event) => onCodeChange(event.target.value)}
        />
      </label>
      <button className="primary-button min-h-12 w-full text-body" disabled={pending} type="submit">
        {pending ? <LoaderCircle className="animate-spin" size={18} /> : <Sparkles size={18} />}
        找到我的家庭
      </button>
    </form>
  );
}

export function ChildLoginForm({
  family,
  pending,
  selectedChildId,
  onBack,
  onSelect,
  onSubmit,
}: {
  family: ChildFamilyResult;
  pending: boolean;
  selectedChildId: string;
  onBack: () => void;
  onSelect: (childId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">已找到家庭</p>
          <h2 className="font-display text-page">{family.family.name}</h2>
        </div>
        <button className="secondary-button" type="button" onClick={onBack}>
          <ArrowLeft size={16} /> 换一个
        </button>
      </div>
      {family.children.length > 0 ? (
        <>
          <fieldset>
            <legend className="field-label mb-2">选择你的头像</legend>
            <div className="grid grid-cols-3 gap-3 mobile:grid-cols-2">
              {family.children.map((child, index) => {
                const selected = child.id === selectedChildId;
                const colors = ['bg-sun/40', 'bg-sky/35', 'bg-pink/35', 'bg-leaf-light'];
                return (
                  <button
                    key={child.id}
                    aria-pressed={selected}
                    className={`relative rounded-card border-2 p-3 text-center transition ${
                      selected
                        ? 'border-leaf bg-leaf-light/40 shadow-warm'
                        : 'border-wood bg-cream hover:border-orange'
                    }`}
                    type="button"
                    onClick={() => onSelect(child.id)}
                  >
                    <span
                      className={`mx-auto grid size-12 place-items-center rounded-full font-display text-title text-brown ${colors[index % colors.length]}`}
                    >
                      {child.nickname.slice(-1)}
                    </span>
                    <strong className="mt-2 block text-caption">{child.nickname}</strong>
                    <span className="text-label font-bold text-brown-light">
                      {child.grade ?? '成长探索中'}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          <AuthField
            autoComplete="current-password"
            icon={<LockKeyhole size={18} />}
            inputMode="numeric"
            label="输入你的 PIN"
            maxLength={6}
            minLength={4}
            name="credential"
            pattern="[0-9]{4,6}"
            placeholder="4-6 位数字"
            type="password"
          />
          <button
            className="child-success-button min-h-12"
            disabled={pending || selectedChildId === ''}
            type="submit"
          >
            {pending && <LoaderCircle className="animate-spin" size={18} />}
            进入我的成长空间
            {!pending && <ArrowRight size={18} />}
          </button>
        </>
      ) : (
        <div className="empty-state">
          <Baby size={32} />
          <strong>这个家庭还没有孩子档案</strong>
          <p>请家长登录后，在“家庭成员”中添加孩子。</p>
        </div>
      )}
    </form>
  );
}

type AuthFieldProps = {
  autoComplete?: string;
  icon?: React.ReactNode;
  inputMode?: 'text' | 'email' | 'numeric';
  label: string;
  maxLength?: number;
  minLength?: number;
  name: string;
  pattern?: string;
  placeholder: string;
  type?: string;
};

function AuthField({ icon, label, ...input }: AuthFieldProps) {
  return (
    <label className="field-label">
      {label}
      <span className="relative block">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-brown-light">
            {icon}
          </span>
        )}
        <input className={`field ${icon ? 'pl-10' : ''}`} required {...input} />
      </span>
    </label>
  );
}
