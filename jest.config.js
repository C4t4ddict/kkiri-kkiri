module.exports = {
  preset: 'react-native',
  setupFiles: [
    'react-native-gesture-handler/jestSetup.js',
    '<rootDir>/jest.setup.js',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native.*|@react-native(-community)?|@react-navigation)/)',
  ],
};
