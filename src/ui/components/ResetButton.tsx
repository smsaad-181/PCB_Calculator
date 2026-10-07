interface Props {
  readonly onReset: () => void;
  readonly label?: string;
}

export function ResetButton({ onReset, label }: Props) {
  return (
    <button type="button" class="secondary" onClick={onReset}>
      {label ?? 'Reset to defaults'}
    </button>
  );
}
