module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["tsconfig.json", "tsconfig.test.json", "tsconfig.dev.json"],
    sourceType: "module",
  },
  ignorePatterns: [
    "/lib/**/*", // Ignore built files.
    "/lib-test/**/*",
  ],
  plugins: ["@typescript-eslint", "import"],
  rules: {
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-inferrable-types": "off",
    "@typescript-eslint/typedef": [
      "error",
      {
        arrowParameter: true,
        variableDeclaration: true,
      },
    ],
    "import/order": [
      "warn",
      {
        alphabetize: {
          order: "asc",
          caseInsensitive: true,
        },
        "newlines-between": "always",
      },
    ],
    "import/no-unresolved": 0,
  },
  overrides: [
    {
      // The rules engine stays pure, so it can become its own npm package (see engine/README.md)
      files: ["src/engine/**/*.ts"],
      rules: {
        "@typescript-eslint/no-explicit-any": "error",
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["firebase-*", "firebase-*/*", "express", "express-*", "../*"],
                message: "The engine can't depend on Firebase, Express or the rest of the backend.",
              },
            ],
          },
        ],
      },
    },
  ],
}
