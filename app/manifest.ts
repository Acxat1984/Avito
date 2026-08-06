import type { MetadataRoute } from 'next';

/** Ярлык на домашнем экране открывается сразу в админке, без адресной строки. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'База ООО — админка',
    short_name: 'База ООО',
    start_url: '/admin',
    display: 'standalone',
    background_color: '#f9fafb',
    theme_color: '#0f766e',
    lang: 'ru',
  };
}
