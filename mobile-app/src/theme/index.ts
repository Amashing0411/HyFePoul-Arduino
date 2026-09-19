// Static layout properties
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const layout = {
  borderRadius: 12, // Increased for a more modern look
  minTouchTarget: 44,
};

// Re-export colors from the hook as a fallback for non-React files if needed,
// but components should use useTheme().
export const fallbackColors = {
  primary: '#2f95dc',
  background: '#f4f6f8',
  card: '#ffffff',
  text: '#1e293b',
  textSecondary: '#64748b',
  border: '#e2e8f0',
  success: '#10b981',
  successLight: '#d1fae5',
  warning: '#f59e0b',
  warningLight: '#fef3c7',
  error: '#ef4444',
  errorLight: '#fee2e2',
  neutral: '#94a3b8',
  neutralLight: '#f1f5f9',
};
