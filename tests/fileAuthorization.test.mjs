import assert from 'node:assert/strict'
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, parse } from 'node:path'
import test from 'node:test'
import { FileAuthorization, isWithinPath } from '../src/main/fileAuthorization.ts'

async function createFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'smartdream-file-auth-'))
  t.after(() => rm(root, { recursive: true, force: true }))

  const sandbox = join(root, 'sandbox')
  const authorized = join(root, 'authorized')
  await Promise.all([mkdir(sandbox), mkdir(authorized)])
  const authorization = new FileAuthorization()
  await authorization.initializeSandbox(sandbox)

  return { root, sandbox, authorized, authorization }
}

async function createSymlinkOrSkip(t, target, path) {
  try {
    await symlink(target, path)
    return true
  } catch (err) {
    if (
      process.platform === 'win32' &&
      ['EACCES', 'EPERM', 'ENOTSUP'].includes(err.code)
    ) {
      t.skip('Windows symlink creation is unavailable for this user')
      return false
    }
    throw err
  }
}

test('path boundaries handle filesystem roots and similarly prefixed siblings', () => {
  const root = parse(process.cwd()).root
  const project = join(root, 'work', 'project')
  assert.equal(isWithinPath(root, process.cwd()), true)
  assert.equal(isWithinPath(project, join(project, 'src')), true)
  assert.equal(isWithinPath(project, join(root, 'work', 'project-copy')), false)
})

test('a selected file grants reads only for that exact file', async (t) => {
  const fixture = await createFixture(t)
  const file = join(fixture.authorized, 'selected.txt')
  const sibling = join(fixture.authorized, 'other.txt')
  await Promise.all([writeFile(file, 'selected'), writeFile(sibling, 'other')])
  await fixture.authorization.authorizeFile(file)

  assert.equal(await fixture.authorization.resolveAuthorizedPath(file, 'read'), await realpath(file))
  await assert.rejects(fixture.authorization.resolveAuthorizedPath(file, 'write'), /未经授权/)
  await assert.rejects(fixture.authorization.resolveAuthorizedPath(sibling, 'read'), /未经授权/)
})

test('a selected directory grants descendants but not similarly prefixed paths', async (t) => {
  const fixture = await createFixture(t)
  const selected = join(fixture.root, 'project')
  const sibling = join(fixture.root, 'project-copy')
  await Promise.all([mkdir(selected), mkdir(sibling)])
  await fixture.authorization.authorizeDirectory(selected)

  assert.equal(
    await fixture.authorization.resolveAuthorizedPath(join(selected, 'new.txt'), 'write', true),
    join(await realpath(selected), 'new.txt')
  )
  await assert.rejects(
    fixture.authorization.resolveAuthorizedPath(join(sibling, 'secret.txt'), 'read', true),
    /未经授权/
  )
})

test('symlinks cannot escape an authorized directory', async (t) => {
  const fixture = await createFixture(t)
  const outside = join(fixture.root, 'outside')
  const secret = join(outside, 'secret.txt')
  const selected = join(fixture.root, 'project')
  await Promise.all([mkdir(outside), mkdir(selected)])
  await writeFile(secret, 'secret')
  if (!(await createSymlinkOrSkip(t, outside, join(selected, 'linked')))) return
  await fixture.authorization.authorizeDirectory(selected)

  await assert.rejects(
    fixture.authorization.resolveAuthorizedPath(join(selected, 'linked', 'secret.txt'), 'read'),
    /未经授权/
  )
  await assert.rejects(
    fixture.authorization.resolveAuthorizedPath(join(selected, 'linked', 'new.txt'), 'write', true),
    /未经授权/
  )
})

test('the managed sandbox cannot resolve outside the application data directory', async (t) => {
  const fixture = await createFixture(t)
  const managedRoot = join(fixture.root, 'managed')
  const outside = join(fixture.root, 'outside')
  const sandboxLink = join(managedRoot, 'sandbox-link')
  await Promise.all([mkdir(managedRoot), mkdir(outside)])
  if (!(await createSymlinkOrSkip(t, outside, sandboxLink))) return

  await assert.rejects(
    new FileAuthorization().initializeSandbox(sandboxLink, managedRoot),
    /不能指向应用数据目录之外/
  )
})
