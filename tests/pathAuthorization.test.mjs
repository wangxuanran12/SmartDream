import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isUnauthorizedPathError,
  shouldShowPathAuthorizationActions
} from '../src/renderer/src/lib/pathAuthorization.ts'

test('recognizes wrapped main-process unauthorized path errors', () => {
  assert.equal(
    isUnauthorizedPathError(
      "Error invoking remote method 'fs:read-directory': Error: 拒绝访问：该路径未经授权"
    ),
    true
  )
})

test('recognizes authorization errors but not missing files or folders', () => {
  assert.equal(isUnauthorizedPathError('文件授权已失效，请重新选择并授权此文件。'), true)
  assert.equal(isUnauthorizedPathError('ENOENT: no such file or directory'), false)
  assert.equal(isUnauthorizedPathError('目标不是普通文件'), false)
})

test('shows actions for an unbound task only when there is no read error', () => {
  assert.equal(
    shouldShowPathAuthorizationActions({
      hasAuthorizedAccess: false,
      permissionDenied: false,
      readError: null,
      fileTreeError: null
    }),
    true
  )
  assert.equal(
    shouldShowPathAuthorizationActions({
      hasAuthorizedAccess: false,
      permissionDenied: false,
      readError: 'ENOENT: no such file or directory',
      fileTreeError: null
    }),
    false
  )
})

test('shows actions for unauthorized paths but not missing paths in an authorized space', () => {
  assert.equal(
    shouldShowPathAuthorizationActions({
      hasAuthorizedAccess: true,
      permissionDenied: false,
      readError: null,
      fileTreeError:
        "Error invoking remote method 'fs:read-directory': Error: 拒绝访问：该路径未经授权"
    }),
    true
  )
  assert.equal(
    shouldShowPathAuthorizationActions({
      hasAuthorizedAccess: true,
      permissionDenied: false,
      readError: null,
      fileTreeError: "Error: ENOENT: no such file or directory, realpath '/missing/folder'"
    }),
    false
  )
})
