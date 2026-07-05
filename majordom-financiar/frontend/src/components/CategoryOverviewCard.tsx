import { useState } from 'react'
import { X, Plus, Pencil } from 'lucide-react'
import { applyCategoryOverview, type CategoryOverviewData } from '../lib/api'
import ActionCardButtons from './ActionCardButtons'

interface Props {
  data: CategoryOverviewData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

interface PendingGroup {
  tempId: string
  name: string
}

interface PendingCategory {
  tempId: string
  name: string
  targetKey: string // 'existing:<original group name>' or 'new:<group tempId>'
}

// A row shown on the card — either a real group from Actual Budget, or a
// locally-added one pending save. Both get the same rename/add-category UI.
interface DisplayGroup {
  key: string // 'existing:<original name>' or 'new:<tempId>'
  displayName: string
  existingCategories: { id: string; name: string }[]
}

let tempIdCounter = 0
function nextTempId(): string {
  tempIdCounter += 1
  return `tmp${tempIdCounter}`
}

export default function CategoryOverviewCard({ data, onConfirmed, onCancelled }: Props) {
  const [renamedGroups, setRenamedGroups] = useState<Record<string, string>>({})
  const [renamedCategories, setRenamedCategories] = useState<Record<string, string>>({})
  const [newGroups, setNewGroups] = useState<PendingGroup[]>([])
  const [newCategories, setNewCategories] = useState<PendingCategory[]>([])

  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null)
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [addingCategoryFor, setAddingCategoryFor] = useState<string | null>(null)
  const [newCategoryValue, setNewCategoryValue] = useState('')
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupValue, setNewGroupValue] = useState('')
  const [loading, setLoading] = useState(false)

  const displayGroups: DisplayGroup[] = [
    ...data.groups.map(g => ({
      key: `existing:${g.name}`,
      displayName: renamedGroups[g.name] ?? g.name,
      existingCategories: g.categories,
    })),
    ...newGroups.map(pg => ({
      key: `new:${pg.tempId}`,
      displayName: pg.name,
      existingCategories: [],
    })),
  ]

  function startEditGroup(key: string, currentName: string) {
    setEditingGroupKey(key)
    setEditValue(currentName)
  }

  function saveEditGroup(key: string) {
    const trimmed = editValue.trim()
    if (trimmed) {
      if (key.startsWith('new:')) {
        const tempId = key.slice('new:'.length)
        setNewGroups(prev => prev.map(g => (g.tempId === tempId ? { ...g, name: trimmed } : g)))
      } else {
        const original = key.slice('existing:'.length)
        if (trimmed !== original) {
          setRenamedGroups(prev => ({ ...prev, [original]: trimmed }))
        } else {
          setRenamedGroups(prev => {
            const next = { ...prev }
            delete next[original]
            return next
          })
        }
      }
    }
    setEditingGroupKey(null)
  }

  function startEditCategory(original: string) {
    setEditingCategory(original)
    setEditValue(renamedCategories[original] ?? original)
  }

  function saveEditCategory(original: string) {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== original) {
      setRenamedCategories(prev => ({ ...prev, [original]: trimmed }))
    } else {
      setRenamedCategories(prev => {
        const next = { ...prev }
        delete next[original]
        return next
      })
    }
    setEditingCategory(null)
  }

  function submitNewCategory(targetKey: string) {
    const trimmed = newCategoryValue.trim()
    if (trimmed) {
      setNewCategories(prev => [...prev, { tempId: nextTempId(), name: trimmed, targetKey }])
    }
    setNewCategoryValue('')
    setAddingCategoryFor(null)
  }

  function submitNewGroup() {
    const trimmed = newGroupValue.trim()
    if (trimmed) {
      setNewGroups(prev => [...prev, { tempId: nextTempId(), name: trimmed }])
    }
    setNewGroupValue('')
    setAddingGroup(false)
  }

  function removePendingCategory(tempId: string) {
    setNewCategories(prev => prev.filter(c => c.tempId !== tempId))
  }

  function removePendingGroup(tempId: string) {
    setNewGroups(prev => prev.filter(g => g.tempId !== tempId))
    // Drop any pending categories that were targeting the removed group.
    setNewCategories(prev => prev.filter(c => c.targetKey !== `new:${tempId}`))
  }

  const hasChanges =
    Object.keys(renamedGroups).length > 0 ||
    Object.keys(renamedCategories).length > 0 ||
    newGroups.length > 0 ||
    newCategories.length > 0

  async function handleSave() {
    setLoading(true)
    try {
      const groupNameByKey = new Map(displayGroups.map(g => [g.key, g.displayName]))
      const result = await applyCategoryOverview({
        new_groups: newGroups.map(g => g.name),
        renamed_groups: renamedGroups,
        new_categories: newCategories.map(c => ({
          name: c.name,
          group_name: groupNameByKey.get(c.targetKey) ?? c.targetKey,
        })),
        renamed_categories: renamedCategories,
      })
      onConfirmed(result.message)
    } catch (err) {
      onConfirmed(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3 max-w-[420px] w-full space-y-3">
      <div>
        <p className="text-white font-medium">Groups &amp; categories</p>
        <p className="text-muted text-sm mt-0.5">Click a name to rename it. Add categories or groups below.</p>
      </div>

      <div className="max-h-72 overflow-y-auto space-y-3 -mx-1 px-1">
        {displayGroups.map(group => (
          <div key={group.key}>
            {editingGroupKey === group.key ? (
              <input
                autoFocus
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={() => saveEditGroup(group.key)}
                onKeyDown={e => { if (e.key === 'Enter') saveEditGroup(group.key); if (e.key === 'Escape') setEditingGroupKey(null) }}
                className="w-full bg-background border border-accent rounded-lg px-2 py-1 text-white text-sm font-medium mb-1 outline-none"
              />
            ) : (
              <div className="flex items-center justify-between gap-2 mb-1">
                <button
                  onClick={() => startEditGroup(group.key, group.displayName)}
                  className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                    group.key.startsWith('new:') ? 'text-accent' : 'text-white hover:text-accent'
                  }`}
                >
                  {group.displayName}
                  <Pencil size={11} className="opacity-50" />
                </button>
                {group.key.startsWith('new:') && (
                  <button
                    onClick={() => removePendingGroup(group.key.slice('new:'.length))}
                    className="text-muted hover:text-white"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            )}

            <div className="pl-3 border-l border-border space-y-1">
              {group.existingCategories.map(cat => (
                <div key={cat.id}>
                  {editingCategory === cat.name ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => saveEditCategory(cat.name)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEditCategory(cat.name); if (e.key === 'Escape') setEditingCategory(null) }}
                      className="w-full bg-background border border-accent rounded-lg px-2 py-1 text-white text-sm outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => startEditCategory(cat.name)}
                      className="flex items-center gap-1.5 text-muted text-sm hover:text-white transition-colors"
                    >
                      {renamedCategories[cat.name] ?? cat.name}
                      <Pencil size={10} className="opacity-40" />
                    </button>
                  )}
                </div>
              ))}

              {newCategories.filter(c => c.targetKey === group.key).map(c => (
                <div key={c.tempId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-accent">{c.name}</span>
                  <button onClick={() => removePendingCategory(c.tempId)} className="text-muted hover:text-white">
                    <X size={12} />
                  </button>
                </div>
              ))}

              {addingCategoryFor === group.key ? (
                <input
                  autoFocus
                  placeholder="Category name"
                  value={newCategoryValue}
                  onChange={e => setNewCategoryValue(e.target.value)}
                  onBlur={() => submitNewCategory(group.key)}
                  onKeyDown={e => { if (e.key === 'Enter') submitNewCategory(group.key); if (e.key === 'Escape') { setAddingCategoryFor(null); setNewCategoryValue('') } }}
                  className="w-full bg-background border border-accent rounded-lg px-2 py-1 text-white text-sm outline-none"
                />
              ) : (
                <button
                  onClick={() => setAddingCategoryFor(group.key)}
                  className="flex items-center gap-1 text-accent text-xs opacity-90 hover:opacity-100"
                >
                  <Plus size={11} /> add category
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {addingGroup ? (
        <input
          autoFocus
          placeholder="Group name"
          value={newGroupValue}
          onChange={e => setNewGroupValue(e.target.value)}
          onBlur={submitNewGroup}
          onKeyDown={e => { if (e.key === 'Enter') submitNewGroup(); if (e.key === 'Escape') { setAddingGroup(false); setNewGroupValue('') } }}
          className="w-full bg-background border border-accent rounded-lg px-3 py-2 text-white text-sm outline-none"
        />
      ) : (
        <button
          onClick={() => setAddingGroup(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-border text-accent text-sm font-medium hover:bg-surface-hover transition-colors"
        >
          <Plus size={14} /> Add group
        </button>
      )}

      <ActionCardButtons
        onConfirm={handleSave}
        onCancel={onCancelled}
        loading={loading}
        confirmDisabled={!hasChanges}
        confirmLabel="Save changes"
        cancelLabel="Close"
      />
    </div>
  )
}
