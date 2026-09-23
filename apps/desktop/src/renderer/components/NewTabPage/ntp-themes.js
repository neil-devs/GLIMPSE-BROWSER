/**
 * @fileoverview NTP Customization Themes & Colors
 */

// 120 curated high-quality background images using Picsum Photos IDs
// These IDs correspond to nice landscapes, nature, and architectural photos.
const curatedIds = Array.from({ length: 120 }).map((_, i) => i + 10);

export const THEME_IMAGES = curatedIds.map(id => ({
  id: String(id),
  url: `https://picsum.photos/id/${id}/1920/1080`,
  thumb: `https://picsum.photos/id/${id}/300/200`
}));

export const SOLID_COLORS = [
  { id: 'default', color: '#1a1a1d', label: 'Default Dark' },
  { id: 'blue', color: '#1a365d', label: 'Navy Blue' },
  { id: 'teal', color: '#014f59', label: 'Deep Teal' },
  { id: 'green', color: '#14532d', label: 'Forest Green' },
  { id: 'red', color: '#7f1d1d', label: 'Crimson Red' },
  { id: 'purple', color: '#4c1d95', label: 'Royal Purple' },
  { id: 'pink', color: '#831843', label: 'Dark Pink' },
  { id: 'orange', color: '#7c2d12', label: 'Burnt Orange' },
  { id: 'slate', color: '#0f172a', label: 'Slate' },
  { id: 'zinc', color: '#18181b', label: 'Zinc' },
  { id: 'charcoal', color: '#27272a', label: 'Charcoal' },
  { id: 'light-gray', color: '#f3f4f6', label: 'Light Gray', isLight: true },
  { id: 'light-blue', color: '#e0f2fe', label: 'Sky Blue', isLight: true },
  { id: 'light-green', color: '#dcfce7', label: 'Mint', isLight: true },
  { id: 'light-yellow', color: '#fef08a', label: 'Lemon', isLight: true },
  { id: 'light-pink', color: '#fce7f3', label: 'Rose', isLight: true },
];
