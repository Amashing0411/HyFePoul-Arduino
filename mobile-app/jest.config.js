/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transformIgnorePatterns: [
    "node_modules/(?!(@react-native|react-native|@react-native-async-storage|firebase|@firebase)/)"
  ],
  globals: {
    __DEV__: true
  }
};
