"use client"
// Copyright (c) 2025-2026 Huawei Technologies Co., Ltd.
// This program is free software, you can redistribute it and/or modify it under the terms and conditions of
// CANN Open Software License Agreement Version 2.0 (the "License").
// Please refer to the License for details. You may not use this file except in compliance with the License.
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
// INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
// See LICENSE in the root of the software repository for the full text of the License.

import { useState, useEffect, useCallback } from "react"
import { BRAND_NAME, BRAND_SLUG, BRAND_SOURCE_TYPE } from '@/lib/branding'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { saveImportHistory, type ImportHistoryEntry } from "@/components/ImportHistory"
import { Button } from "@/components/ui/button"
import { DownloadIcon, LoaderIcon, FolderIcon, FileIcon, ChevronRightIcon, ArrowUpIcon } from "lucide-react"
import { toast } from "sonner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface SessionPreview {
  id: string
  createdAt: string
  firstQuery: string | null
  turnCount: number
  model: string | null
}

interface ImportStatus {
  sessionId: string
  status: "pending" | "importing" | "success" | "error"
  message?: string
}

interface DirEntry {
  name: string
  fullPath: string
  isDir: boolean
  size: number
  isImportableFile: boolean
  importableType: string | null
}

type Step = "input" | "browse" | "select" | "importing"

function formatSize(size: number): string {
  if (size < 1024) return `${size}B`
  if (size < 1048576) return `${(size / 1024).toFixed(1)}K`
  return `${(size / 1048576).toFixed(1)}M`
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  } catch {
    return iso
  }
}

