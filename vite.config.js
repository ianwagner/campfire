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
        __VITE_FIREBASE_API_KEY__: env.VITE_FIREBASE_API_KEY,
        __VITE_FIREBASE_AUTH_DOMAIN__: env.VITE_FIREBASE_AUTH_DOMAIN,
        __VITE_FIREBASE_PROJECT_ID__: env.VITE_FIREBASE_PROJECT_ID,
        __VITE_FIREBASE_STORAGE_BUCKET__: env.VITE_FIREBASE_STORAGE_BUCKET,
        __VITE_FIREBASE_MESSAGING_SENDER_ID__: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        __VITE_FIREBASE_APP_ID__: env.VITE_FIREBASE_APP_ID,
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
