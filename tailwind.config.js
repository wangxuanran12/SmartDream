/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Codex / WorkBuddy 融合的深色主题 tokens
        surface: {
          bg: 'var(--bg)',
          panel: 'var(--panel)',
          raised: 'var(--raised)',
          border: 'var(--border)',
          hover: 'var(--hover)'
        },
        text: {
          DEFAULT: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)'
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)'
        },
        diff: {
          add: 'var(--diff-add)',
          addBg: 'var(--diff-add-bg)',
          del: 'var(--diff-del)',
          delBg: 'var(--diff-del-bg)'
        }
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'system-ui',
          'PingFang SC',
          'Microsoft YaHei',
          'sans-serif'
        ],
        mono: [
          'SF Mono',
          'JetBrains Mono',
          'Cascadia Code',
          'Menlo',
          'Consolas',
          'monospace'
        ]
      }
    }
  },
  plugins: []
}
