import type { Config } from "jest";

const config: Config = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": ["ts-jest", { tsconfig: "<rootDir>/../tsconfig.json" }],
  },
  collectCoverageFrom: ["**/*.(t|j)s"],
  coverageDirectory: "../coverage",
  testEnvironment: "node",
  moduleNameMapper: {
    // resolve .js extensions → .ts (NestJS ESM-style imports ใน CommonJS test env)
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^@emulfast/db$": "<rootDir>/../../../packages/db/src/index.ts",
    "^@emulfast/shared$": "<rootDir>/../../../packages/shared/src/index.ts",
  },
};

export default config;
