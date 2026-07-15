module.exports = [
  {
    ignores: ['node_modules/**', 'dist/**', 'vendor/**', 'assets/**']
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs'
    },
    rules: {
      'no-constant-binary-expression': 'error',
      'no-dupe-else-if': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unsafe-finally': 'error',
      'no-unreachable': 'error',
      'valid-typeof': 'error'
    }
  }
];
