module.exports = {
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    root: true,
    rules: {
        "@typescript-eslint/no-inferrable-types": "off",
        "@typescript-eslint/typedef": [
            "error",
            {
                "arrowParameter": true,
                "variableDeclaration": true
            }
        ],
        "@typescript-eslint/no-explicit-any": "off",
    }
};