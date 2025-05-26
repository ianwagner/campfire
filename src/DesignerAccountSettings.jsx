import React from 'react';
import ThemeToggle from './ThemeToggle';
import useTheme from './useTheme';

const DesignerAccountSettings = () => {
  const { theme, setTheme } = useTheme();
  return (
    <div className="min-h-screen p-4 space-y-4">
      <h1 className="text-2xl mb-4">Account Settings</h1>
      <div>
        <label className="block mb-1 text-sm font-medium">Theme</label>
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          className="border rounded px-2 py-1"
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
      <p className="text-sm">Use the button to preview:</p>
      <ThemeToggle />
    </div>
  );
};

export default DesignerAccountSettings;
