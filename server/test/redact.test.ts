import { homedir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { describeTool } from '../src/describe'
import { redact } from '../src/redact'

const HOME = 'C:\\Users\\duduo'

describe('redact: home folder', () => {
  it('turns the home folder into ~ in every spelling', () => {
    expect(redact('cat C:\\Users\\duduo\\a.txt', HOME)).toBe('cat ~\\a.txt')
    expect(redact('cat C:/Users/duduo/a.txt', HOME)).toBe('cat ~/a.txt')
    expect(redact('cat /c/Users/duduo/a.txt', HOME)).toBe('cat ~/a.txt')
    expect(redact('cat c:/users/DUDUO/a.txt', HOME)).toBe('cat ~/a.txt')
  })

  it('uses os.homedir() by default', () => {
    expect(redact(`ls ${homedir()}`)).toBe('ls ~')
  })

  it('handles any user folder generically', () => {
    expect(redact('D:\\Users\\maria\\proj', HOME)).toBe('~\\proj')
    expect(redact('/home/joao/app', HOME)).toBe('~/app')
    expect(redact('/Users/ana/app', HOME)).toBe('~/app')
    expect(redact('/c/Users/outro/x', HOME)).toBe('~/x')
  })

  it('does not touch relative paths that merely contain home', () => {
    expect(redact('cat src/home/page.ts', HOME)).toBe('cat src/home/page.ts')
  })

  it('handles user folders with spaces and accents', () => {
    expect(redact('type C:\\Users\\João Silva\\x', HOME)).toBe('type ~\\x')
    expect(redact('cat C:/Users/Ana Maria/x', HOME)).toBe('cat ~/x')
    expect(redact('cat /c/Users/João Silva/x', HOME)).toBe('cat ~/x')
    expect(redact('cat "C:\\Users\\João Silva"', HOME)).toBe('cat "~"')
  })

  it('does not swallow the rest of the line after the user folder', () => {
    expect(redact('cd C:\\Users\\João Silva', HOME)).toBe('cd ~')
    expect(redact('ls C:/Users/Ana && npm test', HOME)).toBe('ls ~ && npm test')
    expect(redact('ls C:/Users/Ana Maria | wc -l', HOME)).toBe('ls ~ | wc -l')
    expect(redact('ls C:/Users/Ana; echo hi', HOME)).toBe('ls ~; echo hi')
  })

  it('handles UNC/WSL paths', () => {
    expect(redact('cat \\\\wsl$\\Ubuntu\\home\\nome\\x', HOME)).toBe('cat ~\\x')
    expect(redact('cat \\\\wsl.localhost\\Ubuntu\\home\\nome\\x', HOME)).toBe('cat ~\\x')
    expect(redact('cat /mnt/c/Users/nome/x', HOME)).toBe('cat ~/x')
  })

  it('does not touch /home or /Users inside URLs', () => {
    expect(redact('curl https://site.com/home/x', HOME)).toBe('curl https://site.com/home/x')
    expect(redact('curl https://site.com/Users/x', HOME)).toBe('curl https://site.com/Users/x')
    expect(redact('open "/home/joao/x"', HOME)).toBe('open "~/x"')
    expect(redact('PATH=/home/joao/bin', HOME)).toBe('PATH=~/bin')
  })
})

describe('redact: secrets', () => {
  it('masks values after secret-like keys', () => {
    expect(redact('API_KEY=abc123 npm start', HOME)).toBe('API_KEY=••• npm start')
    expect(redact('export GITHUB_TOKEN=abc123', HOME)).toBe('export GITHUB_TOKEN=•••')
    expect(redact('password: "hunter 2"', HOME)).toBe('password: •••')
    expect(redact('senha=123 secret=x api-key=y', HOME)).toBe('senha=••• secret=••• api-key=•••')
    expect(redact('login --password hunter2', HOME)).toBe('login --password •••')
  })

  it('masks Authorization headers and Bearer tokens', () => {
    expect(redact('curl -H "Authorization: Bearer abc.def-123" https://x.io', HOME)).toBe(
      'curl -H "Authorization: •••" https://x.io',
    )
    expect(redact('curl -H "X: y" -H "Bearer zzz"', HOME)).not.toContain('zzz')
    expect(redact('echo Bearer abc123', HOME)).toBe('echo Bearer •••')
  })

  it('masks JSON values and AWS secrets', () => {
    expect(redact('{"token":"abc"}', HOME)).toBe('{"token":•••}')
    expect(redact('AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG', HOME)).toBe('AWS_SECRET_ACCESS_KEY=•••')
  })

  it('masks Authorization: Basic', () => {
    expect(redact('curl -H "Authorization: Basic dXNlcjpwYXNz" x.io', HOME)).toBe(
      'curl -H "Authorization: •••" x.io',
    )
  })

  it('masks JWTs and private key blocks', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.SflKxwRJSMeKKF2QT4fwpM'
    expect(redact(`echo ${jwt} done`, HOME)).toBe('echo ••• done')
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\nabc=\n-----END RSA PRIVATE KEY-----'
    expect(redact(`key:\n${pem}\nnext`, HOME)).toBe('key:\n•••\nnext')
    expect(redact('-----BEGIN PRIVATE KEY-----\nMIIE', HOME)).toBe('•••')
  })

  it('masks Google, Stripe and npm keys', () => {
    for (const key of [
      `AIza${'a1B_-'.repeat(7)}`,
      `sk_live_${'a'.repeat(24)}`,
      `sk_test_${'B'.repeat(24)}`,
      `rk_live_${'c'.repeat(24)}`,
      `npm_${'a1'.repeat(18)}`,
    ]) {
      expect(redact(`echo ${key} done`, HOME)).toBe('echo ••• done')
    }
  })

  it('masks credentials in URLs', () => {
    expect(redact('git clone https://user:pass@github.com/a/b', HOME)).toBe('git clone https://•••@github.com/a/b')
  })

  it('masks well-known key formats', () => {
    for (const key of [
      'sk-ant-api03-abcdefghijklmnop',
      `ghp_${'a'.repeat(36)}`,
      `github_pat_${'A1_'.repeat(10)}`,
      'xoxb-1234567890-abcdef',
      'AKIAIOSFODNN7EXAMPLE',
    ]) {
      expect(redact(`echo ${key} done`, HOME)).toBe('echo ••• done')
    }
  })
})

describe('redact: ordinary text stays readable', () => {
  it.each([
    'npm test',
    'git status',
    'cd ~/proj',
    'git commit -m "fix token handling"',
    'grep -rn foo src/',
    'Corrige o login',
  ])('keeps %s', text => {
    expect(redact(text, HOME)).toBe(text)
  })
})

describe('describeTool', () => {
  it('redacts the Bash command and the subagent description', () => {
    expect(describeTool('Bash', { command: 'cat C:/Users/duduo/.env' })).not.toContain('duduo')
    expect(describeTool('Agent', { description: 'ler /home/zé/x TOKEN=abc' })).not.toContain('abc')
  })
})
