"use client";

import { useLayoutEffect } from "react";

export function ColorSchemeInitializer() {
  useLayoutEffect(() => {
    try {
      const colorScheme = window.localStorage.getItem('mantine-color-scheme-value') || 'light';
      document.documentElement.setAttribute('data-mantine-color-scheme', colorScheme);
    } catch (e) {
      console.error('Failed to initialize color scheme:', e);
    }
  }, []);

  return null;
}
