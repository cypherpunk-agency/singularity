import type { ExtensionManifest, ExtensionInfo } from './types';

const manifests: Record<string, ExtensionManifest> = import.meta.glob(
  './*/manifest.json',
  { eager: true, import: 'default' }
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const modules: Record<string, () => Promise<any>> = import.meta.glob(
  './*/index.tsx'
);

export function getExtensions(): ExtensionInfo[] {
  const extensions: ExtensionInfo[] = [];

  for (const [manifestPath, manifest] of Object.entries(manifests)) {
    const dir = manifestPath.match(/\.\/([^/]+)\//)?.[1];
    if (!dir) continue;

    const modulePath = `./${dir}/index.tsx`;
    const loader = modules[modulePath];
    if (!loader) continue;

    extensions.push({
      name: manifest.name,
      icon: manifest.icon,
      path: manifest.path,
      description: manifest.description,
      order: manifest.order,
      load: loader,
    });
  }

  return extensions.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}
