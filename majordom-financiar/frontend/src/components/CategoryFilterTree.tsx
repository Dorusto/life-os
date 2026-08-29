import { useEffect, useMemo, useRef, useState } from 'react'
import type { CategoryItem } from '../lib/api'

interface Props {
  categories: CategoryItem[]
  selected: string[]
  onChange: (ids: string[]) => void
}

interface Group {
  name: string
  totalCount: number
  cats: CategoryItem[]
  visibleCats: CategoryItem[]
}

function CategoryGroupRow({
  name,
  totalCount,
  cats,
  visibleCats,
  selected,
  onChange,
}: {
  name: string
  totalCount: number
  cats: CategoryItem[]
  visibleCats: CategoryItem[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const checkboxRef = useRef<HTMLInputElement>(null)
  const allIds = cats.map(c => c.id)
  const selectedIds = allIds.filter(id => selected.includes(id))
  const allSelected = selectedIds.length === allIds.length
  const indeterminate = selectedIds.length > 0 && !allSelected

  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = indeterminate
  }, [indeterminate])

  function toggleGroup() {
    if (allSelected) {
      onChange(selected.filter(id => !allIds.includes(id)))
    } else {
      const set = new Set(selected)
      allIds.forEach(id => set.add(id))
      onChange(Array.from(set))
    }
  }

  return (
    <div>
      <label className="flex items-center gap-2 py-1.5 cursor-pointer">
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={allSelected}
          onChange={toggleGroup}
          className="accent-accent"
        />
        <span className="text-white text-sm font-medium truncate">{name}</span>
        <span className="text-muted text-xs flex-shrink-0">— {totalCount}</span>
      </label>
      <div className="ml-6 border-l border-border/40 pl-3">
        {visibleCats.map(cat => {
          const checked = selected.includes(cat.id)
          return (
            <label key={cat.id} className="flex items-center gap-2 py-1 cursor-pointer">
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onChange(
                    checked
                      ? selected.filter(id => id !== cat.id)
                      : [...selected, cat.id]
                  )
                }
                className="accent-accent"
              />
              <span className="text-muted text-sm truncate">{cat.name}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

export default function CategoryFilterTree({ categories, selected, onChange }: Props) {
  const [search, setSearch] = useState('')

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, CategoryItem[]>()
    for (const cat of categories) {
      const key = cat.group_name || 'Unexpected'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(cat)
    }

    const searchLower = search.trim().toLowerCase()
    const result: Group[] = []

    for (const [name, cats] of Array.from(map.entries())) {
      const groupMatches = searchLower ? name.toLowerCase().includes(searchLower) : false
      const matchedCats = searchLower
        ? cats.filter(c => c.name.toLowerCase().includes(searchLower))
        : cats

      if (!searchLower || groupMatches || matchedCats.length > 0) {
        result.push({
          name,
          totalCount: cats.length,
          cats,
          visibleCats: groupMatches ? cats : matchedCats,
        })
      }
    }

    result.sort((a, b) => a.name.localeCompare(b.name))
    return result
  }, [categories, search])

  return (
    <div className="flex flex-col gap-2 pt-1">
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search categories..."
        className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent disabled:opacity-50"
      />
      <div className="max-h-60 overflow-y-auto border border-border rounded-lg px-2 py-1">
        {groups.length === 0 ? (
          <p className="text-muted text-sm text-center py-4">
            No categories match your search.
          </p>
        ) : (
          groups.map(group => (
            <CategoryGroupRow
              key={group.name}
              name={group.name}
              totalCount={group.totalCount}
              cats={group.cats}
              visibleCats={group.visibleCats}
              selected={selected}
              onChange={onChange}
            />
          ))
        )}
      </div>
      <div className="flex items-center justify-between mt-1">
        <p className="text-muted text-xs">
          {selected.length} {selected.length === 1 ? 'category' : 'categories'} selected
        </p>
        {selected.length > 0 && (
          <button
            onClick={() => onChange([])}
            className="text-accent hover:text-white text-xs font-semibold"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
