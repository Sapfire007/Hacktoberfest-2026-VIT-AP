/**
 * Keyboard Configuration
 * 
 * Global configuration for keyboard behavior across the app
 * Import this file early in your app's entry point
 */

import { Platform } from 'react-native';

export const KEYBOARD_CONFIG = {
  // Vertical offset for iOS (accounts for header height)
  iosOffset: 90,
  
  // Behavior type
  behavior: Platform.OS === 'ios' ? 'padding' as const : 'height' as const,
  
  // Whether keyboard should persist taps
  keyboardShouldPersistTaps: 'handled' as const,
  
  // Enable keyboard aware scrolling
  enableAutomaticScroll: true,
  
  // Extra scroll offset when input is focused
  extraScrollHeight: 20,
};
