import { useState } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  File,
  FileCode2,
  FileJson,
  FileText,
  FileType2
} from 'lucide-react'
import type { FileNode } from '@shared/types'

function FileIcon({ node, expanded }: { node: FileNode; expanded: boolean }): JSX.Element {
  if (node.isDirectory) {
    return expanded ? (
      <FolderOpen size={15} className="shrink-0 text-accent" />
    ) : (
      <Folder size={15} className="shrink-0 text-text-secondary" />
    )
  }
  switch (node.extension) {
    case 'ts':
    case 'tsx':
      return <FileType2 size={15} className="shrink-0 text-[#3178c6]" />
    case 'js':
    case 'jsx':
      return <FileCode2 size={15} className="shrink-0 text-[#f1e05a]" />
    case 'json':
      return <FileJson size={15} className="shrink-0 text-[#cbcb41]" />
    case 'md':
      return <FileText size={15} className="shrink-0 text-text-secondary" />
    default:
      return <File size={15} className="shrink-0 text-text-muted" />
  }
}

interface TreeItemProps {
  node: FileNode
  depth: number
  onSelect: (node: FileNode) => void
  selectedPath: string | null
}

function TreeItem({ node, depth, onSelect, selectedPath }: TreeItemProps): JSX.Element {
  const [expanded, setExpanded] = useState(depth < 1)
  const hasChildren = node.isDirectory && (node.children?.length ?? 0) > 0
  const isSelected = selectedPath === node.path

  return (
    <div>
      <div
        className={`group flex cursor-pointer items-center gap-1.5 rounded-md py-[3px] pr-2 text-[13px] leading-5 ${
          isSelected ? 'bg-surface-hover text-text-primary' : 'text-text-secondary hover:bg-surface-hover'
        }`}
        style={{ paddingLeft: depth * 14 + 8 }}
        onClick={() => {
          if (node.isDirectory) {
            setExpanded(!expanded)
          } else {
            onSelect(node)
          }
        }}
      >
        {node.isDirectory ? (
          hasChildren ? (
            expanded ? (
              <ChevronDown size={14} className="shrink-0 text-text-muted" />
            ) : (
              <ChevronRight size={14} className="shrink-0 text-text-muted" />
            )
          ) : (
            <span className="w-[14px]" />
          )
        ) : (
          <span className="w-[14px]" />
        )}
        <FileIcon node={node} expanded={expanded} />
        <span className="truncate">{node.name}</span>
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children!.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function FileTree({
  root,
  onSelect,
  selectedPath
}: {
  root: FileNode
  onSelect: (node: FileNode) => void
  selectedPath: string | null
}): JSX.Element {
  return (
    <div className="select-none py-1">
      <div className="flex items-center gap-1.5 px-2 py-1 text-[12px] font-medium text-text-muted">
        <span className="truncate">{root.name}</span>
      </div>
      {root.children?.map((child) => (
        <TreeItem
          key={child.path}
          node={child}
          depth={0}
          onSelect={onSelect}
          selectedPath={selectedPath}
        />
      ))}
    </div>
  )
}
