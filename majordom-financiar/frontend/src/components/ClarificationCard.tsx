interface Props {
  question: string
  options: string[]
  onSelected: (option: string) => void
}

export default function ClarificationCard({ question, options, onSelected }: Props) {
  return (
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3 max-w-[80%] space-y-3">
      <p className="text-white text-sm">{question}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option, idx) => (
          <button
            key={idx}
            onClick={() => onSelected(option)}
            className="bg-accent hover:bg-accent-hover text-white text-sm font-medium px-4 py-1.5 rounded-full transition-colors active:scale-95"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}
