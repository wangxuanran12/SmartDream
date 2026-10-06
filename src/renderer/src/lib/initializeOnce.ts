export function initializeOnce<T>(initialize: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | undefined
  return () => {
    if (!promise) promise = Promise.resolve().then(initialize)
    return promise
  }
}
