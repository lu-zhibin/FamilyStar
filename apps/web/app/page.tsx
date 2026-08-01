import type { ServiceInfo } from '@familystar/shared';
import { CheckCircle2, PanelsTopLeft, Sparkles, Star } from 'lucide-react';
import type { ReactNode } from 'react';

const service: ServiceInfo = {
  name: 'FamilyStar Web',
  version: '0.1.0',
};

export default function HomePage() {
  return (
    <main className="page-shell flex min-h-screen items-center py-10 mobile:py-6">
      <section className="relative w-full overflow-hidden rounded-card-lg border-2 border-wood bg-white/80 p-8 shadow-warm-lg backdrop-blur-sm mobile:p-5">
        <div className="absolute -right-16 -top-20 size-56 rounded-full bg-sun/20 blur-3xl" />
        <div className="absolute -bottom-20 -left-16 size-56 rounded-full bg-leaf/20 blur-3xl" />

        <div className="relative">
          <div className="mb-8 flex items-center justify-between gap-4 mobile:mb-6">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-card bg-gradient-to-br from-sun to-orange text-white shadow-orange">
                <Star aria-hidden="true" size={24} strokeWidth={2.5} />
              </span>
              <div>
                <p className="font-display text-title text-leaf-dark">FamilyStar</p>
                <p className="text-caption font-bold text-brown-light">
                  Phase 1 · Visual Foundation
                </p>
              </div>
            </div>
            <span className="rounded-pill bg-leaf-light px-3 py-1.5 text-label font-extrabold text-leaf-dark">
              v{service.version}
            </span>
          </div>

          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-pill bg-cream px-3 py-2 text-caption font-extrabold text-brown">
              <Sparkles aria-hidden="true" className="text-orange" size={18} />
              温暖、清晰、适合全家使用
            </div>
            <h1 className="font-display text-[clamp(2.25rem,7vw,4.75rem)] leading-[0.98] tracking-[-0.035em] text-brown">
              让每一次成长
              <span className="mt-2 block text-orange">都闪闪发光</span>
            </h1>
            <p className="mt-6 max-w-2xl text-list font-semibold leading-8 text-brown-light mobile:mt-4 mobile:text-body mobile:leading-7">
              {service.name} 已接入 FamilyStar Design Tokens、品牌字体、响应式断点与 Lucide
              图标基础。
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-4 mobile:mt-7 md:grid-cols-2 lg:grid-cols-3">
            <FoundationCard
              icon={<PanelsTopLeft aria-hidden="true" size={22} />}
              title="响应式布局"
              detail="320px 至 2560px"
            />
            <FoundationCard
              icon={<Sparkles aria-hidden="true" size={22} />}
              title="独立设计 Tokens"
              detail="暖色、圆角与柔和阴影"
            />
            <FoundationCard
              icon={<CheckCircle2 aria-hidden="true" size={22} />}
              title="工程基线就绪"
              detail="Tailwind CSS + Lucide"
            />
          </div>
        </div>
      </section>
    </main>
  );
}

type FoundationCardProps = Readonly<{
  detail: string;
  icon: ReactNode;
  title: string;
}>;

function FoundationCard({ detail, icon, title }: FoundationCardProps) {
  return (
    <article className="rounded-card border-2 border-wood bg-cream/75 p-4 shadow-warm transition duration-200 hover:-translate-y-0.5 hover:shadow-warm-lg">
      <span className="mb-4 grid size-10 place-items-center rounded-card bg-leaf-light text-leaf-dark">
        {icon}
      </span>
      <h2 className="font-display text-section text-brown">{title}</h2>
      <p className="mt-1 text-caption font-bold text-brown-light">{detail}</p>
    </article>
  );
}
