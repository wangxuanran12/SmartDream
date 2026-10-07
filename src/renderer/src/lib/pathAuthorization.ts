const UNAUTHORIZED_PATH_ERROR =
  /拒绝访问\s*[:：]?\s*该路径未经授权|未经授权|授权已失效|file access not authorized|path is not authorized|access denied|permission denied/i

export function isUnauthorizedPathError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return UNAUTHORIZED_PATH_ERROR.test(message)
}

export function shouldShowPathAuthorizationActions({
  hasAuthorizedAccess,
  permissionDenied,
  readError,
  fileTreeError
}: {
  hasAuthorizedAccess: boolean
  permissionDenied: boolean
  readError: unknown
  fileTreeError: unknown
}): boolean {
  const hasError = Boolean(readError || fileTreeError)
  return (
    (!hasAuthorizedAccess && !hasError) ||
    permissionDenied ||
    isUnauthorizedPathError(readError) ||
    isUnauthorizedPathError(fileTreeError)
  )
}
