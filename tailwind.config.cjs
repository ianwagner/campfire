module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}', './packages/shared-ui/**/*.{js,jsx,ts,tsx}'],
  theme: {
    fontFamily: {
      sans: ['var(--font-primary)'],
    },
    extend: {
      fontSize: {
        base: 'var(--font-size-base)',
        lg: 'var(--font-size-lg)',
      },
      fontWeight: {
        normal: 'var(--font-weight-normal)',
        semibold: 'var(--font-weight-semibold)',
        bold: 'var(--font-weight-bold)',
      },
      spacing: {
        sm: 'var(--spacing-sm)',
        md: 'var(--spacing-md)',
        lg: 'var(--spacing-lg)',
      },
      borderRadius: {
        base: 'var(--border-radius-base)',
      },
      boxShadow: {
        base: 'var(--box-shadow-base)',
      },
    },
  },
  plugins: [],
};
