import { Card } from './kit/Card'

interface Props {
  question: string
  options: string[]
  onSelected: (option: string) => void
}

export default function ClarificationCard({ question, options, onSelected }: Props) {
  return (
    <Card label="Clarification" className="max-w-[85%] rounded-bl-sm">
      <div className="space-y-3">
        <p className="text-token-ink text-sm">{question}</p>
        <div className="flex flex-wrap gap-2">
          {options.map((option, idx) => (
            <button
              key={idx}
              onClick={() => onSelected(option)}
              className="bg-token-brand hover:bg-token-brand-2 text-token-on-brand text-sm font-medium px-4 py-1.5 rounded-full transition-colors active:scale-95"
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    </Card>
  )
}
