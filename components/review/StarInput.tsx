// Star rating links — plain <a>, no JS required.
type StarInputProps = {
  baseUrl: string; // e.g. "/r/abc123" — stars append "?rating=N"
  size?: "sm" | "lg";
};

export function StarInput({ baseUrl, size = "lg" }: StarInputProps) {
  const starSize = size === "lg" ? "2rem" : "1.25rem";
  const cellPadding = size === "lg" ? "0.5rem" : "0.25rem";

  return (
    <div
      style={{
        display: "flex",
        gap: "0.5rem",
        justifyContent: "center",
        margin: "1.5rem 0",
      }}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <a
          key={n}
          href={`${baseUrl}?rating=${n}`}
          aria-label={`Rate ${n} star${n === 1 ? "" : "s"}`}
          style={{
            fontSize: starSize,
            lineHeight: "1",
            padding: cellPadding,
            color: "#111827",
            textDecoration: "none",
            border: "1px solid #d4d4d8",
            borderRadius: "8px",
            backgroundColor: "#fafafa",
            transition: "background-color 0.15s ease",
          }}
        >
          ★
        </a>
      ))}
    </div>
  );
}
