import { useState } from 'react'
import { Check, X, Plus, Pencil } from 'lucide-react'
import { applyCategoryOverview, type CategoryOverviewData } from '../lib/api'

interface Props {
  data: CategoryOverviewData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

interface PendingCategory {
  name: string
  groupName: string // display name of the target group at the time it was added
}

export default function CategoryOverviewCard({ data, onConfirmed, onCancelled }: Props) {
  const [renamedGroups, setRenamedGroups] = useState<Record<string, string>>({})
  const [renamedCategories, setRenamedCategories] = useState<Record<string, string>>({})
  const [newGroups, setNewGroups] = useState<string[]>([])
  const [newCategories, setNewCategories] = useState<PendingCategory[]>([])

  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [addingCategoryFor, setAddingCategoryFor] = useState<string | null>(null)
  const [newCategoryValue, setNewCategoryValue] = useState('')
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupValue, setNewGroupValue] = useState('')
  const [loading, setLoading] = useState(false)

  function displayGroupName(original: string): string {
    return renamedGroups[original] ?? original
  }

  function startEditGroup(original: string) {
    setEditingGroup(original)
    setEditValue(displayGroupName(original))
  }

  function saveEditGroup(original: string) {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== original) {
      setRenamedGroups(prev => ({ ...prev, [original]: trimmed }))
    } else {
      setRenamedGroups(prev => {
        const next = { ...prev }
        delete next[original]
        return next
      })
    }
    setEditingGroup(null)
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

  function submitNewCategory(groupDisplayName: string) {
    const trimmed = newCategoryValue.trim()
    if (trimmed) {
      setNewCategories(prev => [...prev, { name: trimmed, groupName: groupDisplayName }])
    }
    setNewCategoryValue('')
    setAddingCategoryFor(null)
  }

  function submitNewGroup() {
    const trimmed = newGroupValue.trim()
    if (trimmed) {
      setNewGroups(prev => [...prev, trimmed])
    }
    setNewGroupValue('')
    setAddingGroup(false)
  }

  function removePendingCategory(index: number) {
    setNewCategories(prev => prev.filter((_, i) => i !== index))
  }

  function removePendingGroup(index: number) {
    setNewGroups(prev => prev.filter((_, i) => i !== index))
  }

  const hasChanges =
    Object.keys(renamedGroups).length > 0 ||
    Object.keys(renamedCategories).length > 0 ||
    newGroups.length > 0 ||
    newCategories.length > 0

  async function handleSave() {
    setLoading(true)
    try {
      const result = await applyCategoryOverview({
        new_groups: newGroups,
        renamed_groups: renamedGroups,
        new_categories: newCategories.map(c => ({ name: c.name, group_name: c.groupName })),
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
        {data.groups.map(group => {
          const groupDisplay = displayGroupName(group.name)
          return (
            <div key={group.name}>
              {editingGroup === group.name ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={() => saveEditGroup(group.name)}
                  onKeyDown={e => { if (e.key === 'Enter') saveEditGroup(group.name); if (e.key === 'Escape') setEditingGroup(null) }}
                  className="w-full bg-background border border-accent rounded-lg px-2 py-1 text-white text-sm font-medium mb-1 outline-none"
                />
              ) : (
                <button
                  onClick={() => startEditGroup(group.name)}
                  className="flex items-center gap-1.5 text-white text-sm font-medium mb-1 hover:text-accent transition-colors"
                >
                  {groupDisplay}
                  <Pencil size={11} className="opacity-50" />
                </button>
              )}

              <div className="pl-3 border-l border-border space-y-1">
                {group.categories.map(cat => (
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

                {newCategories.map((c, i) => c.groupName === groupDisplay && (
                  <div key={`new-cat-${i}`} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-accent">{c.name}</span>
                    <button onClick={() => removePendingCategory(i)} className="text-muted hover:text-white">
                      <X size={12} />
                    </button>
                  </div>
                ))}

                {addingCategoryFor === group.name ? (
                  <input
                    autoFocus
                    placeholder="Category name"
                    value={newCategoryValue}
                    onChange={e => setNewCategoryValue(e.target.value)}
                    onBlur={() => submitNewCategory(groupDisplay)}
                    onKeyDown={e => { if (e.key === 'Enter') submitNewCategory(groupDisplay); if (e.key === 'Escape') { setAddingCategoryFor(null); setNewCategoryValue('') } }}
                    className="w-full bg-background border border-accent rounded-lg px-2 py-1 text-white text-sm outline-none"
                  />
                ) : (
                  <button
                    onClick={() => setAddingCategoryFor(group.name)}
                    className="flex items-center gap-1 text-accent text-xs opacity-90 hover:opacity-100"
                  >
                    <Plus size={11} /> add category
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {newGroups.map((g, i) => (
          <div key={`new-group-${i}`} className="flex items-center justify-between gap-2">
            <span className="text-accent text-sm font-medium">{g}</span>
            <button onClick={() => removePendingGroup(i)} className="text-muted hover:text-white">
              <X size={12} />
            </button>
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

      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancelled}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border text-muted hover:text-white hover:bg-surface-hover text-sm transition-colors disabled:opacity-40"
        >
          <X size={14} />
          Close
        </button>
        <button
          onClick={handleSave}
          disabled={loading || !hasChanges}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors active:scale-95 disabled:opacity-50"
        >
          <Check size={14} />
          Save changes
        </button>
      </div>
    </div>
  )
}
