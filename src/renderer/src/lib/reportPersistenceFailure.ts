export function reportPersistenceFailure(
  operation: Promise<unknown>,
  onFailure: (error: unknown) => void
): void {
  void operation.catch(onFailure)
}
