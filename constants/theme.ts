/**
 * Agricultural Professional Color Palette
 * Premium, modern design for agricultural software
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    primary: '#2E7D32',
    primaryDark: '#1B5E20',
    primaryLight: '#4CAF50',
    secondary: '#8D6E63',
    accent: '#FFA726',
    background: '#F5F5F5',
    surface: '#FFFFFF',
    text: '#212121',
    textSecondary: '#757575',
    textLight: '#9E9E9E',
    border: '#E0E0E0',
    success: '#43A047',
    warning: '#FB8C00',
    error: '#E53935',
    icon: '#757575',
    tabIconDefault: '#9E9E9E',
    tabIconSelected: '#2E7D32',
    shadow: '#000000',
  },
  dark: {
    primary: '#4CAF50',
    primaryDark: '#2E7D32',
    primaryLight: '#81C784',
    secondary: '#A1887F',
    accent: '#FFB74D',
    background: '#121212',
    surface: '#1E1E1E',
    text: '#FFFFFF',
    textSecondary: '#B0B0B0',
    textLight: '#808080',
    border: '#333333',
    success: '#66BB6A',
    warning: '#FFA726',
    error: '#EF5350',
    icon: '#B0B0B0',
    tabIconDefault: '#808080',
    tabIconSelected: '#4CAF50',
    shadow: '#000000',
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
