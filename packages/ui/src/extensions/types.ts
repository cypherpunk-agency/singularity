export interface ExtensionManifest {
  name: string;        // Sidebar label
  icon: string;        // Emoji icon
  path: string;        // URL segment → /ext/{path}
  description?: string;
  order?: number;      // Sidebar sort (lower = higher, default 100)
}

export interface ExtensionInfo extends ExtensionManifest {
  load: () => Promise<{ default: React.ComponentType }>;
}
