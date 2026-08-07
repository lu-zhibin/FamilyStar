import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'FamilyStar 家庭成长助手',
    short_name: 'FamilyStar',
    description: '陪伴家庭完成任务、打卡和成长激励。',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#fff8e7',
    theme_color: '#689f38',
    lang: 'zh-CN',
    icons: [
      {
        src: '/icons/familystar-192.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icons/familystar-512.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
