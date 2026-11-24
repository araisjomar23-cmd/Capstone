export default function FeedbackSuggestionNote({ count = 0 }: { count?: number }) {
  return count > 0 ? <p className="mt-2 text-xs text-gray-500">Includes {count} quick suggestion{count === 1 ? '' : 's'} selected by the participant.</p> : null
}
