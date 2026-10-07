import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeApiBaseUrl } from '../src/main/apiConfig.ts'

test('normalizes HTTPS API base URLs', () => {
  assert.equal(
    normalizeApiBaseUrl(' https://api.example.com/v1/// ', false),
    'https://api.example.com/v1'
  )
})

test('rejects remote HTTP URLs even when local debugging is enabled', () => {
  assert.throws(() => normalizeApiBaseUrl('http://api.example.com/v1', true), /必须使用 HTTPS/)
})

test('allows loopback HTTP only when explicitly enabled', () => {
  assert.throws(() => normalizeApiBaseUrl('http://127.0.0.1:8080/v1', false), /必须使用 HTTPS/)
  assert.equal(
    normalizeApiBaseUrl('http://localhost:8080/v1/', true),
    'http://localhost:8080/v1'
  )
})

test('rejects credentials embedded in the API URL', () => {
  assert.throws(() => normalizeApiBaseUrl('https://user:secret@api.example.com', false), /不能包含/)
})

test('rejects query strings and hashes in base URLs', () => {
  assert.throws(() => normalizeApiBaseUrl('https://api.example.com/v1?key=demo', false), /不能包含查询参数或哈希片段/)
  assert.throws(() => normalizeApiBaseUrl('https://api.example.com/v1#frag', false), /不能包含查询参数或哈希片段/)
})

test('rejects unsupported schemes', () => {
  assert.throws(() => normalizeApiBaseUrl('ftp://api.example.com/v1', false), /只能使用 http:\/\/ 或 https:\/\//)
})

test('rejects missing or malformed URLs', () => {
  assert.throws(() => normalizeApiBaseUrl('', false), /不能为空/)
  assert.throws(() => normalizeApiBaseUrl('not a URL', false), /格式无效/)
})