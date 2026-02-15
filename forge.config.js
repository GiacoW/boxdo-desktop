const isMac = process.platform === 'darwin';

module.exports = {
  packagerConfig: {
    name: 'BoxDo',
    icon: './assets/icon',
    appBundleId: 'com.boxdo.app',
    asar: true,
    ...(isMac && {
      osxSign: {},
      osxNotarize: {
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_ID_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID,
      },
      extendInfo: {
        NSMicrophoneUsageDescription: 'BoxDo needs microphone access to record voice messages.',
      },
    }),
  },
  makers: [
    {
      name: '@electron-forge/maker-dmg',
      config: {
        format: 'ULFO',
      },
    },
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        setupIcon: './assets/icon.ico',
      },
    },
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'GiacoW',
          name: 'boxdo-desktop',
        },
        prerelease: false,
        draft: true,
      },
    },
  ],
};
