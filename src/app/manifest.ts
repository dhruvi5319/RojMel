import type { MetadataRoute } from 'next'

/** Lets the app be installed to the home screen on the pump's phone. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Rojmel',
    short_name: 'Rojmel',
    description: 'Daily sales, credit customers and billing for a petrol pump',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f7f5',
    theme_color: '#0f6b4f',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  }
}
