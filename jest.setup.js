jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-blob-util', () => ({
  config: jest.fn(() => ({
    fetch: jest.fn(),
  })),
  fs: {
    dirs: {
      DownloadDir: '/tmp',
    },
  },
  android: {
    actionViewIntent: jest.fn(),
  },
  ios: {
    openDocument: jest.fn(),
  },
}));

jest.mock('@react-navigation/stack', () => {
  const React = require('react');

  return {
    createStackNavigator: () => ({
      Navigator: ({ children }) => React.Children.toArray(children)[0] || null,
      Screen: ({ component: Component }) => React.createElement(Component),
    }),
  };
});

const { Animated } = require('react-native');

Animated.timing = jest.fn(() => ({
  start: jest.fn((callback) => callback?.({ finished: true })),
  stop: jest.fn(),
  reset: jest.fn(),
}));