export function LocalFileImport() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("input")
  const [filePath, setFilePath] = useState("/")
  const [sourceType, setSourceType] = useState<"opencode-db" | "claude-jsonl" | typeof BRAND_SOURCE_TYPE>("opencode-db")
  const [sessions, setSessions] = useState<SessionPreview[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [importStatuses, setImportStatuses] = useState<ImportStatus[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dirEntries, setDirEntries] = useState<DirEntry[]>([])
  const [currentDir, setCurrentDir] = useState<string | null>(null)
  const [parentDir, setParentDir] = useState<string | null>(null)
  const [browseLoading, setBrowseLoading] = useState(false)

  function resetState() {
    setStep("input")
    setFilePath("/")
    setSourceType("opencode-db")
    setSessions([])
    setSelectedIds(new Set())
    setImportStatuses([])
    setError(null)
    setDirEntries([])
    setCurrentDir(null)
    setParentDir(null)
    setBrowseLoading(false)
  }

  async function browseDirectory(dirPath: string) {
    setBrowseLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/ingest/browse-directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dirPath }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to browse directory")
        setBrowseLoading(false)
        return
      }
      if (!data.isDirectory) {
        const parent = data.parentPath ?? (dirPath.split("/").slice(0, -1).join("/") || "/")
        browseDirectory(parent)
        return
      }
      setDirEntries(data.entries ?? [])
      setCurrentDir(data.currentPath)
      setParentDir(data.parentPath)
      setStep("browse")
      setBrowseLoading(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error")
      setBrowseLoading(false)
    }
  }

  async function handleDirectImportJsonl(entry: DirEntry) {
    const sessionId = entry.name.replace(/\.jsonl$/, "")
    setFilePath(entry.fullPath)
    setSourceType("claude-jsonl")
    setStep("importing")
    setImportStatuses([{ sessionId, status: "importing" }])
    try {
      const res = await fetch("/api/ingest/import-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "claude-jsonl", sessionId, filePath: entry.fullPath }),
      })
      const data = await res.json()
      if (res.ok && data.query) {
        setSessions([{ id: sessionId, createdAt: new Date().toISOString(), firstQuery: data.query, turnCount: 0, model: null }])
      }
      setImportStatuses(prev =>
        prev.map(s => s.sessionId === sessionId
          ? { ...s, status: res.ok ? "success" : "error", message: res.ok ? (data.imported ? "Imported" : "Already exists") : (data.error ?? "Import failed") }
          : s)
      )
    } catch (e) {
      setImportStatuses(prev =>
        prev.map(s => s.sessionId === sessionId ? { ...s, status: "error", message: e instanceof Error ? e.message : "Network error" } : s)
      )
    }
  }

  function handleDirEntryClick(entry: DirEntry) {
    if (entry.isDir) {
      browseDirectory(entry.fullPath)
    } else if (entry.isImportableFile) {
      if (entry.importableType === "claude-jsonl") {
        handleDirectImportJsonl(entry)
      } else {
        setFilePath(entry.fullPath)
        if (entry.importableType) {
          setSourceType(entry.importableType as "opencode-db" | "claude-jsonl" | typeof BRAND_SOURCE_TYPE)
        }
        setStep("input")
      }
    }
  }

  function handleGoUp() {
    if (parentDir) {
      browseDirectory(parentDir)
    }
  }

  async function handleLoadSessions() {
    if (!filePath.trim()) {
      setError("Please enter a file path")
      return
    }
    setError(null)

    // Claude Code JSONL single file: one session per file, skip selection step
    if (sourceType === "claude-jsonl" && filePath.trim().endsWith(".jsonl")) {
      // Derive sessionId from filename
      const filename = filePath.trim().split("/").pop() ?? ""
      const sessionId = filename.replace(/\.jsonl$/, "")
      setStep("importing")
      setImportStatuses([{ sessionId, status: "importing" }])
      try {
        const res = await fetch("/api/ingest/import-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: sourceType, sessionId, filePath: filePath.trim() }),
        })
        const data = await res.json()
        if (res.ok && data.query) {
          setSessions([{ id: sessionId, createdAt: new Date().toISOString(), firstQuery: data.query, turnCount: 0, model: null }])
        }
        setImportStatuses(prev =>
          prev.map(s => s.sessionId === sessionId
            ? { ...s, status: res.ok ? "success" : "error", message: res.ok ? (data.imported ? "Imported" : "Already exists") : (data.error ?? "Import failed") }
            : s)
        )
      } catch (e) {
        setImportStatuses(prev =>
          prev.map(s => s.sessionId === sessionId ? { ...s, status: "error", message: e instanceof Error ? e.message : "Network error" } : s)
        )
      }
      return
    }

    try {
      const res = await fetch("/api/ingest/import-file/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: sourceType, filePath: filePath.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to load sessions")
        return
      }
      setSessions(data.sessions ?? [])
      if (data.sessions?.length === 0) {
        setError("No sessions found in this database")
        return
      }
      setStep("select")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error")
    }
  }

  function handleBrowseFromInput() {
    browseDirectory(filePath.trim() || "/")
  }

  function toggleSelection(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedIds.size === sessions.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sessions.map(s => s.id)))
    }
  }

  async function handleImportSelected() {
    if (selectedIds.size === 0) return
    setStep("importing")

    const ids = Array.from(selectedIds)
    const statuses: ImportStatus[] = ids.map(id => ({
      sessionId: id,
      status: "pending" as const,
    }))
    setImportStatuses(statuses)

    const CONCURRENCY = 4
    let nextIndex = 0

    async function importOne(sessionId: string) {
      setImportStatuses(prev =>
        prev.map(s => s.sessionId === sessionId ? { ...s, status: "importing" } : s)
      )

      try {
        const res = await fetch("/api/ingest/import-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: sourceType, sessionId, filePath: filePath.trim() }),
        })
        const data = await res.json()
        if (!res.ok) {
          setImportStatuses(prev =>
            prev.map(s => s.sessionId === sessionId ? { ...s, status: "error", message: data.error ?? "Import failed" } : s)
          )
        } else {
          setImportStatuses(prev =>
            prev.map(s => s.sessionId === sessionId ? { ...s, status: "success", message: data.imported ? "Imported" : "Already exists" } : s)
          )
        }
      } catch (e) {
        setImportStatuses(prev =>
          prev.map(s => s.sessionId === sessionId ? { ...s, status: "error", message: e instanceof Error ? e.message : "Network error" } : s)
        )
      }
    }

    // Concurrent pool: run up to CONCURRENCY imports at a time
    const workers = Array.from({ length: Math.min(CONCURRENCY, ids.length) }, async () => {
      while (nextIndex < ids.length) {
        const idx = nextIndex++
        await importOne(ids[idx])
      }
    })

    await Promise.all(workers)
  }

  const handleDone = useCallback(() => {
    const hasSuccess = importStatuses.some(s => s.status === "success")
    if (hasSuccess) {
      const entries: ImportHistoryEntry[] = importStatuses.map(s => {
        const session = sessions.find(p => p.id === s.sessionId)
        return {
          taskId: s.sessionId,
          importedAt: new Date().toISOString(),
          turnCount: session?.turnCount ?? 0,
          status: s.status === "success" ? "success" as const : "error" as const,
          query: session?.firstQuery ?? null,
          filePath: filePath.trim(),
          sourceType,
        }
      })
      saveImportHistory(entries)
      toast.success("Import complete", { description: `${entries.filter(e => e.status === "success").length} sessions imported.` })
    }
    setOpen(false)
    resetState()
    if (hasSuccess) {
      window.location.reload()
    }
  }, [importStatuses, sessions, filePath, sourceType])

  const allSuccessOrError = importStatuses.length > 0 && importStatuses.every(s => s.status === "success" || s.status === "error")

  // Auto-redirect to home after import completes
  useEffect(() => {
    if (allSuccessOrError) {
      const timer = setTimeout(handleDone, 1000)
      return () => clearTimeout(timer)
    }
  }, [allSuccessOrError, handleDone])

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetState() }}>
      <DialogTrigger render={<Button variant="default" size="lg" className="gap-2 font-semibold"><DownloadIcon className="size-4" />Import Session</Button>} />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Session</DialogTitle>
          <DialogDescription>
            {step === "input" && "Import session data from local files"}
            {step === "browse" && "Browse directories and select a file to import"}
            {step === "select" && "Select sessions to import"}
            {step === "importing" && `Importing ${importStatuses.filter(s => s.status === "success" || s.status === "error").length}/${importStatuses.length} sessions...`}
          </DialogDescription>
        </DialogHeader>

        {step === "input" && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Source Type</label>
              <div className="flex gap-2">
                <Button
                  variant={sourceType === "opencode-db" ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setSourceType("opencode-db"); setError(null) }}
                >
                  opencode (SQLite)
                </Button>
                <Button
                  variant={sourceType === "claude-jsonl" ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setSourceType("claude-jsonl"); setError(null) }}
                >
                  Claude Code (JSONL)
                </Button>
                <Button
                  variant={sourceType === BRAND_SOURCE_TYPE ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setSourceType(BRAND_SOURCE_TYPE); setError(null) }}
                >
                  {BRAND_NAME} (SQLite)
                </Button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">File Path</label>
              <div className="flex gap-2">
                <Input
                  placeholder={sourceType === "opencode-db" ? "/path/to/sessions.db" : sourceType === "claude-jsonl" ? "/path/to/session.jsonl or /path/to/sessions-dir" : `/path/to/${BRAND_SLUG}_session_xxx.db`}
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBrowseFromInput}
                  className="gap-1.5 shrink-0"
                >
                  <FolderIcon className="size-3.5" />
                  Browse
                </Button>
              </div>
              <div className="mt-2 text-xs text-muted-foreground space-y-1">
                {sourceType === "opencode-db" && (
                  <p>opencode (SQLite DB): ~/.local/share/opencode/sessions.db</p>
                )}
                {sourceType === "claude-jsonl" && (
                  <>
                    <p>Claude Code (JSONL): ~/.claude/projects/&lt;hash&gt;/sessions/&lt;id&gt;.jsonl</p>
                    <p>Or point to a directory to scan all .jsonl files</p>
                  </>
                )}
                {sourceType === BRAND_SOURCE_TYPE && (
                  <p>{BRAND_NAME} 导出文件: {BRAND_SLUG}_session_xxx.db</p>
                )}
                <p className="text-blue-500 dark:text-blue-400">Click Browse to explore directories and select files interactively</p>
              </div>
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          </div>
        )}

        {step === "browse" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium bg-muted/50 px-3 py-2 rounded-md">
              <FolderIcon className="size-4 text-blue-500" />
              <span className="truncate">{currentDir}</span>
            </div>
            {parentDir && (
              <Button variant="ghost" size="sm" onClick={handleGoUp} className="gap-1.5">
                <ArrowUpIcon className="size-3.5" />
                Parent directory
              </Button>
            )}
            {browseLoading ? (
              <div className="flex items-center gap-2 py-4">
                <LoaderIcon className="size-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Loading directory...</span>
              </div>
            ) : (
              <div className="max-h-[320px] overflow-y-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[24px]"></TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-[80px]">Size</TableHead>
                      <TableHead className="w-[100px]">Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dirEntries.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                          Empty directory
                        </TableCell>
                      </TableRow>
                    )}
                    {dirEntries.map(entry => (
                      <TableRow
                        key={entry.fullPath}
                        className="cursor-pointer hover:bg-primary/5"
                        onClick={() => handleDirEntryClick(entry)}
                      >
                        <TableCell>
                          {entry.isDir
                            ? <FolderIcon className="size-4 text-blue-500" />
                            : entry.isImportableFile
                              ? <FileIcon className="size-4 text-emerald-500" />
                              : <FileIcon className="size-4 text-muted-foreground" />
                          }
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className={entry.isImportableFile ? "font-medium text-emerald-600 dark:text-emerald-400" : ""}>
                            {entry.name}
                          </span>
                          {entry.isDir && <ChevronRightIcon className="size-3.5 ml-1 inline text-muted-foreground" />}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">
                          {entry.isDir ? "" : formatSize(entry.size)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {entry.isDir ? (
                            <span className="text-blue-500 dark:text-blue-400">Directory</span>
                          ) : entry.isImportableFile ? (
                            <span className="text-emerald-500 dark:text-emerald-400">
                              {entry.importableType === BRAND_SOURCE_TYPE ? BRAND_NAME : entry.importableType === "opencode-db" ? "SQLite DB" : "JSONL"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">{entry.name.includes('.') ? entry.name.split('.').pop()! : "File"}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => { setStep("input"); setError(null) }}>
                Back
              </Button>
              <span className="text-xs text-muted-foreground">
                {dirEntries.filter(e => e.isImportableFile).length} importable files found
              </span>
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          </div>
        )}

        {step === "select" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Checkbox checked={selectedIds.size === sessions.length && sessions.length > 0} onCheckedChange={toggleAll} />
              <span className="text-sm text-muted-foreground">Select all ({sessions.length} sessions)</span>
            </div>
            <div className="max-h-[320px] overflow-y-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead className="max-w-[200px]">First Query</TableHead>
                    <TableHead>Turns</TableHead>
                    <TableHead>Model</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map(s => (
                    <TableRow key={s.id} className={selectedIds.has(s.id) ? "bg-primary/5" : ""}>
                      <TableCell>
                        <Checkbox checked={selectedIds.has(s.id)} onCheckedChange={() => toggleSelection(s.id)} />
                      </TableCell>
                      <TableCell className="text-xs">{formatTime(s.createdAt)}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs">
                        {s.firstQuery ?? "(empty)"}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">{s.turnCount}</TableCell>
                      <TableCell className="text-xs max-w-[160px] truncate">{s.model ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {selectedIds.size === 0 && (
              <p className="text-sm text-muted-foreground">Select at least one session to import</p>
            )}
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          </div>
        )}

        {step === "importing" && (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            <div className="flex items-center gap-2 text-xs text-muted-foreground pb-1 border-b">
              <LoaderIcon className="size-3.5 animate-spin" />
              <span>
                Progress: {importStatuses.filter(s => s.status === "success" || s.status === "error").length}/{importStatuses.length}
              </span>
            </div>
            {importStatuses.map(s => {
              const session = sessions.find(p => p.id === s.sessionId)
              const label = session?.firstQuery ?? s.sessionId
              return (
                <div key={s.sessionId} className="flex items-center gap-2 text-sm border-b pb-1.5 last:border-0">
                  <span className="flex-1 truncate">{label}</span>
                  {s.status === "pending" && <span className="text-muted-foreground">Waiting</span>}
                  {s.status === "importing" && (
                    <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1">
                      <LoaderIcon className="size-3 animate-spin" />
                      Importing...
                    </span>
                  )}
                  {s.status === "success" && <span className="text-emerald-600 dark:text-emerald-400">{s.message}</span>}
                  {s.status === "error" && <span className="text-red-600 dark:text-red-400">{s.message}</span>}
                </div>
              )
            })}
          </div>
        )}

        <DialogFooter>
          {step === "input" && (
            <Button onClick={handleLoadSessions} disabled={!filePath.trim()}>
              {sourceType === "claude-jsonl" && filePath.trim().endsWith(".jsonl") ? "Import" : "Load Sessions"}
            </Button>
          )}
          {step === "select" && (
            <>
              <Button variant="outline" onClick={() => { setStep("input"); setError(null) }}>
                Back
              </Button>
              <Button onClick={handleImportSelected} disabled={selectedIds.size === 0}>
                Import {selectedIds.size > 0 ? `${selectedIds.size} Selected` : ""}
              </Button>
            </>
          )}
          {step === "importing" && allSuccessOrError && (
            <Button onClick={handleDone}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
