import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Rules referenced by inline disable comments in the frontend; the plugins are not installed.
const noop = { create: () => ({}) };
const stubPlugins = {
  'react-hooks': { rules: { 'exhaustive-deps': noop } },
  '@next/next': { rules: { 'no-img-element': noop } },
};

export default tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/coverage/**', 'design/**', '**/public/vendor/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: stubPlugins,
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { disallowTypeAnnotations: false }],
      // Control characters are matched on purpose when sanitising text.
      'no-control-regex': 'off',
      'no-irregular-whitespace': ['error', { skipStrings: true, skipRegExps: true, skipTemplates: true, skipComments: true }],
    },
  },
);
