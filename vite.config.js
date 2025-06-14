const { defineConfig, loadEnv } = require('vite');
const react = require('@vitejs/plugin-react');
const fs = require('fs');
const path = require('path');

function firebaseMessagingSwPlugin() {
  let config;
  return {
    name: 'firebase-messaging-sw',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    buildStart() {
      const env = loadEnv(config.mode, config.root, '');

      const templatePath = path.resolve(
        config.root,
        'public/firebase-messaging-sw.js.template'
      );
      const outputPath = path.resolve(
        config.root,
        'public/firebase-messaging-sw.js'
      );

      if (!fs.existsSync(templatePath)) {
        this.error(`Template not found at ${templatePath}`);
      }

      let content = fs.readFileSync(templatePath, 'utf8');

      const replacements = {
        __VITE_API_KEY__: env.VITE_API_KEY,
        __VITE_AUTH_DOMAIN__: env.VITE_AUTH_DOMAIN,
        __VITE_PROJECT_ID__: env.VITE_PROJECT_ID,
        __VITE_STORAGE_BUCKET__: env.VITE_STORAGE_BUCKET,
        __VITE_MESSAGING_SENDER_ID__: env.VITE_MESSAGING_SENDER_ID,
        __VITE_APP_ID__: env.VITE_APP_ID,
      };

      for (const [token, value] of Object.entries(replacements)) {
        content = content.replace(new RegExp(token, 'g'), value || '');
      }

      fs.writeFileSync(outputPath, content);
    },
  };
}

module.exports = defineConfig({
  plugins: [react(), firebaseMessagingSwPlugin()],
});
