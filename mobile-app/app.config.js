import { withAndroidManifest, withGradleProperties } from '@expo/config-plugins';

const withEmulatorCleartextPolicy = (config) =>
  withAndroidManifest(config, (config) => {
    const allowEmulatorCleartext =
      process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === 'true' &&
      process.env.EXPO_PUBLIC_EMULATOR_HOST === '127.0.0.1';
    const application = config.modResults.manifest.application?.[0];

    if (application) {
      application.$['android:usesCleartextTraffic'] = String(allowEmulatorCleartext);
    }

    return config;
  });

// PIP's clips are animated WebP; Android needs this switch to play them (about +3.4 MB).
const withAnimatedWebp = (config) =>
  withGradleProperties(config, (config) => {
    const props = config.modResults.filter((p) => !(p.type === 'property' && p.key === 'expo.webp.animated'));
    props.push({ type: 'property', key: 'expo.webp.animated', value: 'true' });
    config.modResults = props;
    return config;
  });

export default ({ config }) => {
  const appConfig = {
    ...config,
    android: {
      ...config.android,
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON || config.android.googleServicesFile,
    }
  };

  return withAnimatedWebp(withEmulatorCleartextPolicy(appConfig));
};
