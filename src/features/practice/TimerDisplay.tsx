export function formatStopwatch(milliseconds: number) {
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1_000);
  const remainingMilliseconds = milliseconds % 1_000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(remainingMilliseconds).padStart(3, "0")}`;
}

export function TimerDigits({
  values,
  units,
  className,
}: {
  values: string[];
  units: string[];
  className: string;
}) {
  return (
    <span className={`timer-digits ${className}`}>
      {values.map((value, index) => (
        <span className="timer-group" key={units[index]}>
          {index > 0 && <span className="timer-separator">:</span>}
          <span className="timer-unit">
            <span className="timer-value">{value}</span>
            <span className="timer-unit-label">{units[index]}</span>
          </span>
        </span>
      ))}
    </span>
  );
}
