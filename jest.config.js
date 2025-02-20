/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest'],
  },
  moduleNameMapper: {
    // Maps ./types.js to ./types.ts
    '^./types.js': './types.ts',
  },
  moduleFileExtensions: ['ts', 'js'],
};