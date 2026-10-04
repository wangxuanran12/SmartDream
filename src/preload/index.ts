import { contextBridge, ipcRenderer, webFrame, webUtils, type IpcRendererEvent } from 'electron'
import { IPC, type ElectronAPI, type ChatStreamPayload, type ChatStreamResult } from '../shared/types'

// 通过 contextBridge 暴露安全、白名单化的 API 给 renderer
// renderer 无法直接访问 Node/Electron，只能调用这里暴露的方法
const api: ElectronAPI = {
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),
  getStorageInfo: () => ipcRenderer.invoke(IPC.getStorageInfo),
  readDirectory: (dirPath) => ipcRenderer.invoke(IPC.readDirectory, dirPath),
  readFile: (filePath) => ipcRenderer.invoke(IPC.readFile, filePath),
  readFileAsDataUrl: (filePath) => ipcRenderer.invoke(IPC.readFileAsDataUrl, filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke(IPC.writeFile, filePath, content),
  createFile: (filePath) => ipcRenderer.invoke(IPC.createFile, filePath),
  getWorkspace: () => ipcRenderer.invoke(IPC.getWorkspace),
  authorizeWorkspace: (dirPath) => ipcRenderer.invoke(IPC.authorizeWorkspace, dirPath),
  authorizeFile: (filePath) => ipcRenderer.invoke(IPC.authorizeFile, filePath),
  createSpace: (name, parentDir) => ipcRenderer.invoke(IPC.createSpace, name, parentDir),
  selectDirectory: () => ipcRenderer.invoke(IPC.selectDirectory),
  selectFile: () => ipcRenderer.invoke(IPC.selectFile),
  openPath: (path) => ipcRenderer.invoke(IPC.openPath, path),
  showInFolder: (path) => ipcRenderer.invoke(IPC.showInFolder, path),
  windowMinimize: () => ipcRenderer.send(IPC.windowMinimize),
  windowMaximize: () => ipcRenderer.send(IPC.windowMaximize),
  windowClose: () => ipcRenderer.send(IPC.windowClose),
  windowIsMaximized: () => ipcRenderer.invoke(IPC.windowIsMaximized),
  onMaximizeChange: (cb) => {
    const listener = (_e, isMax: boolean): void => cb(isMax)
    ipcRenderer.on(IPC.onMaximizeChange, listener)
    return () => ipcRenderer.removeListener(IPC.onMaximizeChange, listener)
  },
  // 浏览器级缩放（F-44 字体大小）：视口单位 vh/vw 会随之正确重排，无 CSS zoom 布局错乱问题
  setZoomFactor: (factor) => webFrame.setZoomFactor(factor),
  // 拖拽文件 → 磁盘绝对路径（Electron 32+ 移除 File.path 后的官方替代，必须在 preload 内调用）
  getPathForFile: (file) => webUtils.getPathForFile(file as File),
  dbLoad: () => ipcRenderer.invoke(IPC.dbLoad),
  dbSessionUpsert: (session) => ipcRenderer.invoke(IPC.dbSessionUpsert, session),
  dbSessionDelete: (id) => ipcRenderer.invoke(IPC.dbSessionDelete, id),
  dbMessageUpsert: (msg) => ipcRenderer.invoke(IPC.dbMessageUpsert, msg),
  dbMessagesReplace: (taskId, messages) =>
    ipcRenderer.invoke(IPC.dbMessagesReplace, taskId, messages),
  dbSettingsUpsert: (patch) => ipcRenderer.invoke(IPC.dbSettingsUpsert, patch),
  dbUserUpsert: (user) => ipcRenderer.invoke(IPC.dbUserUpsert, user),
  // 流式聊天：先同步订阅 chunk 事件（按 requestId 过滤）再 invoke，settle 后移除监听
  chatStream: (payload: ChatStreamPayload, onChunk: (delta: string) => void) => {
    const listener = (_e: IpcRendererEvent, reqId: string, delta: string): void => {
      if (reqId === payload.requestId) onChunk(delta)
    }
    ipcRenderer.on(IPC.chatOnChunk, listener)
    const result = (async (): Promise<ChatStreamResult> => {
      try {
        return (await ipcRenderer.invoke(IPC.chatSend, payload)) as ChatStreamResult
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      } finally {
        ipcRenderer.removeListener(IPC.chatOnChunk, listener)
      }
    })()
    return {
      result,
      cancel: () => {
        void ipcRenderer.invoke(IPC.chatAbort, payload.requestId)
      }
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electronAPI = api
}
