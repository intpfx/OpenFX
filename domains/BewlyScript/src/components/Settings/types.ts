export enum MenuType {
  PluginComponentsAndPages = 'PluginComponentsAndPages',
  BilibiliFeaturesEnhancement = 'BilibiliFeaturesEnhancement',
  Appearance = 'Appearance',
  Shortcuts = 'Shortcuts',
  Compatibility = 'Compatibility',
}

export enum PluginPage {
  General = 'General',
  VideoCard = 'VideoCard',
  TopBar = 'TopBar',
  Dock = 'Dock',
  Home = 'Home',
  VolumeBalance = 'VolumeBalance',
}

export enum BilibiliFeaturesPage {
  Comments = 'Comments',
  VideoPlayback = 'VideoPlayback',
  AutoPlay = 'AutoPlay',
  VipFeatures = 'VipFeatures',
}

// Legacy enum for backward compatibility
export enum BewlyPage {
  Home = 'Home',
}

export interface MenuItem {
  value: MenuType
  icon: string
  iconActivated: string
  titleKey: string
  badge?: string
}
