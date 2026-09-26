/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transformIgnorePatterns: [
    "node_modules/(?!(@react-native|react-native|@react-native-async-storage|firebase|@firebase|jose|jwks-rsa)/)"
  ],
  globals: {
    __DEV__: true
  }
};
