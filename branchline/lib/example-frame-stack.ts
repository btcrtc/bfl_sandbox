export const EXAMPLE_FRAME_STACK_BASE_PATH = '/scenes/ads-art/scene-02.webp';

export type ExampleFrameStackVariant = {
  key: string;
  parentKey: string;
  title: string;
  instruction: string;
  path: string;
  width: number;
  height: number;
};

// The bundled Clockmaker exploration shown on the standalone Frame Stack.
// Existing example boards hydrate these files as real storyboard takes, so
// the popup, the full editor and image-to-video all point at the same nodes.
export const EXAMPLE_FRAME_STACK_VARIANTS: ExampleFrameStackVariant[] = [
  {
    key: 'cooke-40mm',
    parentKey: 'base',
    title: 'Cooke S4 · 40 mm',
    instruction:
      'Lens — Cooke S4 · 40 mm. Warm dimensional glass; keep the full workshop geography readable.',
    path: '/frame-stack/cooke-40mm.jpg',
    width: 1829,
    height: 860,
  },
  {
    key: 'cooke-tungsten',
    parentKey: 'cooke-40mm',
    title: 'Tungsten practical',
    instruction:
      'Light — Tungsten practical. Keep the Cooke path and add stronger motivated amber light with negative fill.',
    path: '/frame-stack/cooke-tungsten.jpg',
    width: 1827,
    height: 861,
  },
  {
    key: 'zeiss-85mm',
    parentKey: 'base',
    title: 'Zeiss Super Speed · 85 mm',
    instruction:
      'Lens — Zeiss Super Speed · 85 mm. Use a tighter portrait path with compressed depth and precise focus on the gear.',
    path: '/frame-stack/zeiss-85mm.jpg',
    width: 1829,
    height: 860,
  },
  {
    key: 'zeiss-blue-hour',
    parentKey: 'zeiss-85mm',
    title: 'Blue-hour ambient',
    instruction:
      'Light — Blue-hour ambient. Keep the Zeiss path and add cool environmental wrap while the candle stays motivated.',
    path: '/frame-stack/zeiss-blue-hour.jpg',
    width: 1828,
    height: 860,
  },
];
