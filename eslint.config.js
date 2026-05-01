import globals from "globals";

export default [
  // Backend — Node.js files
  {
    files: ["src/backend/**/*.js", "scripts/**/*.js", "worker.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "error",
    },
  },

  // Frontend — browser files
  {
    files: ["src/frontend/**/*.js", "src/frontend/**/*.jsx"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "error",
    },
  },
];
